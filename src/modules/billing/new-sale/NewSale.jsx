import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input, MoneyInput, PhoneInput, SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { money, grams } from "@/_shared/utils";
import { billingService } from "@/modules/billing/billingService";
import { useAuth } from "@/_shared/AuthContext";
import { customerService } from "@/modules/customers/customerService";
import { enrollmentService } from "@/modules/plan/enrollment/enrollmentService";

// New Sale / customer billing. Backend is the sole financial authority: this
// screen only sends inputs/overrides (applicable rate/g, making, wastage, GST,
// discount) and renders the quote/sale the backend returns — no money is
// computed here. Gold Profit is internal margin and is never shown as a line;
// it is only used as the maximum a discount may consume. Vendor cost/name and
// Product Code are never shown. Scheme redemption reuses the existing OTP-gated
// atomic multi-scheme endpoint; scheme credit settles the invoice separately
// from cash (SalePayment).

const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];
const PAYMENT_METHOD_LABEL = { CASH: "Cash", UPI: "UPI", CARD: "Card", BANK_TRANSFER: "Bank Transfer", OTHER: "Other" };
const PAYMENT_STATUSES = ["PAID", "PARTIAL", "PENDING"];
const PAYMENT_STATUS_LABEL = { PAID: "Paid in full", PARTIAL: "Partial", PENDING: "Pending (unpaid)" };

const num = (s) => (s === "" || s == null ? 0 : Math.max(0, Number(s) || 0));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Charge label for a Making/Wastage row: "3%", "₹120.00/g" or "" (fixed). */
function chargePct(type, value) {
  if (type === "PERCENTAGE") return `${Number(value)}%`;
  if (type === "PER_GRAM") return `${money(value)}/g`;
  return "";
}

// Server validation messages carry raw amounts ("90462.63"). Grouping them the
// Indian way keeps one number format across the screen, so a figure quoted in
// an error can be compared with the bill beside it at a glance.
function formatAmountsInText(text) {
  return String(text ?? "").replace(
    /\b\d{4,}(?:\.\d{1,2})?\b/g,
    (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  );
}

export default function NewSale() {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [code, setCode] = useState("");
  const [productCode, setProductCode] = useState("");
  const [product, setProduct] = useState(null);
  const [goldRate, setGoldRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [creating, setCreating] = useState(false);

  // Editable pricing inputs (seeded once from the first quote).
  const [rate, setRate] = useState("");
  const [makingVal, setMakingVal] = useState("");
  const [wastageVal, setWastageVal] = useState("");
  const [discount, setDiscount] = useState("");
  const [gst, setGst] = useState(true);

  // Sale mode (doc Point 12). ONLINE = live gold rate, engine price, everything
  // locked. OFFLINE (full cash) = editable gold rate, customer price and gold
  // profit %. customerPrice/goldProfit are two bound views of the same margin;
  // priceDriver says which the admin is currently steering with.
  const [saleMode, setSaleMode] = useState(null); // null until the admin picks Online/Offline
  const [customerPrice, setCustomerPrice] = useState("");
  const [goldProfit, setGoldProfit] = useState("");
  // Why the last re-quote was refused. Held separately from the breakdown so
  // the previous good figures stay on screen while the reason is stated.
  const [quoteError, setQuoteError] = useState("");
  const [priceDriver, setPriceDriver] = useState("ENGINE"); // ENGINE | PRICE | PROFIT
  // Below-cost approval. The backend refuses a customer price under the item's
  // cost unless the sale carries an explicit approval and a reason, and records
  // that approval in the audit trail. Clearance and damaged stock are real, so
  // this is a gate with a key, not a wall.
  const [allowBelowCost, setAllowBelowCost] = useState(false);
  const [belowCostReason, setBelowCostReason] = useState("");
  // The published rate for this item's purity, captured on the first quote.
  // After an override the quote echoes the override back as goldRateApplied,
  // so it can no longer serve as the reference the backend bands against.
  const [publishedRate, setPublishedRate] = useState(null);
  // Staff may raise a bill but not approve a loss on it - the backend refuses
  // the flag from a Staff token, so the control is not offered to one either.
  const { backendRole } = useAuth();
  const canApproveBelowCost = backendRole === "Admin" || backendRole === "SuperAdmin";

  // Customer
  const [customerMode, setCustomerMode] = useState("existing");
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [custSearching, setCustSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [walkinName, setWalkinName] = useState("");
  const [walkinPhone, setWalkinPhone] = useState("");

  // Schemes
  const [schemeOptions, setSchemeOptions] = useState([]); // {enrollmentId,schemeName,available}
  const [schemeLoading, setSchemeLoading] = useState(false);
  const [schemeAmounts, setSchemeAmounts] = useState({}); // {enrollmentId: string}

  // Payment
  // No default method and no default status. A pre-selected "Cash / Paid in
  // full" silently asserts money was collected: one distracted click on
  // Create Bill and the invoice is settled in the ledger against cash nobody
  // counted. The admin states both, every time.
  const [payMethod, setPayMethod] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [partialAmount, setPartialAmount] = useState("");
  const [payRef, setPayRef] = useState("");

  // OTP redemption
  const [otp, setOtp] = useState(null); // {saleId, items:[{enrollmentId,amount}]}
  // Quotation result — opens the PDF / Print dialog (nothing is sold).
  const [quote, setQuote] = useState(null);
  // Created sale — opens the invoice PDF / Print dialog after Create Bill.
  const [invoice, setInvoice] = useState(null);
  // A failed void, held on screen until dismissed by hand - see onOtpAbandon.
  const [voidFailure, setVoidFailure] = useState(null);

  usePageMotion(scope, [loading, product]);

  useEffect(() => {
    let alive = true;
    billingService.getTodayGoldRate24k().then((r) => { if (alive) setGoldRate(r); }).catch(() => { if (alive) setGoldRate(null); });
    return () => { alive = false; };
  }, []);

  const discountNum = num(discount);
  const goldProfitCeiling = product && product.goldProfitAmount != null ? product.goldProfitAmount : null;

  // Scheme (gold-savings) credit the admin wants to redeem, in rupees. Declared
  // ABOVE the re-quote effect so the effect can send it to the backend and carve
  // the preview (free making/wastage/profit and GST on the covered gold slice).
  // Backend caps it to the piece's gold value.
  const schemeRedeemRequested = useMemo(
    () => Object.values(schemeAmounts).reduce((t, v) => t + num(v), 0),
    [schemeAmounts]
  );
  const schemeSelected = schemeRedeemRequested > 0;
  // A scheme (savings) bill is billed at pure gold value on the covered slice; a
  // manual discount cannot stack on top of it (backend enforces the same rule).
  // Two real limits on a discount, mirroring the server: the store's own gold
  // profit, and the cost floor under which the piece sells for less than it
  // cost. minimumSafePrice is purchase cost grossed up by GST, so backing the
  // tax out again gives the cost in pre-tax rupees - the same units a discount
  // is now expressed in.
  const taxFactor = 1 + (product?.gstApplied ? (product?.taxRatePercent || 0) : 0) / 100;
  const costFloorCeiling =
    product?.safePrice?.minimumSafePrice != null && product?.subtotalBeforeTax != null
      ? round2(product.subtotalBeforeTax - product.safePrice.minimumSafePrice / taxFactor)
      : null;
  const discountCeiling =
    goldProfitCeiling == null
      ? costFloorCeiling
      : costFloorCeiling == null
        ? goldProfitCeiling
        : Math.min(goldProfitCeiling, costFloorCeiling);
  const ceilingReason =
    discountCeiling == null
      ? null
      : discountCeiling === costFloorCeiling && (goldProfitCeiling == null || costFloorCeiling <= goldProfitCeiling)
        ? "beyond that the bill sells below what the piece cost"
        : "beyond that it is giving away more than this bill's Gold Profit";
  const discountExceedsProfit = discountCeiling != null && discountNum > discountCeiling + 1e-6;
  // A discount is absorbed from gold profit and nothing else, so the margin the
  // bill is really earning is the set profit less the discount. Stating it here
  // is what makes "the discount ate the profit" visible instead of implied: at
  // a discount equal to the profit the effective figure reads 0%.
  const effectiveProfitAmount =
    goldProfitCeiling != null ? Math.max(0, goldProfitCeiling - discountNum) : null;
  const profitBaseGoldValue = Math.max(
    0,
    (product?.goldValueAmount || 0) - (Number(product?.schemeApplied) || 0)
  );
  const effectiveProfitPct =
    effectiveProfitAmount != null && profitBaseGoldValue > 0
      ? (effectiveProfitAmount / profitBaseGoldValue) * 100
      : null;

  // First HUID lookup — confirm a real sellable item and seed edit fields.
  const handleFind = useCallback(async () => {
    const key = code.trim();
    if (!key) { toast("Enter HUID"); return; }
    if (loading) return;
    setLoading(true); setLookupError("");
    setProduct(null); setProductCode("");
    setDiscount(""); setGst(true);
    setCustomerPrice(""); setGoldProfit(""); setPriceDriver("ENGINE"); setQuoteError("");
    setSaleMode(null); // a fresh product always starts at the Online/Offline choice
    try {
      const q = await billingService.getSaleQuote(key, { discountAmount: 0, gstApplied: true });
      setProduct(q);
      setProductCode(q.productCode);
      setRate(q.goldRateApplied != null ? String(q.goldRateApplied) : "");
      setPublishedRate(q.goldRateApplied != null ? q.goldRateApplied : null);
      setMakingVal(q.makingChargeValue != null ? String(q.makingChargeValue) : "");
      setWastageVal(q.wastageValue != null ? String(q.wastageValue) : "");
      toast(`Found ${q.huid || key}`);
    } catch (err) {
      setLookupError(err?.message || `No sellable item found for ${key}`);
    } finally {
      setLoading(false);
    }
  }, [code, loading]);

  // Re-quote authoritatively when any pricing input changes (debounced). The
  // backend recomputes; an over-ceiling discount is rejected server-side and we
  // keep the last good breakdown while the inline validation blocks Create.
  useEffect(() => {
    if (!productCode || !saleMode) return;
    // The ONLY difference between the modes is the gold rate: Offline may
    // override it, Online is locked to the live purity rate.
    const offline = saleMode === "OFFLINE";
    const t = setTimeout(async () => {
      setRequoting(true);
      try {
        const q = await billingService.getSaleQuote(productCode, {
          // A discount is allowed on a scheme bill: it comes off the profit on
          // the grams the scheme has NOT covered, and the OTP redemption replays
          // it. Omitted only when a negotiated customer price is driving the
          // bill — there the backend derives the discount itself, so sending
          // ours as well would double-count it.
          discountAmount: priceDriver === "PRICE" ? undefined : discountNum,
          gstApplied: gst,
          appliedRatePerGram: offline && rate !== "" && !rateOutOfBand ? num(rate) : undefined,
          makingChargeValue: makingVal !== "" ? num(makingVal) : undefined,
          makingChargeType: product?.makingChargeType || undefined,
          wastageValue: wastageVal !== "" ? num(wastageVal) : undefined,
          wastageType: product?.wastageType || undefined,
          // PRICE is a probe: the backend answers with the gold-profit trim that
          // reaches it, which we then adopt (see the effect below) so the bill is
          // driven by Gold Profit % alone — never by a discount line.
          customerPrice: priceDriver === "PRICE" && customerPrice !== "" ? num(customerPrice) : undefined,
          goldProfitPercent: priceDriver === "PROFIT" && goldProfit !== "" ? num(goldProfit) : undefined,
          // Preview under the same rule the sale will apply, so the figures on
          // screen are the figures that will be billed.
          allowBelowCost: allowBelowCost || undefined,
          // Carve the gold-savings slice so the Bill summary previews the exact
          // making/GST-free figures the OTP redemption will finalize.
          schemeValue: schemeSelected ? schemeRedeemRequested : undefined,
        });
        setProduct(q);
        setQuoteError("");
      } catch (err) {
        // Keep the last good breakdown - but say why it did not move. Silence
        // here is what made a rejected customer price look like a dead field.
        setQuoteError(err?.message || "This price could not be applied");
      } finally {
        setRequoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productCode, saleMode, rate, makingVal, wastageVal, discountNum, gst, customerPrice, goldProfit, priceDriver, schemeSelected, schemeRedeemRequested, allowBelowCost]);

  // Customer Price drives the bill: the backend returns the derived discount, so
  // mirror it into the Discount field. Quote 2,50,000 at 2,20,000 and the 30,000
  // lands here and in the Bill summary's Discount row. The Gold Profit % shown
  // alongside is the backend's own GOLD_PROFIT trim — the drop is absorbed from
  // gold profit only, never from making or wastage.
  useEffect(() => {
    if (priceDriver !== "PRICE" || !product || schemeSelected) return;
    const d = String(round2(product.discountAmount || 0));
    setDiscount((prev) => (prev === d ? prev : d));
  }, [product, priceDriver, schemeSelected]);

  // Existing-customer search (debounced).
  useEffect(() => {
    if (customerMode !== "existing") return;
    const q = custQuery.trim();
    if (!q) { setCustResults([]); return; }
    let alive = true;
    setCustSearching(true);
    const t = setTimeout(async () => {
      try {
        const rows = await customerService.getCustomers({ search: q, limit: 20 });
        if (alive) setCustResults(rows);
      } catch { if (alive) setCustResults([]); }
      finally { if (alive) setCustSearching(false); }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [custQuery, customerMode]);

  // Load the selected customer's redeemable schemes (real backend balances).
  const loadSchemes = useCallback(async (customerId) => {
    setSchemeOptions([]); setSchemeAmounts({});
    if (!customerId) return;
    setSchemeLoading(true);
    try {
      const enrolls = await enrollmentService.getEnrollments(customerId);
      const active = enrolls.filter((e) => String(e.status || "").toUpperCase() !== "CANCELLED");
      const balances = await Promise.all(active.map((e) => enrollmentService.getBalance(e.id).catch(() => null)));
      const opts = balances
        .filter((b) => b && b.can_redeem && (b.available_balance || 0) > 0)
        .map((b) => ({ enrollmentId: b.enrollment_id, schemeName: b.scheme_name, available: b.available_balance }));
      setSchemeOptions(opts);
    } catch {
      setSchemeOptions([]);
    } finally {
      setSchemeLoading(false);
    }
  }, []);

  const selectCustomer = (c) => { setSelectedCustomer(c); setCustResults([]); setCustQuery(""); loadSchemes(c.id); };
  const clearCustomer = () => { setSelectedCustomer(null); setSchemeOptions([]); setSchemeAmounts({}); };

  // Scheme redemption maths (amounts are admin inputs; backend re-validates).
  const redeemLines = useMemo(
    () => schemeOptions.map((s) => ({ ...s, amount: num(schemeAmounts[s.enrollmentId]) })).filter((l) => l.amount > 0),
    [schemeOptions, schemeAmounts]
  );
  const redeemTotal = useMemo(() => Number(redeemLines.reduce((t, l) => t + l.amount, 0).toFixed(2)), [redeemLines]);
  const anyLineOverBalance = redeemLines.some((l) => l.amount > l.available + 0.005);
  const schemeApplied = redeemLines.length > 0;
  // What the CURRENT breakdown actually carries. The summary must be driven by
  // this and never by the redeem box: a refused re-quote leaves the last good
  // (non-scheme) breakdown on screen, and dressing that up as a scheme bill
  // invents a scheme portion, unscaled charges and a total the server rejected.
  const quotedScheme = Number(product?.schemeApplied) || 0;
  const quoteHasScheme = quotedScheme > 0;
  // Typed but not yet in the figures - the quote was refused or is still in
  // flight. Worth saying out loud, because the summary below is the bill
  // WITHOUT the redemption.
  const schemePending = schemeApplied && Math.abs(quotedScheme - redeemTotal) > 0.5;

  // A scheme buys gold at pure gold value, so it can only cover up to the piece's
  // OWN gold value — it never pays for making, wastage, profit or GST. Guard the
  // total against that ceiling (the backend caps identically at redemption).
  const goldValue = product ? (product.goldValueAmount || 0) : 0;
  const redeemOverGold = redeemTotal > goldValue + 0.005;

  // billTotal is the carved invoice the backend returned (making/wastage/profit
  // and GST already stripped from the scheme-covered slice). The scheme credit
  // then settles that covered slice, so the customer's cash balance is the rest.
  const billTotal = product ? product.finalAmount : 0;
  const remaining = Math.max(0, Number((billTotal - redeemTotal).toFixed(2)));

  const partialNum = num(partialAmount);
  const partialInvalid = payStatus === "PARTIAL" && !(partialNum > 0 && partialNum < remaining);
  const paymentChosen = !!payMethod && !!payStatus;
  const paidNow = payStatus === "PAID" ? remaining : payStatus === "PARTIAL" ? partialNum : 0;
  const outstanding = Math.max(0, Number((remaining - paidNow).toFixed(2)));

  // Empty is valid (a walk-in need not give a number); anything typed has to be
  // all ten digits. PhoneInput already refuses letters, symbols and an 11th
  // digit, so this only guards the half-typed case.
  const walkinPhoneInvalid = customerMode === "walkin" && walkinPhone.length > 0 && walkinPhone.length !== 10;

  const customerIdentified =
    (customerMode === "existing" ? !!selectedCustomer?.id : walkinName.trim().length >= 2) && !walkinPhoneInvalid;

  const baseInputs = () => {
    const offline = saleMode === "OFFLINE";
    return {
      productCode: product.productCode,
      customerId: customerMode === "existing" ? selectedCustomer?.id : undefined,
      customerName: customerMode === "walkin" ? walkinName.trim() : undefined,
      customerPhone: customerMode === "walkin" ? (walkinPhone.trim() || undefined) : undefined,
      // Carried through on a scheme bill as well — the redemption's recompute
      // replays the sale's own discount, so it survives the carve-out.
      discountAmount: priceDriver === "PRICE" ? 0 : discountNum,
      gstApplied: gst,
      appliedRatePerGram: offline && rate !== "" ? num(rate) : undefined,
      makingChargeValue: makingVal !== "" ? num(makingVal) : undefined,
      makingChargeType: product.makingChargeType || undefined,
      wastageValue: wastageVal !== "" ? num(wastageVal) : undefined,
      wastageType: product.wastageType || undefined,
      customerPrice: priceDriver === "PRICE" && customerPrice !== "" ? num(customerPrice) : undefined,
      goldProfitPercent: priceDriver === "PROFIT" && goldProfit !== "" ? num(goldProfit) : undefined,
      allowBelowCost: allowBelowCost || undefined,
      belowCostReason: allowBelowCost ? belowCostReason.trim() : undefined,
      // The credit about to be redeemed against this bill. Validation only -
      // the sale is stored uncarved and the carve still happens inside the OTP
      // redemption - but a discount that could not survive that carve is now
      // refused here, at the counter, instead of at the OTP step.
      schemeValue: schemeSelected ? schemeRedeemRequested : undefined,
    };
  };

  // Pick the mode. Online restores the live purity rate (rate is the only thing
  // the mode changes); every other calculator control stays available in both.
  const selectMode = (m) => {
    setSaleMode(m);
    if (m === "ONLINE") setRate(product?.goldRateApplied != null ? String(product.goldRateApplied) : "");
  };

  // The band the backend enforces on a negotiated rate/g (+/-50% of the rate
  // published for this purity today). Checked here so a mistyped rate is a
  // field message instead of a rejected request.
  const rateBand = publishedRate != null
    ? { low: publishedRate * 0.5, high: publishedRate * 1.5 }
    : null;
  const rateOutOfBand =
    saleMode === "OFFLINE" && rate !== "" && rateBand != null &&
    (num(rate) < rateBand.low || num(rate) > rateBand.high);

  // Natural asking price = payable before any negotiated discount. Backend keeps
  // subtotal + tax fixed when a customer price is sent (it only moves the
  // discount line), so final + discount is stable and never follows the typed
  // customer price. Selling Price moves only when the rate/charges change.
  // The asking price before any discount. The discount is pre-tax now, so
  // adding it back has to include the GST that came off with it - otherwise
  // this read 7,29,751.36 against a true asking price of 7,30,021.36.
  const sellingPrice = product
    ? round2((product.finalAmount || 0) + (product.discountAmount || 0) * (1 + (product.gstApplied ? (product.taxRatePercent || 0) : 0) / 100))
    : 0;

  // Gold Profit % to show. Backend bills at full margin and expresses a
  // negotiated cut as a discount, surfacing the reduced % only in
  // safe_price.reductions. When the typed price is below the asking price but no
  // GOLD_PROFIT trim is returned (loss zone) the margin is fully consumed — show
  // 0, never fall back to the full 10%.
  const goldProfitCut = (product?.safePrice?.reductions || []).find((r) => r.component === "GOLD_PROFIT");
  // The percent the bill IS applying, straight from the backend breakdown.
  // It used to prefer safePrice.reductions.GOLD_PROFIT.toValue, which is only
  // a SUGGESTED trim — so the field read one number (5.35) while the summary
  // row billed another (5.72). An input must state what is in force; the
  // suggestion is surfaced as helper text below instead.
  const goldProfitShown = product?.goldProfitPercent;
  const goldProfitSuggested =
    goldProfitCut?.toValue != null && Math.abs(goldProfitCut.toValue - (product?.goldProfitPercent ?? 0)) > 0.01
      ? goldProfitCut.toValue
      : null;

  // Max discount the admin may give before crossing break-even = current asking
  // price − minimum safe price. (safe_price.residual_discount is only the sliver
  // beyond all-charges-zero, not the real headroom — so it read ₹0 and confused.)
  const minSafe = product?.safePrice?.minimumSafePrice;
  const maxDiscount = minSafe != null ? Math.max(0, round2(sellingPrice - minSafe)) : null;

  // Today's gold worth of the piece at the PUBLISHED rate for its purity — the
  // same rate the bill is priced at, so this tile and the bill can never
  // disagree. (It used to recompute rate_24k × purity_factor here, which drifted
  // from the billed figure every time the published purity rate differed.)
  const todaysGoldValue = product ? (product.goldValueAmount || 0) : 0;

  // The backend refuses an approved below-cost sale that carries no reason, so
  // the button waits for it rather than letting the counter meet a 400.
  const belowCostIncomplete = allowBelowCost && belowCostReason.trim().length < 3;

  const canCreate =
    !!product && !creating && !requoting && !discountExceedsProfit &&
    customerIdentified && paymentChosen && !partialInvalid && !anyLineOverBalance &&
    !redeemOverGold && !belowCostIncomplete && !rateOutOfBand;

  const resetAll = () => {
    setProduct(null); setProductCode(""); setCode("");
    setRate(""); setMakingVal(""); setWastageVal(""); setDiscount(""); setGst(true);
    setAllowBelowCost(false); setBelowCostReason(""); setPublishedRate(null);
    setPayMethod(""); setPayStatus(""); setPartialAmount(""); setPayRef("");
    setSaleMode(null); setCustomerPrice(""); setGoldProfit(""); setPriceDriver("ENGINE"); setQuoteError("");
    clearCustomer(); setCustQuery(""); setCustResults([]); setWalkinName(""); setWalkinPhone("");
    setPayMethod("CASH"); setPayStatus("PAID"); setPartialAmount(""); setPayRef("");
    setLookupError(""); setOtp(null);
  };

  const handleCreateBill = async () => {
    if (!canCreate || !product) {
      if (!customerIdentified) toast("Select a customer or enter a walk-in name");
      else if (discountExceedsProfit) toast("Discount exceeds available Gold Profit");
      else if (anyLineOverBalance) toast("A redemption exceeds its scheme balance");
      else if (redeemOverGold) toast(`Scheme redemption can't exceed the item's gold value (${money(goldValue)})`);
      else if (!paymentChosen) toast("Choose the payment method and status before billing");
      else if (partialInvalid) toast("Partial amount must be greater than 0 and less than the amount remaining");
      return;
    }
    setCreating(true);
    try {
      if (schemeApplied) {
        // Create the CASH side first (never PAID — the scheme must settle the
        // remainder), then redeem the schemes against the created invoice.
        const createStatus = paidNow > 0 ? "PARTIAL" : "PENDING";
        const sale = await billingService.createSale({
          ...baseInputs(),
          paymentMethod: payMethod,
          paymentStatus: createStatus,
          initialPaymentAmount: paidNow > 0 ? paidNow : undefined,
          paymentReferenceNo: payRef.trim() || undefined,
        });
        await enrollmentService.requestRedemptionOtp(sale.id);
        setOtp({ saleId: sale.id, invoiceNumber: sale.invoiceNumber, items: redeemLines.map((l) => ({ enrollmentId: l.enrollmentId, amount: l.amount })) });
        toast("Verification code sent to the customer's app");
      } else {
        const sale = await billingService.createSale({
          ...baseInputs(),
          paymentMethod: payMethod,
          paymentStatus: payStatus,
          initialPaymentAmount: payStatus === "PARTIAL" ? partialNum : undefined,
          paymentReferenceNo: payRef.trim() || undefined,
        });
        // Open the invoice summary dialog (Download PDF / Print). The form is
        // reset only when the dialog is closed, so the admin keeps the PDF handle.
        setInvoice({ id: sale.id, invoiceNumber: sale.invoiceNumber, finalAmount: sale.finalAmount });
      }
    } catch (err) {
      toast(err?.message || "Could not create bill");
    } finally {
      setCreating(false);
    }
  };

  const handleQuotation = async () => {
    if (!product || !customerIdentified) { toast("Load a product and identify the customer first"); return; }
    if (discountExceedsProfit) { toast("Discount exceeds available Gold Profit"); return; }
    try {
      const schemePreview = {};
      for (const l of redeemLines) schemePreview[l.enrollmentId] = l.amount;
      const q = await billingService.generateQuotation({
        ...baseInputs(),
        schemeAmounts: customerMode === "existing" && Object.keys(schemePreview).length ? schemePreview : undefined,
      });
      setQuote(q); // open the PDF / Print dialog
    } catch (err) {
      toast(err?.message || "Could not generate quotation");
    }
  };

  // Scheme redemption verified: the sale is settled. Show the invoice dialog so
  // the admin can print/download, same as a straight cash bill.
  const onOtpDone = () => {
    const done = otp;
    setOtp(null);
    toast("Sale completed with scheme redemption");
    if (done?.saleId) setInvoice({ id: done.saleId, invoiceNumber: done.invoiceNumber });
  };

  // Abandoning the OTP step must not leave the item SOLD. The sale was created
  // before the OTP (the challenge needs a sale_id); voiding it returns the item
  // to stock and cancels the invoice, then we re-scan the same HUID so the admin
  // stays on the item (now back in stock) instead of being kicked to a blank
  // screen.
  //
  // If the void FAILS the sale is still standing, and that has to be said in
  // those words. This used to toast "Could not cancel cleanly - re-scan the
  // item", which reads like a UI hiccup and tells the admin to do the one thing
  // that hides the problem: a re-scan shows the ITEM's state, not the invoice's,
  // so a live sale against a customer who walked away gets dismissed as a
  // glitch. A failed reversal is not a glitch - it is money on the books.
  const onOtpAbandon = async () => {
    const saleId = otp?.saleId;
    const invoiceNumber = otp?.invoiceNumber;
    setOtp(null);
    setSchemeAmounts({});
    if (saleId) {
      try {
        await billingService.voidSale(saleId);
        setVoidFailure(null);
        toast("Redemption cancelled — item returned to stock");
      } catch (err) {
        setVoidFailure({ invoiceNumber: invoiceNumber || null, saleId, reason: err?.message || "" });
      }
    }
    handleFind(); // refresh the product from the backend's true state
  };

  // The customer is shown this panel, so the store's margin is never a row of
  // its own. It goes where a jeweller already puts it: in the RATE. The panel
  // states the selling rate per gram and the gold value it produces, the two
  // multiply, and no margin is visible. Splitting it into a "Gold Profit" row
  // was tried and is wrong for the same reason the invoice never did it.
  const goldProfitLine = product ? (product.goldProfitAmount || 0) : 0;
  const goldValuePure = product ? (product.goldValueAmount || 0) : 0;
  const goldValueShown = round2(goldValuePure + goldProfitLine);
  const netGrams = product ? (Number(product.netGoldWeightGrams) || 0) : 0;
  const appliedRate = product ? (Number(product.goldRateApplied) || 0) : 0;
  // Only when it actually reproduces the amount beside it. The rate is quoted
  // to paise, so a few paise of rounding is tolerated; beyond a rupee the rate
  // would not describe the figure and the row prints bare instead.
  const sellingRate = (() => {
    if (!(netGrams > 0 && appliedRate > 0)) return null;
    if (Math.abs(netGrams * appliedRate - goldValuePure) >= 0.01) return null;
    const eff = round2(goldValueShown / netGrams);
    return Math.abs(netGrams * eff - goldValueShown) <= 1 ? eff : null;
  })();
  const goldValueLabel = `Gold Value${sellingRate ? ` (${netGrams.toFixed(3)} g \u00d7 ${money(sellingRate)})` : ""}`;

  return (
    <div ref={scope} className="mx-auto max-w-[1240px] pb-32 lg:pb-14">
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">New Sale</h2>
        <p className="mt-1 max-w-[64ch] text-sm text-muted">Enter the item's HUID, adjust the applicable rate and charges if needed, identify the buyer, then confirm the bill. Every amount is calculated by the backend.</p>
      </div>

      {/* Lookup, and — until an item is loaded — the same two-column skeleton the
          loaded bill uses, so the layout never jumps from one column to two
          halfway through the task. */}
      <div className={product ? "" : "grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]"}>
      <Card data-motion="reveal" className="p-5 sm:p-6">
        <SectionHead title="Find product by HUID" />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 flex-1 min-w-[220px]">
            <span className="text-xs font-bold">HUID *</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter HUID" onKeyDown={(e) => e.key === "Enter" && handleFind()} />
          </label>
          <Button size="sm" className="bg-accent hover:bg-accent-strong h-10 px-6" disabled={loading} onClick={handleFind}>{loading ? "Finding…" : "Find Product"}</Button>
        </div>
        {/* Not a toast. A toast fades and this must not: until someone cancels
          that invoice there is a sale on the books for a piece the customer
          never took. It stays until dismissed by hand. */}
      {voidFailure && (
        <div className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm text-danger">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-extrabold">
                The sale is still standing{voidFailure.invoiceNumber ? ` — invoice ${voidFailure.invoiceNumber}` : ""}
              </div>
              <p className="mt-1 font-semibold leading-snug">
                The redemption was cancelled here, but the invoice could not be voided, so the item is
                still marked sold. Open Sales History and cancel
                {voidFailure.invoiceNumber ? ` ${voidFailure.invoiceNumber}` : " that invoice"} there.
                Do not sell this item again until you have.
              </p>
              {voidFailure.reason && (
                <p className="mt-1 text-xs font-semibold opacity-80">Reason given: {voidFailure.reason}</p>
              )}
            </div>
            <button onClick={() => setVoidFailure(null)} className="shrink-0 rounded-lg border border-danger-line px-2 py-1 text-xs font-bold">Dismiss</button>
          </div>
        </div>
      )}
      {lookupError && <div className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{lookupError}</div>}
        {!product && !lookupError && !loading && (
          <div className="mt-5 border-t border-line-soft pt-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">How a bill is made</div>
            <ol className="mt-2 space-y-1.5">
              {[
                "Find the item by its HUID.",
                "Choose Online (live rate) or Offline (editable rate).",
                "Adjust rate, profit % and charges — or type the customer's price.",
                "Identify the buyer and redeem any schemes they hold.",
                "State how they are paying, then create the bill.",
              ].map((step, i) => (
                <li key={step} className="flex gap-2.5 text-xs text-muted">
                  <span className="num mt-px grid h-4 w-4 shrink-0 place-items-center rounded border border-line-soft bg-canvas text-[9px] font-extrabold text-faint">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </Card>

      {/* Placeholder for the pinned summary: keeps the right column occupied so
          the page reads as a billing screen rather than an empty form. */}
      {!product && (
        <div className="hidden rounded-2xl border border-dashed border-line bg-canvas/40 p-6 lg:block">
          <div className="text-sm font-extrabold text-faint">Bill summary</div>
          <p className="mt-1 text-xs text-muted">Appears here once an item is loaded, and stays pinned while you work down the form.</p>
          <div className="mt-4 space-y-2.5" aria-hidden="true">
            {["Gold value", "Gold profit", "Making charge", "GST", "Bill total"].map((label, i) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className={`text-xs ${i === 4 ? "font-extrabold text-faint" : "text-faint"}`}>{label}</span>
                <span className={`h-2 rounded-full bg-line-soft ${i === 4 ? "w-24" : "w-16"}`} />
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Product found: the ONLY thing on screen is the payment-mode choice. */}
      {product && !saleMode && (
        <Card data-motion="reveal" className="mt-5 p-6">
          <h3 className="text-sm font-extrabold">Choose payment mode</h3>
          <p className="mt-1 text-xs text-muted">Both modes bill the same way. Offline lets you edit the gold rate; Online keeps the live purity rate.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[["ONLINE", "Online", "Live gold rate — rate locked."], ["OFFLINE", "Offline", "Full cash — gold rate editable."]].map(([val, title, desc]) => (
              <button key={val} type="button" onClick={() => selectMode(val)} className="rounded-2xl border border-line p-6 text-left transition hover:border-accent hover:bg-accent-soft/30 hover:shadow-md">
                <div className="text-base font-extrabold">{title}</div>
                <div className="mt-1 text-xs text-muted">{desc}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {product && saleMode && (
        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]" data-motion="reveal">
          {/* LEFT: details + controls */}
          <div className="space-y-5 min-w-0">
            {/* Product */}
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <SectionHead step={1} title={product.name || "Not provided"} />
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                    <span className="num font-bold">HUID {product.huid || "Not provided"}</span>
                    <span aria-hidden="true" className="text-line">|</span>
                    <span>{[product.category, product.subcategory].filter(Boolean).join(" · ") || "Not provided"}</span>
                  </div>
                </div>
                <Badge tone={product.stockStatus === "IN_STOCK" ? "success" : "warning"}>{product.stockStatus === "IN_STOCK" ? "In stock" : (product.stockStatus || "—")}</Badge>
              </div>
              {/* One strip, hairline separated: the three facts that decide the
                  price sit on a single line instead of three stacked boxes. */}
              <div className="mt-3.5 flex divide-x divide-line-soft rounded-xl border border-line-soft bg-canvas/60">
                <SpecCell flush label="Purity" value={product.purity || "Not provided"} />
                <SpecCell flush label="Net weight" value={grams(product.netGoldWeightGrams)} mono />
                <SpecCell flush label={`${product.purity || ""} rate/g`.trim()} value={product.goldRateApplied != null ? money(product.goldRateApplied) : "—"} mono />
              </div>

              {/* Mode belongs to the item: it decides whether THIS item's rate is
                  editable. As a card footer it stops being an unowned strip
                  floating between two cards. */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Mode</span>
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-white">{saleMode === "OFFLINE" ? "Offline" : "Online"}</span>
                  <span className="text-[11px] text-muted">{saleMode === "OFFLINE" ? "Gold rate editable" : "Gold rate locked to live"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => selectMode(saleMode === "OFFLINE" ? "ONLINE" : "OFFLINE")}
                  className="rounded-lg px-2 py-1 text-[11px] font-bold text-accent-strong underline decoration-accent-line underline-offset-2 transition-colors hover:bg-accent-soft"
                >
                  Switch to {saleMode === "OFFLINE" ? "Online" : "Offline"}
                </button>
              </div>
            </Card>

            {/* Customer */}
            <Card className="p-5 space-y-4">
              <SectionHead step={2} title="Customer" />
              <div className="flex gap-2">
                {[["existing", "Existing customer"], ["walkin", "Walk-in"]].map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setCustomerMode(m)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-colors ${customerMode === m ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-soft hover:bg-canvas"}`}>{label}</button>
                ))}
              </div>

              {customerMode === "existing" ? (
                selectedCustomer ? (
                  <>
                    <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/40 px-4 py-3">
                      <div>
                        <div className="text-sm font-bold">{selectedCustomer.name}</div>
                        <div className="text-xs text-muted">{selectedCustomer.phone && selectedCustomer.phone !== "—" ? selectedCustomer.phone : "No phone on file"}</div>
                      </div>
                      <Button size="sm" variant="outline" onClick={clearCustomer}>Change</Button>
                    </div>
                    {/* Redeemable schemes */}
                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-muted">Active schemes</span>
                        {product && <span className="text-[10px] font-semibold text-muted">Covers the pure gold value, up to {money(goldValue)} — making &amp; GST waived on it</span>}
                      </div>
                      {schemeLoading && <div className="rounded-xl border border-line px-4 py-3 text-xs text-muted">Loading schemes…</div>}
                      {!schemeLoading && schemeOptions.length === 0 && <div className="rounded-xl border border-line px-4 py-3 text-xs text-muted">No redeemable schemes for this customer.</div>}
                      {!schemeLoading && schemeOptions.map((s) => {
                        const amt = num(schemeAmounts[s.enrollmentId]);
                        const over = amt > s.available + 0.005;
                        // Scheme credit is 24K gold; the piece is billed in its own
                        // purity. Both conversions are shown so the admin sees what
                        // the rupees actually buy off this bill.
                        const rate24 = Number(product?.goldRate24k) || 0;
                        const pRate = Number(product?.goldRateApplied) || 0;
                        const g24 = rate24 > 0 ? amt / rate24 : 0;
                        const gEq = pRate > 0 ? amt / pRate : 0;
                        const selected = amt > 0;
                        return (
                          <div key={s.enrollmentId} className={`mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${selected && !over ? "border-emerald-300 bg-emerald-50/40" : "border-line"}`}>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{s.schemeName}</div>
                              <div className="num text-xs text-muted">Available {money(s.available)}</div>
                              {selected && !over && rate24 > 0 && (
                                <div className="num mt-0.5 text-[11px] font-semibold text-emerald-800">
                                  {g24.toFixed(3)} g of 24K{pRate > 0 ? ` = ${gEq.toFixed(3)} g of ${product.purity}` : ""}
                                </div>
                              )}
                            </div>
                            <label className="grid gap-1">
                              <Input type="number" step="0.01" min="0" className="w-[150px]" placeholder="Redeem ₹" value={schemeAmounts[s.enrollmentId] ?? ""} onChange={(e) => setSchemeAmounts((p) => ({ ...p, [s.enrollmentId]: e.target.value }))} error={over ? "Over balance" : undefined} />
                              {over && <span className="text-[11px] font-semibold text-danger">Max {money(s.available)}</span>}
                            </label>
                          </div>
                        );
                      })}
                      {/* Combined position across schemes — the figure that has to
                          stay inside the piece's gold value. */}
                      {redeemLines.length > 1 && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50/70 px-4 py-2.5">
                          <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-emerald-900">{redeemLines.length} schemes selected</span>
                          <span className="num text-xs font-extrabold text-emerald-900">
                            {money(redeemTotal)}
                            {Number(product?.goldRate24k) > 0 ? ` · ${(redeemTotal / Number(product.goldRate24k)).toFixed(3)} g of 24K` : ""}
                          </span>
                        </div>
                      )}
                      {redeemOverGold && (
                        <div className="mt-2 rounded-xl border border-danger-line bg-danger-soft px-4 py-2.5 text-[11px] font-semibold text-danger">
                          Total scheme redemption {money(redeemTotal)} exceeds the item's gold value {money(goldValue)}. A scheme only pays for gold — reduce it to {money(goldValue)} or less.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div>
                    <SearchInput placeholder="Search by name, phone or code" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
                    {custQuery.trim() && (
                      <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-line">
                        {custSearching && <div className="px-4 py-3 text-xs text-muted">Searching…</div>}
                        {!custSearching && custResults.length === 0 && <div className="px-4 py-3 text-xs text-muted">No matching customers.</div>}
                        {!custSearching && custResults.map((c) => (
                          <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="flex w-full items-center justify-between border-b border-line-soft px-4 py-2.5 text-left last:border-0 hover:bg-canvas/60">
                            <span className="text-sm font-semibold">{c.name}</span>
                            <span className="text-xs text-muted">{c.phone && c.phone !== "—" ? c.phone : c.code || ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-1.5"><span className="text-xs font-bold">Name *</span><Input value={walkinName} onChange={(e) => setWalkinName(e.target.value)} placeholder="Walk-in buyer name" /></label>
                  {/* Optional, but if it is filled it must be a real mobile
                      number - the bill carries it and the store calls it back. */}
                  <label className="grid min-w-0 gap-1.5">
                    <span className="text-xs font-bold">Phone <span className="font-normal text-muted">— optional, 10 digits</span></span>
                    <PhoneInput value={walkinPhone} onValueChange={setWalkinPhone} error={walkinPhoneInvalid} />
                    {walkinPhoneInvalid && <span className="text-[11px] font-semibold text-danger">Enter all 10 digits, or leave it empty</span>}
                  </label>
                </div>
              )}
            </Card>

            {/* Purchase Cost and Purchase-Cost P/L are intentionally omitted from
                this screen — the counter sees selling figures only. */}
                <Card className="p-5 space-y-4">
                  <SectionHead step={3} title="Pricing" meta={requoting ? "Updating…" : undefined} />
                  {/* Reference figures stay small: the field below is the one
                      the admin acts on, so it gets the visual weight. */}
                  {/* Two equal columns with their own padding. SpecCell's
                      edge-flush rule is for the spec strip that sits directly on
                      the card; inside this bordered box it pulled the first
                      label onto the border. */}
                  <div className="grid grid-cols-2 divide-x divide-line-soft rounded-xl border border-line-soft bg-canvas/60 px-1">
                    <SpecCell label="Today's gold value" value={money(todaysGoldValue)} mono />
                    {/* A scheme changes the selling price, so until the quote
                        carrying it comes back there is no honest figure to
                        print. Showing the un-carved one is how this strip came
                        to display a price the server had already refused. */}
                    <SpecCell
                      label={quoteHasScheme ? "Bill total before scheme credit" : "Selling price"}
                      value={schemeSelected && !quoteHasScheme ? "—" : money(sellingPrice)}
                      sub={
                        schemeSelected && !quoteHasScheme
                          ? "once the scheme is applied"
                          : quoteHasScheme
                            ? `less scheme credit ${money(quotedScheme)} = ${money(round2(sellingPrice - quotedScheme))} payable`
                            : undefined
                      }
                      mono
                    />
                  </div>
                  <div className="rounded-2xl border border-accent-line bg-accent-soft p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-[0.08em] text-accent-strong">Customer Price</span>
                      {requoting && <span className="text-[10px] font-semibold text-muted">Updating…</span>}
                    </div>
                    <MoneyInput
                      allowDecimal
                      placeholder="0"
                      className="mt-2 h-14 bg-surface pl-10 text-center text-2xl font-extrabold tracking-tight"
                      symbolClassName="text-lg font-extrabold text-ink"
                      value={priceDriver === "PRICE" ? customerPrice : (product.finalAmount != null ? String(round2(product.finalAmount)) : "")}
                      onValueChange={(v) => { setCustomerPrice(v); setPriceDriver("PRICE"); }}
                      aria-label="Customer price in rupees" />
                    {quoteError ? (
                      <p className="mt-1.5 rounded-lg border border-danger-line bg-danger-soft px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-danger">
                        {/* The server's own floor is authoritative and is already
                            in its message, so the safe-price hint is appended
                            ONLY when the message names no floor of its own -
                            two different "lowest price" figures side by side
                            read as a contradiction. Bare amounts in the message
                            are given Indian grouping so they match every other
                            figure on the screen. */}
                        {formatAmountsInText(quoteError)}
                        {minSafe != null && !/floor|lowest/i.test(quoteError) && <> The lowest price this bill can take is {money(minSafe)}.</>}
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-muted">
                        {schemeSelected
                          ? <>Bill total for the piece. It is converted into the Gold Profit % it implies, so it survives the scheme redemption. Scheme {money(redeemTotal)} comes off — balance to pay {money(remaining)}.</>
                          /* It becomes a discount line, not a new profit %. Saying
                             "Gold Profit % updates to match" was untrue on a
                             normal bill and is what made the field look broken. */
                          : <>Type the quoted price. The gap to {money(sellingPrice)} is recorded as a discount and comes out of Gold Profit — the percentage itself stays as you set it.</>}
                      </p>
                    )}
                  </div>
                  {product.currentGoldValuePnl != null && (
                    <PnlCard
                      label="Today's Gold Value Profit / Loss"
                      amount={product.currentGoldValuePnl}
                      pct={product.currentGoldValueMarginPct}
                      /* The figure is opaque without its own arithmetic: it is
                         the bill with GST taken back out (that money is the
                         government's, not the store's) against what the metal
                         is worth at today's rate. */
                      detail={<>{money(round2((product.finalAmount || 0) / taxFactor))} bill less GST − {money(todaysGoldValue)} today's gold value</>}
                    />
                  )}
                </Card>

                {/* Editable rate + Gold Profit % + Making/Wastage + Discount */}
                <Card className="p-5 space-y-4">
                  <SectionHead step={4} title="Rate & charges" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid min-w-0 gap-1.5">
                      <span className="text-xs font-bold">{product.purity ? `${product.purity} ` : ""}Sale Rate/g (₹) *</span>
                      <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} disabled={saleMode === "ONLINE"} className={saleMode === "ONLINE" ? "opacity-60" : ""} />
                      <span className="text-[11px] text-muted">{saleMode === "ONLINE" ? `Published ${product.purity || ""} rate ${product.goldRateApplied != null ? money(product.goldRateApplied) : "—"} — locked in Online.` : `Editable. Default ${publishedRate != null ? money(publishedRate) : "—"} — the published ${product.purity || ""} rate.`}</span>
                      {/* The backend refuses a rate more than 50% either side of
                          the published one — a tamper/typo net, not a haggling
                          limit. Stating the range here means the counter never
                          meets that rejection blind. */}
                      {saleMode === "OFFLINE" && rateBand != null && (
                        <span className={`text-[11px] ${rateOutOfBand ? "font-semibold text-danger" : "text-muted"}`}>
                          {rateOutOfBand
                            ? `Rate must be between ${money(rateBand.low)} and ${money(rateBand.high)} — ${money(publishedRate)} is today's published ${product.purity || ""} rate.`
                            : `Allowed ${money(rateBand.low)} – ${money(rateBand.high)}.`}
                        </span>
                      )}
                    </label>
                    <label className="grid min-w-0 gap-1.5">
                      <span className="text-xs font-bold">Gold Profit %</span>
                      {/* A discount is absorbed from gold profit, so this
                          states the margin actually being earned - it falls as
                          the discount grows and reads 0 when the discount has
                          consumed it. The percentage that was SET is kept and
                          shown below; typing here still sets it. */}
                      <Input type="number" step="0.01" min="0" max="100" placeholder="10"
                        value={
                          priceDriver === "PROFIT"
                            ? goldProfit
                            : effectiveProfitPct != null && discountNum > 0
                              ? String(round2(effectiveProfitPct))
                              : (goldProfitShown != null ? String(round2(goldProfitShown)) : "")
                        }
                        onChange={(e) => { setGoldProfit(e.target.value); setPriceDriver("PROFIT"); }} />
                      <span className="text-[11px] text-muted">{schemeSelected ? "Earned on the un-covered grams only — waived on the scheme-covered slice." : "Margin over gold value — drives the selling price."}</span>
                      {/* What the margin becomes once the discount is taken off
                          it. Red at zero: there is nothing left to give. */}
                      {discountNum > 0 && effectiveProfitPct != null && (
                        <span className={`text-[11px] font-semibold ${effectiveProfitPct <= 0.005 ? "text-danger" : "text-accent-strong"}`}>
                          {effectiveProfitPct <= 0.005
                            ? <>Set {round2(goldProfitShown || 0)}% — the {money(discountNum)} discount wipes it out, so this bill earns 0%</>
                            : <>Set {round2(goldProfitShown || 0)}% — after the {money(discountNum)} discount this bill earns {money(effectiveProfitAmount)}</>}
                        </span>
                      )}
                      {goldProfitSuggested != null && discountNum <= 0 && (
                        <span className="text-[11px] font-semibold text-accent-strong">This can be cut to {round2(goldProfitSuggested)}% and the bill still makes money.</span>
                      )}
                    </label>
                    <label className="grid min-w-0 gap-1.5">
                      <span className="text-xs font-bold">Making Charge {chargePct(product.makingChargeType, makingVal || product.makingChargeValue)}</span>
                      <Input type="number" step="0.01" min="0" value={makingVal} onChange={(e) => setMakingVal(e.target.value)} />
                      <span className="text-[11px] text-muted">= {money(product.makingChargeAmount)}</span>
                    </label>
                    <label className="grid min-w-0 gap-1.5">
                      <span className="text-xs font-bold">Wastage {chargePct(product.wastageType, wastageVal || product.wastageValue)}</span>
                      <Input type="number" step="0.01" min="0" value={wastageVal} onChange={(e) => setWastageVal(e.target.value)} />
                      <span className="text-[11px] text-muted">= {money(product.wastageAmount)}</span>
                    </label>
                    <label className="grid gap-1.5 sm:col-span-2">
                      {/* The unit matters now: a discount comes off the taxable
                          value, so the bill falls by the discount plus the GST
                          that is no longer due on it. */}
                      <span className="text-xs font-bold">Discount (₹) <span className="font-normal text-muted">— off the taxable value</span></span>
                      <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} disabled={schemeSelected && priceDriver === "PRICE"} className={schemeSelected && priceDriver === "PRICE" ? "opacity-60" : ""} error={discountExceedsProfit ? "Exceeds Gold Profit" : undefined} placeholder="0" />
                      {discountNum > 0 && product.gstApplied && (product.taxRatePercent || 0) > 0 && (
                        <span className="text-[11px] text-muted">Bill falls by {money(round2(discountNum * taxFactor))} — the discount plus the {product.taxRatePercent}% GST no longer due on it.</span>
                      )}
                      {schemeSelected && priceDriver === "PRICE" ? (
                        <span className="text-[11px] text-muted">A scheme bill takes one or the other — clear the Customer Price above to give a rupee discount instead.</span>
                      ) : discountCeiling != null ? (
                        <span className={`text-[11px] ${discountExceedsProfit ? "font-semibold text-danger" : "text-muted"}`}>
                          {discountExceedsProfit
                            ? `Max discount ${money(discountCeiling)} — ${ceilingReason}.`
                            : schemeSelected
                              ? `Up to ${money(discountCeiling)} can be given — the Gold Profit on the grams the scheme has not covered.`
                              : `Up to ${money(discountCeiling)} can be given — whichever runs out first, Gold Profit or the cost floor.`}
                        </span>
                      ) : <span className="text-[11px] text-muted">A discount may only reduce Gold Profit.</span>}
                    </label>
                  </div>
                </Card>

            {/* Payment */}
            <Card className="p-5 space-y-4">
              <SectionHead step={5} title="Payment" meta={paymentChosen ? undefined : "Required"} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1.5"><span className="text-xs font-bold">Method *</span>
                  <Select value={payMethod} onValueChange={setPayMethod} placeholder="Select method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} />
                </label>
                <label className="grid min-w-0 gap-1.5"><span className="text-xs font-bold">Status *</span>
                  <Select value={payStatus} onValueChange={setPayStatus} placeholder="Select status" options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))} />
                </label>
                {payStatus === "PARTIAL" && (
                  <label className="grid min-w-0 gap-1.5"><span className="text-xs font-bold">Paid now (₹) *</span>
                    <Input type="number" step="0.01" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} error={partialInvalid ? "Must be > 0 and < remaining" : undefined} />
                    {partialInvalid && <span className="text-[11px] font-semibold text-danger">Between {money(0)} and {money(remaining)}</span>}
                  </label>
                )}
                <label className="grid min-w-0 gap-1.5"><span className="text-xs font-bold">Reference No.</span><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional" /></label>
              </div>
              {!paymentChosen && <p className="text-[11px] font-semibold text-accent-strong">Choose a method and a status — nothing is treated as collected until you do.</p>}
              {schemeApplied && <p className="text-[11px] text-muted">Payment applies to the amount remaining after scheme redemption ({money(remaining)}).</p>}
            </Card>
          </div>

          {/* RIGHT: bill summary — pinned while the left column scrolls. The
              sticky lives on the COLUMN (the card alone could not stick once the
              grid became items-start). Deliberately NO inner overflow: a second
              scrollbar inside a pinned panel hides the very figure being
              checked while the page itself looks scrolled to the end. The
              panel is kept short enough to fit instead — dense rows,
              one-line notes. */}
          <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold">Bill summary</h3>
                <div className="flex items-center gap-2">
                  {requoting && <span className="text-[11px] text-muted">…</span>}
                  <div className="inline-flex rounded-lg border border-line p-0.5">
                    {[["GST On", true], ["GST Off", false]].map(([label, val]) => (
                      <button key={label} type="button" onClick={() => setGst(val)} className={`rounded-md px-2.5 py-1 text-[10px] font-bold transition-colors ${gst === val ? "bg-accent text-white" : "text-muted hover:text-ink"}`}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3 rounded-xl border border-line bg-canvas/40 p-3 text-[11px] leading-relaxed">
                <div className="font-bold text-ink">{product.name || "—"}</div>
                <div className="text-muted">HUID {product.huid || "—"} · {product.purity || "—"} · {grams(product.netGoldWeightGrams)}</div>
                <div className="mt-1 text-muted">
                  Buyer: <span className="font-semibold text-ink">{customerMode === "existing" ? (selectedCustomer?.name || "Not selected") : (walkinName.trim() || "Walk-in")}</span>
                  {(() => {
                    const ph = customerMode === "existing" ? selectedCustomer?.phone : walkinPhone;
                    return ph && ph !== "—" ? ` · +91 ${ph}` : "";
                  })()}
                </div>
              </div>

                {schemePending && (
                  <div className="mb-2 rounded-lg border border-danger-line bg-danger-soft px-2.5 py-2 text-[11px] font-semibold leading-snug text-danger">
                    This bill does not include the {money(redeemTotal)} scheme redemption yet — the figures below are the bill without it. Fix the price above and it will be applied.
                  </div>
                )}
              <div className="mt-3 space-y-0.5">
                {/* Two layouts, one engine. A scheme bill is presented as the
                    SCHEME PORTION / NORMAL PORTION split from the gold billing
                    model: the scheme's grams are bought at pure gold value with
                    zero making, wastage and GST, and everything else is billed
                    normally. Both blocks are derived from the SAME backend
                    breakdown (no money is computed here) and always reconcile:
                      scheme gold  = scheme_applied_amount
                      normal gold  = gold value line − scheme_applied_amount
                      Total        = scheme subtotal + normal subtotal = Bill Total
                    A non-scheme bill keeps the plain single list. */}
                {quoteHasScheme ? (() => {
                  const pureRate = Number(product.goldRateApplied) || 0;
                  const netG = Number(product.netGoldWeightGrams) || 0;
                  // The server's figure, never the typed one.
                  const schemeGold = quotedScheme;
                  const schemeG = pureRate > 0 ? schemeGold / pureRate : 0;
                  const normalG = Math.max(0, netG - schemeG);
                  // Scheme credit is held as 24K gold, so each line is shown in
                  // 24K grams (what the passbook holds) and the combined slice is
                  // converted to the piece's own purity (what comes off its weight).
                  const rate24 = Number(product.goldRate24k) || 0;
                  const schemeRows = redeemLines.map((l) => ({
                    key: l.enrollmentId,
                    name: l.schemeName || "Scheme",
                    amount: l.amount,
                    g24: rate24 > 0 ? l.amount / rate24 : 0,
                  }));
                  const schemeG24 = schemeRows.reduce((t, r) => t + r.g24, 0);
                  // The backend's own carved figure: pure gold value less the
                  // credit, with no margin in it. Never re-derived here.
                  const chargeableGold = product.chargeableGoldValue || 0;
                  const normalSubtotal = round2(product.subtotalBeforeTax - schemeGold);
                  // What the covered slice WOULD have carried. The backend
                  // scales gold profit, making and wastage by
                  //   normal_factor = (gold_value - scheme) / gold_value,
                  // so each billed charge is already the un-covered share and
                  // the waived part is  billed x scheme / chargeable_gold.
                  // This used to divide by (gold value + profit - scheme) and
                  // omitted the waived PROFIT altogether, which is how the
                  // banner read 2,323.64 against a true 6,556.00. GST then
                  // follows on the covered gold plus everything waived on it.
                  // None of it is added to any total: it is money not charged.
                  const coveredShare = chargeableGold > 0 ? schemeGold / chargeableGold : 0;
                  const waivedProfit = round2((product.goldProfitAmount || 0) * coveredShare);
                  const waivedMaking = round2((product.makingChargeAmount || 0) * coveredShare);
                  const waivedWastage = round2((product.wastageAmount || 0) * coveredShare);
                  const waivedTaxRate = product.gstApplied ? (product.taxRatePercent || 0) : 0;
                  const waivedGst = round2((schemeGold + waivedProfit + waivedMaking + waivedWastage) * waivedTaxRate / 100);
                  const waivedTotal = round2(waivedProfit + waivedMaking + waivedWastage + waivedGst);
                  const makingLabel = chargePct(product.makingChargeType, makingVal || product.makingChargeValue);
                  const wastageLabel = chargePct(product.wastageType, wastageVal || product.wastageValue);
                  const schemeGLabel = pureRate > 0 ? `${(product.schemeGramsEquivalent || schemeG).toFixed(3)} g of ${product.purity}` : null;
                  const taxLabel = product.gstApplied && product.taxRatePercent ? ` ${product.taxRatePercent}%` : "";
                  const disc = product.discountAmount || 0;
                  const totalPayable = round2(billTotal - schemeGold);
                  return (
                    <>
                      {/* One column. The scheme is taken off the gold value
                          where it was actually applied - the covered gold is
                          billed at pure gold value - instead of being deducted
                          from the total at the bottom. Same arithmetic, read
                          the way the customer reads it. */}
                      <Row label={goldValueLabel} value={money(goldValueShown)} />

                      {/* Which passbook paid what. With one scheme this is the
                          same figure as the line below, so it is shown only
                          when there is actually a split to see. */}
                      {schemeRows.length > 1 && (
                        <div className="my-1 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50/40">
                          {schemeRows.map((r) => (
                            <div key={r.key} className="flex items-center gap-2 border-b border-emerald-100 px-2.5 py-1 text-[11px] last:border-b-0">
                              <span className="min-w-0 flex-1 truncate font-semibold text-emerald-900" title={r.name}>{r.name}</span>
                              <span className="num w-24 text-right font-semibold text-emerald-900">{money(r.amount)}</span>
                              <span className="num w-20 text-right text-emerald-700">{rate24 > 0 ? `${r.g24.toFixed(3)} g` : "—"}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <Row
                        label={`Less: scheme credit${schemeGLabel ? ` (${schemeGLabel})` : ""}`}
                        value={`− ${money(schemeGold)}`}
                        tone="text-emerald-700"
                      />
                      {/* The margin rides in the gold value above, so it rides
                          into the chargeable figure too - otherwise this column
                          stops adding up. The gram sub-label is dropped here on
                          purpose: it describes the pure gold, and no longer
                          divides into this number. A label that does not match
                          its figure is the defect being avoided. */}
                      <Row label="Chargeable gold value" value={money(round2(chargeableGold + goldProfitLine))} divider />

                      <Row label={`Making Charge${makingLabel ? ` ${makingLabel}` : ""}`} value={money(product.makingChargeAmount)} />
                      <Row label={`Wastage${wastageLabel ? ` ${wastageLabel}` : ""}`} value={money(product.wastageAmount)} />
                      {product.stoneChargeAmount > 0 && <Row label="Stone Charge" value={money(product.stoneChargeAmount)} />}
                      {product.otherChargesAmount > 0 && <Row label="Other Charges" value={money(product.otherChargesAmount)} />}
                      {/* This is the GST base, and on a scheme bill it is the
                          CARVED base (1,63,186.95 on the S003 case) while the
                          invoice's "Subtotal" is the full one (2,03,186.95).
                          Both are right; one word carrying two numbers on one
                          sale is not. So the word Subtotal is left to the
                          invoice and the screen names this row for what it is.
                          With a discount present the post-discount row below is
                          the taxable value instead, so this one is named for
                          the base it actually is. */}
                      <Row label={disc > 0 ? "Chargeable value" : "Taxable value"} value={money(normalSubtotal)} divider />

                      {disc > 0 && (
                        <>
                          <Row label="Discount" value={`− ${money(disc)}`} tone="text-emerald-700" />
                          <Row label="Taxable value" value={money(round2(normalSubtotal - disc))} />
                        </>
                      )}
                      <Row label={`GST${taxLabel}`} value={money(product.taxAmount)} />
                      <Row label="Total Payable" value={money(totalPayable)} strong divider />

                      {/* What the scheme gold did NOT carry. Not deducted from
                          anything - it was never charged - but it is the whole
                          point of the scheme for the customer, so it is said. */}
                      {waivedTotal > 0 && (
                        <div className="mt-1.5 flex items-baseline justify-between gap-2 rounded-lg bg-emerald-100/70 px-2.5 py-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.06em] text-emerald-900">Not charged on the scheme gold</span>
                          <span className="num text-[12px] font-extrabold text-emerald-900">{money(waivedTotal)}</span>
                        </div>
                      )}
                      <p className="mt-1 text-[10px] leading-snug text-emerald-800/80">
                        The scheme&rsquo;s{pureRate > 0 ? ` ${schemeG.toFixed(3)} g ` : " "}gold is bought at pure gold value — no making charge, no wastage and no GST on it. Making and GST above are charged only on the
                        {pureRate > 0 ? ` ${normalG.toFixed(3)} g ` : " gold "}
                        it did not cover.
                      </p>

                      {/* Mirrors the Payment card. Until a status is picked
                          there is no paid/outstanding figure to state — printing
                          one asserts money that was never collected. */}
                      {paymentChosen ? (
                        <>
                          <Row label={payStatus === "PARTIAL" ? "Paid now" : payStatus === "PENDING" ? "Paid" : "Amount Paid"} value={money(paidNow)} />
                          <Row label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? "text-accent" : "text-emerald-700"} strong={outstanding > 0} />
                        </>
                      ) : (
                        <Row label="Payment" value="Not selected" tone="text-muted" />
                      )}
                    </>
                  );
                })() : (
                  <>
                    <Row label={goldValueLabel} value={money(goldValueShown)} />
                    <Row label={`Making Charge${chargePct(product.makingChargeType, makingVal || product.makingChargeValue) ? ` ${chargePct(product.makingChargeType, makingVal || product.makingChargeValue)}` : ""}`} value={money(product.makingChargeAmount)} />
                    <Row label={`Wastage${chargePct(product.wastageType, wastageVal || product.wastageValue) ? ` ${chargePct(product.wastageType, wastageVal || product.wastageValue)}` : ""}`} value={money(product.wastageAmount)} />
                    {product.stoneChargeAmount > 0 && <Row label="Stone Charge" value={money(product.stoneChargeAmount)} />}
                    {product.otherChargesAmount > 0 && <Row label="Other Charges" value={money(product.otherChargesAmount)} />}
                    <Row label="Subtotal" value={money(product.subtotalBeforeTax)} divider />
                    {/* A discount is excluded from the taxable value, so it is
                        taken off BEFORE the tax line and the taxable value is
                        stated - otherwise the column does not add up to the
                        total the customer pays. */}
                    {product.discountAmount > 0 && (
                      <>
                        <Row label="Discount" value={`− ${money(product.discountAmount)}`} tone="text-emerald-700" />
                        <Row label="Taxable value" value={money(round2(product.subtotalBeforeTax - product.discountAmount))} />
                      </>
                    )}
                    <Row label={`GST${product.gstApplied && product.taxRatePercent ? ` ${product.taxRatePercent}%` : ""}`} value={money(product.taxAmount)} />
                    <BillTotalBand label="Bill Total" value={money(billTotal)} />
                    {/* Mirrors the Payment card — see the note in the scheme
                        layout for why nothing shows until it is chosen. */}
                    {paymentChosen ? (
                      <>
                        <Row label={payStatus === "PARTIAL" ? "Paid now" : payStatus === "PENDING" ? "Paid" : "Amount Paid"} value={money(paidNow)} divider />
                        <Row label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? "text-accent" : "text-emerald-700"} strong={outstanding > 0} />
                      </>
                    ) : (
                      <Row label="Payment" value="Not selected" tone="text-muted" divider />
                    )}
                  </>
                )}
              </div>

              {(
                product.safePrice ? (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-800">Safe Price</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-[10px] font-bold uppercase text-muted">Current Price</div><div className="num text-sm font-extrabold">{money(product.finalAmount)}</div></div>
                      <div><div className="text-[10px] font-bold uppercase text-muted">Min Safe Price</div><div className="num text-sm font-extrabold">{minSafe != null ? money(minSafe) : "—"}</div></div>
                      <div><div className="text-[10px] font-bold uppercase text-muted">Max Discount</div><div className="num text-sm font-extrabold">{maxDiscount != null ? money(maxDiscount) : "—"}</div></div>
                    </div>
                    <div className="mt-2 text-[10px] leading-snug text-emerald-800/80">Lowest price with no loss, and how much is still cuttable.</div>
                    {product.safePrice.message && <div className={`mt-2 text-[11px] ${product.safePrice.isLoss ? "font-semibold text-danger" : "text-emerald-800"}`}>{product.safePrice.message}</div>}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-line bg-canvas/40 p-3 text-[11px] text-muted">Safe-price guidance needs this item's purchase cost — not available for it.</div>
                )
              )}

              {/* Below-cost approval. Offered only once the backend says this
                  price is a loss (or while an approval is already standing, so
                  it can be withdrawn). Selling under cost is legitimate —
                  clearance, damaged stock — but it is recorded against a name:
                  the sale carries the reason into its own audit row. */}
              {(product.safePrice?.isLoss || allowBelowCost) && !canApproveBelowCost && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 text-[11px] leading-snug text-amber-900">
                  This price is below what the piece cost. Only an Admin can approve a below-cost sale — ask an Admin to price this bill.
                </div>
              )}

              {(product.safePrice?.isLoss || allowBelowCost) && canApproveBelowCost && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3.5">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-amber-600"
                      checked={allowBelowCost}
                      onChange={(e) => { setAllowBelowCost(e.target.checked); if (!e.target.checked) setBelowCostReason(""); }}
                    />
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-900">Approve selling below cost</span>
                  </label>
                  <div className="mt-1.5 pl-[22px] text-[10px] leading-snug text-amber-900/80">
                    This price is under what the piece cost. The approval and its reason are written to the audit trail.
                  </div>
                  {allowBelowCost && (
                    <input
                      type="text"
                      value={belowCostReason}
                      onChange={(e) => setBelowCostReason(e.target.value)}
                      maxLength={255}
                      placeholder="Reason (e.g. clearance, damaged stock)"
                      className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-amber-500"
                    />
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <Button size="sm" className="bg-accent hover:bg-accent-strong w-full" disabled={!canCreate} onClick={handleCreateBill}>{creating ? "Working…" : schemeApplied ? "Create Bill & Redeem" : "Create Bill"}</Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={handleQuotation} disabled={creating || requoting}>Quotation</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={resetAll} disabled={creating}>Cancel</Button>
                </div>
              </div>
              {/* placeholder-anchor */}
              {!canCreate && !creating && (
                <p className="mt-2 text-center text-[11px] text-muted">
                  {!customerIdentified ? "Identify the buyer to enable billing."
                    : !paymentChosen ? "Select the payment method and status to enable billing."
                    : partialInvalid ? "Enter a valid part payment to enable billing."
                    : discountExceedsProfit ? "Reduce the discount to enable billing."
                    : redeemOverGold ? "Reduce the scheme redemption to enable billing."
                    : belowCostIncomplete ? "Enter the reason for selling below cost to enable billing."
                    : rateOutOfBand ? "Bring the sale rate back inside the allowed range to enable billing."
                    : ""}
                </p>
              )}
            </Card>
          </div>

          {/* Mobile action bar. On a phone the summary sits a screen below the
              controls, so the figure under negotiation and the way to commit it
              would both be off-screen. Safe-area padded for gesture-bar
              devices. Hidden at lg, where the pinned summary already does it. */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_16px_rgba(30,41,59,0.08)] backdrop-blur lg:hidden">
            <div className="mx-auto flex max-w-[640px] items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">
                  {schemeApplied ? "Balance to pay" : "Bill total"}
                </div>
                <div className="num truncate text-lg font-extrabold text-accent-strong">
                  {money(schemeApplied ? remaining : billTotal)}
                </div>
              </div>
              <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0 px-5" disabled={!canCreate} onClick={handleCreateBill}>
                {creating ? "Working…" : schemeApplied ? "Bill & Redeem" : "Create Bill"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {otp && (
        <OtpDialog
          otp={otp}
          onClose={onOtpAbandon}
          onDone={onOtpDone}
        />
      )}

      {quote && <QuoteDialog quote={quote} onClose={() => setQuote(null)} />}

      {invoice && <InvoiceDialog invoice={invoice} onClose={() => { setInvoice(null); resetAll(); }} />}
    </div>
  );
}

function InvoiceDialog({ invoice, onClose }) {
  const [busy, setBusy] = useState("");
  const download = async () => {
    setBusy("download");
    try { await billingService.downloadInvoicePdf(invoice.id, invoice.invoiceNumber); }
    catch (err) { toast(err?.message || "Could not download the invoice PDF"); }
    finally { setBusy(""); }
  };
  const print = async () => {
    setBusy("print");
    try { await billingService.openInvoicePdf(invoice.id); }
    catch (err) { toast(err?.message || "Could not open the invoice PDF"); }
    finally { setBusy(""); }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[420px] rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-base font-extrabold">Bill created</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
        </div>
        <div className="px-6 py-5 space-y-1">
          <p className="text-sm font-bold">{invoice.invoiceNumber}</p>
          <p className="text-xs text-muted">{invoice.finalAmount != null ? `Bill total ${money(invoice.finalAmount)}. ` : ""}The invoice PDF shows every line — scheme redemption, discount, amount paid and pending amount.</p>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={print} disabled={!!busy}>{busy === "print" ? "Opening…" : "Print"}</Button>
          <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={download} disabled={!!busy}>{busy === "download" ? "Downloading…" : "Download PDF"}</Button>
        </div>
      </div>
    </div>
  );
}

function QuoteDialog({ quote, onClose }) {
  const [busy, setBusy] = useState("");
  const download = async () => {
    setBusy("download");
    try { await billingService.downloadQuotationPdf(quote.id, quote.quotationNumber); }
    catch (err) { toast(err?.message || "Could not download the quotation PDF"); }
    finally { setBusy(""); }
  };
  const print = async () => {
    setBusy("print");
    try { await billingService.openQuotationPdf(quote.id); }
    catch (err) { toast(err?.message || "Could not open the quotation PDF"); }
    finally { setBusy(""); }
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[420px] rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-base font-extrabold">Quotation created</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
        </div>
        <div className="px-6 py-5 space-y-1">
          <p className="text-sm font-bold">{quote.quotationNumber}</p>
          <p className="text-xs text-muted">Total {money(quote.finalAmount)} · nothing sold. Download or print the quotation for the customer.</p>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={print} disabled={!!busy}>{busy === "print" ? "Opening…" : "Print"}</Button>
          <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={download} disabled={!!busy}>{busy === "download" ? "Downloading…" : "Download PDF"}</Button>
        </div>
      </div>
    </div>
  );
}

function OtpDialog({ otp, onClose, onDone }) {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");

  const verify = async () => {
    if (code.trim().length < 4) { setError("Enter the code sent to the customer's app."); return; }
    setVerifying(true); setError("");
    try {
      await enrollmentService.redeemSchemes(otp.saleId, otp.items, code.trim());
      onDone();
    } catch (err) {
      setError(err?.message || "Could not verify the code.");
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true); setError("");
    try { await enrollmentService.requestRedemptionOtp(otp.saleId); toast("A new code was sent"); }
    catch (err) { setError(err?.message || "Could not resend the code."); }
    finally { setResending(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[420px] rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h3 className="text-base font-extrabold">Verify scheme redemption</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-xs text-muted">Invoice {otp.invoiceNumber} is created and pending. Enter the code sent to the customer's app to redeem their scheme balance and settle it. Closing this without verifying voids the invoice and returns the item to stock.</p>
          <label className="grid min-w-0 gap-1.5"><span className="text-xs font-bold">Verification code *</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter code" onKeyDown={(e) => e.key === "Enter" && verify()} error={error || undefined} />
            {error && <span className="text-[11px] font-semibold text-danger">{error}</span>}
          </label>
          <button type="button" className="text-xs font-semibold text-accent hover:underline disabled:opacity-50" onClick={resend} disabled={resending}>{resending ? "Sending…" : "Resend code"}</button>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-accent hover:bg-accent-strong" disabled={verifying} onClick={verify}>{verifying ? "Verifying…" : "Verify & Redeem"}</Button>
        </div>
      </div>
    </div>
  );
}

const PnlCard = ({ label, amount, pct, sub, detail }) => {
  const pos = (amount || 0) >= 0;
  return (
    <div className={`rounded-xl border p-3 text-center ${pos ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${pos ? "text-emerald-700" : "text-red-700"}`}>{label}</div>
      <div className={`num mt-0.5 text-base font-extrabold ${pos ? "text-emerald-700" : "text-red-700"}`}>{amount < 0 ? "-" : ""}{money(Math.abs(amount || 0))}</div>
      <div className={`text-[10px] font-semibold ${pos ? "text-emerald-600" : "text-red-600"}`}>{pos ? "Profit" : "Loss"}{pct != null ? ` · ${Math.abs(pct).toFixed(2)}%` : ""}{sub ? <span className="ml-1 text-[9px] font-medium text-muted">{sub}</span> : null}</div>
      {detail ? <div className="num mt-1 text-[9px] font-medium leading-snug text-muted">{detail}</div> : null}
    </div>
  );
};

/** Numbered step header. The bill is a sequence, so the sequence is shown. */
const SectionHead = ({ step, title, meta }) => (
  <div className="flex items-center gap-2.5">
    {step != null && (
      <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-lg border border-accent-line bg-accent-soft text-[11px] font-extrabold text-accent-strong">
        {step}
      </span>
    )}
    <h3 className="text-sm font-extrabold">{title}</h3>
    {meta ? <span className="ml-auto text-[11px] font-semibold text-muted">{meta}</span> : null}
  </div>
);

/** One cell of the item spec strip: label over value, hairline separated. */
const SpecCell = ({ label, value, mono, sub, flush = false }) => (
  <div className={`min-w-0 flex-1 px-3.5 py-2.5 ${flush ? "first:pl-0 last:pr-0" : ""}`}>
    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{label}</div>
    <div className={`mt-0.5 truncate text-sm font-extrabold text-ink ${mono ? "num" : ""}`}>{value}</div>
    {sub ? <div className="truncate text-[10px] font-semibold text-muted">{sub}</div> : null}
  </div>
);

/** The one figure the whole screen exists to produce — given its own band so
    it stops competing with the charge rows above it. */
const BillTotalBand = ({ label, value }) => (
  <div className="mt-2 flex items-center justify-between gap-4 rounded-xl border border-accent-line bg-accent-soft px-3.5 py-2.5">
    <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-accent-strong">{label}</span>
    <span className="num text-lg font-extrabold text-accent-strong">{value}</span>
  </div>
);

const Row = ({ label, value, strong, divider, tone }) => (
  <div className={`flex items-center justify-between gap-4 py-1 ${divider ? "mt-1 border-t border-line pt-2" : ""} ${strong ? "mt-1 border-t border-line pt-2" : ""}`}>
    <span className={`text-xs ${strong ? "font-extrabold text-ink" : "text-muted"}`}>{label}</span>
    <span className={`num text-sm ${strong ? "text-base font-extrabold text-accent-strong" : `font-semibold ${tone || ""}`}`}>{value}</span>
  </div>
);
