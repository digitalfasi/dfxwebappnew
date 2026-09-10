import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input, SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { money, grams } from "@/_shared/utils";
import { billingService } from "@/modules/billing/billingService";
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
  const [priceDriver, setPriceDriver] = useState("ENGINE"); // ENGINE | PRICE | PROFIT

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
  const discountExceedsProfit = !schemeSelected && goldProfitCeiling != null && discountNum > goldProfitCeiling + 1e-6;

  // First HUID lookup — confirm a real sellable item and seed edit fields.
  const handleFind = useCallback(async () => {
    const key = code.trim();
    if (!key) { toast("Enter HUID"); return; }
    if (loading) return;
    setLoading(true); setLookupError("");
    setProduct(null); setProductCode("");
    setDiscount(""); setGst(true);
    setCustomerPrice(""); setGoldProfit(""); setPriceDriver("ENGINE");
    setSaleMode(null); // a fresh product always starts at the Online/Offline choice
    try {
      const q = await billingService.getSaleQuote(key, { discountAmount: 0, gstApplied: true });
      setProduct(q);
      setProductCode(q.productCode);
      setRate(q.goldRateApplied != null ? String(q.goldRateApplied) : "");
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
          // A scheme bill uses pure engine pricing on the covered slice: no manual
          // discount and no negotiated customer price stack on it (backend rejects
          // both). Otherwise, when a customer price drives the bill the backend
          // derives the discount itself — sending ours too would double-count it.
          discountAmount: schemeSelected ? 0 : (priceDriver === "PRICE" ? undefined : discountNum),
          gstApplied: gst,
          appliedRatePerGram: offline && rate !== "" ? num(rate) : undefined,
          makingChargeValue: makingVal !== "" ? num(makingVal) : undefined,
          makingChargeType: product?.makingChargeType || undefined,
          wastageValue: wastageVal !== "" ? num(wastageVal) : undefined,
          wastageType: product?.wastageType || undefined,
          // PRICE is a probe: the backend answers with the gold-profit trim that
          // reaches it, which we then adopt (see the effect below) so the bill is
          // driven by Gold Profit % alone — never by a discount line.
          customerPrice: priceDriver === "PRICE" && customerPrice !== "" ? num(customerPrice) : undefined,
          goldProfitPercent: priceDriver === "PROFIT" && goldProfit !== "" ? num(goldProfit) : undefined,
          // Carve the gold-savings slice so the Bill summary previews the exact
          // making/GST-free figures the OTP redemption will finalize.
          schemeValue: schemeSelected ? schemeRedeemRequested : undefined,
        });
        setProduct(q);
      } catch {
        /* keep last good breakdown; backend still validates at commit */
      } finally {
        setRequoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productCode, saleMode, rate, makingVal, wastageVal, discountNum, gst, customerPrice, goldProfit, priceDriver, schemeSelected, schemeRedeemRequested]);

  // Customer Price drives the bill: the backend returns the derived discount, so
  // mirror it into the Discount field. Quote 2,50,000 at 2,20,000 and the 30,000
  // lands here and in the Bill summary's Discount row. The Gold Profit % shown
  // alongside is the backend's own GOLD_PROFIT trim — the drop is absorbed from
  // gold profit only, never from making or wastage.
  useEffect(() => {
    if (priceDriver !== "PRICE" || !product) return;
    const d = String(round2(product.discountAmount || 0));
    setDiscount((prev) => (prev === d ? prev : d));
  }, [product, priceDriver]);

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

  const customerIdentified =
    customerMode === "existing" ? !!selectedCustomer?.id : walkinName.trim().length >= 2;

  const baseInputs = () => {
    const offline = saleMode === "OFFLINE";
    return {
      productCode: product.productCode,
      customerId: customerMode === "existing" ? selectedCustomer?.id : undefined,
      customerName: customerMode === "walkin" ? walkinName.trim() : undefined,
      customerPhone: customerMode === "walkin" ? (walkinPhone.trim() || undefined) : undefined,
      // A scheme (savings) bill carries no manual discount and no negotiated
      // customer price — the covered gold slice is already billed at pure gold
      // value. Sending either would make the OTP redemption's recompute reject the
      // sale ("a discount cannot be applied to a scheme bill").
      discountAmount: schemeSelected ? 0 : discountNum,
      gstApplied: gst,
      appliedRatePerGram: offline && rate !== "" ? num(rate) : undefined,
      makingChargeValue: makingVal !== "" ? num(makingVal) : undefined,
      makingChargeType: product.makingChargeType || undefined,
      wastageValue: wastageVal !== "" ? num(wastageVal) : undefined,
      wastageType: product.wastageType || undefined,
      customerPrice: priceDriver === "PRICE" && customerPrice !== "" ? num(customerPrice) : undefined,
      goldProfitPercent: priceDriver === "PROFIT" && goldProfit !== "" ? num(goldProfit) : undefined,
    };
  };

  // Pick the mode. Online restores the live purity rate (rate is the only thing
  // the mode changes); every other calculator control stays available in both.
  const selectMode = (m) => {
    setSaleMode(m);
    if (m === "ONLINE") setRate(product?.goldRateApplied != null ? String(product.goldRateApplied) : "");
  };

  // Natural asking price = payable before any negotiated discount. Backend keeps
  // subtotal + tax fixed when a customer price is sent (it only moves the
  // discount line), so final + discount is stable and never follows the typed
  // customer price. Selling Price moves only when the rate/charges change.
  const sellingPrice = product ? round2((product.finalAmount || 0) + (product.discountAmount || 0)) : 0;

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

  const canCreate =
    !!product && !creating && !requoting && !discountExceedsProfit &&
    customerIdentified && paymentChosen && !partialInvalid && !anyLineOverBalance && !redeemOverGold;

  const resetAll = () => {
    setProduct(null); setProductCode(""); setCode("");
    setRate(""); setMakingVal(""); setWastageVal(""); setDiscount(""); setGst(true);
    setPayMethod(""); setPayStatus(""); setPartialAmount(""); setPayRef("");
    setSaleMode(null); setCustomerPrice(""); setGoldProfit(""); setPriceDriver("ENGINE");
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
  // screen. If the void fails, the re-scan surfaces the real state calmly.
  const onOtpAbandon = async () => {
    const saleId = otp?.saleId;
    setOtp(null);
    setSchemeAmounts({});
    if (saleId) {
      try { await billingService.voidSale(saleId); toast("Redemption cancelled — item returned to stock"); }
      catch (err) { toast(err?.message || "Could not cancel cleanly — re-scan the item"); }
    }
    handleFind(); // refresh the product from the backend's true state
  };

  // The bill prints gold value and store margin as SEPARATE rows: folding the
  // margin into a single "Gold Value" line made the bill impossible to check by
  // hand (weight x rate did not equal the printed figure, and Making 3% was 3%
  // of the pure gold value, not of the printed one). goldValueLine stays as the
  // combined figure because the scheme split is computed against it.
  const goldValuePure = product ? (product.goldValueAmount || 0) : 0;
  const goldProfitLine = product ? (product.goldProfitAmount || 0) : 0;
  const goldValueLine = goldValuePure + goldProfitLine;

  return (
    <div ref={scope} className="mx-auto max-w-[1240px] pb-14">
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">New Sale</h2>
        <p className="mt-1 max-w-[64ch] text-sm text-muted">Enter the item's HUID, adjust the applicable rate and charges if needed, identify the buyer, then confirm the bill. Every amount is calculated by the backend.</p>
      </div>

      {/* HUID lookup */}
      <Card data-motion="reveal" className="p-5 sm:p-6">
        <h3 className="text-sm font-extrabold">Find product by HUID</h3>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 flex-1 min-w-[220px]">
            <span className="text-xs font-bold">HUID *</span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter HUID" onKeyDown={(e) => e.key === "Enter" && handleFind()} />
          </label>
          <Button size="sm" className="bg-accent hover:bg-accent-strong h-10 px-6" disabled={loading} onClick={handleFind}>{loading ? "Finding…" : "Find Product"}</Button>
        </div>
        {lookupError && <div className="mt-4 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{lookupError}</div>}
        {!product && !lookupError && !loading && <p className="mt-4 text-xs text-muted">No product loaded yet. Enter an HUID and select <span className="font-semibold">Find Product</span>.</p>}
      </Card>

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
                <div>
                  <div className="font-mono text-xs font-bold text-muted">HUID {product.huid || "Not provided"}</div>
                  <div className="text-base font-extrabold">{product.name || "Not provided"}</div>
                  <div className="mt-0.5 text-xs text-muted">{[product.category, product.subcategory].filter(Boolean).join(" · ") || "Not provided"}</div>
                </div>
                <Badge tone={product.stockStatus === "IN_STOCK" ? "success" : "warning"}>{product.stockStatus === "IN_STOCK" ? "In stock" : (product.stockStatus || "—")}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <MiniField label="Purity" value={product.purity || "Not provided"} />
                <MiniField label="Net Weight" value={grams(product.netGoldWeightGrams)} />
                <MiniField label={`${product.purity || ""} Rate/g`.trim()} value={product.goldRateApplied != null ? money(product.goldRateApplied) : "—"} />
              </div>
            </Card>

            {/* Mode bar — the mode only decides whether the rate is editable. */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas/40 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold uppercase tracking-wider text-muted">Mode</span>
                <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-bold text-white">{saleMode === "OFFLINE" ? "Offline" : "Online"}</span>
                <span className="text-[11px] text-muted">{saleMode === "OFFLINE" ? "Gold rate editable" : "Gold rate locked to live"}</span>
              </div>
              <button type="button" onClick={() => selectMode(saleMode === "OFFLINE" ? "ONLINE" : "OFFLINE")} className="text-[11px] font-bold text-accent underline">Switch to {saleMode === "OFFLINE" ? "Online" : "Offline"}</button>
            </div>

            {/* Billing calculator — same in BOTH modes (old web app, reskinned).
                Purchase Cost and Purchase-Cost P/L intentionally omitted. */}
                {/* Value cards + Customer Price + Today's-gold-value P/L. Purchase
                    Cost and Purchase-Cost P/L are intentionally omitted. */}
                <Card className="p-5 space-y-4">
                  <h3 className="text-sm font-extrabold">Pricing</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <PriceStat label="Today's Gold Value" value={money(todaysGoldValue)} />
                    <PriceStat label="Selling Price" value={money(sellingPrice)} />
                  </div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted">Customer Price</span>
                      {requoting && <span className="text-[10px] font-semibold text-muted">Updating…</span>}
                    </div>
                    <Input type="number" step="0.01" min="0" placeholder="₹0"
                      className="mt-2 h-14 text-center text-2xl font-extrabold"
                      value={priceDriver === "PRICE" ? customerPrice : (product.finalAmount != null ? String(round2(product.finalAmount)) : "")}
                      onChange={(e) => { setCustomerPrice(e.target.value); setPriceDriver("PRICE"); }} />
                    <p className="mt-1 text-[11px] text-muted">
                      {schemeSelected
                        ? <>Bill total for the piece. It is converted into the Gold Profit % it implies, so it survives the scheme redemption. Scheme {money(redeemTotal)} comes off — balance to pay {money(remaining)}.</>
                        : "Type the quoted price — Gold Profit % below updates to match."}
                    </p>
                  </div>
                  {product.currentGoldValuePnl != null && (
                    <PnlCard label="Today's Gold Value Profit / Loss" amount={product.currentGoldValuePnl} pct={product.currentGoldValueMarginPct} sub="vs today's gold value" />
                  )}
                </Card>

                {/* Editable rate + Gold Profit % + Making/Wastage + Discount */}
                <Card className="p-5 space-y-4">
                  <h3 className="text-sm font-extrabold">Rate &amp; charges</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1.5">
                      <span className="text-xs font-bold">{product.purity ? `${product.purity} ` : ""}Sale Rate/g (₹) *</span>
                      <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} disabled={saleMode === "ONLINE"} className={saleMode === "ONLINE" ? "opacity-60" : ""} />
                      <span className="text-[11px] text-muted">{saleMode === "ONLINE" ? `Published ${product.purity || ""} rate ${product.goldRateApplied != null ? money(product.goldRateApplied) : "—"} — locked in Online.` : `Editable. Default ${product.goldRateApplied != null ? money(product.goldRateApplied) : "—"} — the published ${product.purity || ""} rate.`}</span>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-bold">Gold Profit %</span>
                      <Input type="number" step="0.01" min="0" max="100" placeholder="10"
                        value={priceDriver === "PROFIT" ? goldProfit : (goldProfitShown != null ? String(round2(goldProfitShown)) : "")}
                        onChange={(e) => { setGoldProfit(e.target.value); setPriceDriver("PROFIT"); }} />
                      <span className="text-[11px] text-muted">{schemeSelected ? "Earned on the un-covered grams only — waived on the scheme-covered slice." : "Margin over gold value — drives the selling price."}</span>
                      {goldProfitSuggested != null && (
                        <span className="text-[11px] font-semibold text-accent-strong">Safe-price guidance: trimming to {round2(goldProfitSuggested)}% still avoids a loss.</span>
                      )}
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-bold">Making Charge {chargePct(product.makingChargeType, makingVal || product.makingChargeValue)}</span>
                      <Input type="number" step="0.01" min="0" value={makingVal} onChange={(e) => setMakingVal(e.target.value)} />
                      <span className="text-[11px] text-muted">= {money(product.makingChargeAmount)}</span>
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-xs font-bold">Wastage {chargePct(product.wastageType, wastageVal || product.wastageValue)}</span>
                      <Input type="number" step="0.01" min="0" value={wastageVal} onChange={(e) => setWastageVal(e.target.value)} />
                      <span className="text-[11px] text-muted">= {money(product.wastageAmount)}</span>
                    </label>
                    <label className="grid gap-1.5 sm:col-span-2">
                      <span className="text-xs font-bold">Discount (₹)</span>
                      <Input type="number" step="0.01" min="0" value={schemeSelected ? "" : discount} onChange={(e) => setDiscount(e.target.value)} disabled={schemeSelected} className={schemeSelected ? "opacity-60" : ""} error={discountExceedsProfit ? "Exceeds Gold Profit" : undefined} placeholder="0" />
                      {schemeSelected ? (
                        <span className="text-[11px] text-muted">Not available on a scheme bill — the covered gold slice is already billed at pure gold value.</span>
                      ) : goldProfitCeiling != null ? (
                        <span className={`text-[11px] ${discountExceedsProfit ? "font-semibold text-danger" : "text-muted"}`}>{discountExceedsProfit ? `Max discount ${money(goldProfitCeiling)} — a discount may only reduce Gold Profit.` : `Up to ${money(goldProfitCeiling)} can be absorbed from Gold Profit.`}</span>
                      ) : <span className="text-[11px] text-muted">A discount may only reduce Gold Profit.</span>}
                    </label>
                  </div>
                </Card>

            {/* Customer */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-extrabold">Customer</h3>
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
                        return (
                          <div key={s.enrollmentId} className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{s.schemeName}</div>
                              <div className="text-xs text-muted">Available {money(s.available)}</div>
                            </div>
                            <label className="grid gap-1">
                              <Input type="number" step="0.01" min="0" className="w-[150px]" placeholder="Redeem ₹" value={schemeAmounts[s.enrollmentId] ?? ""} onChange={(e) => setSchemeAmounts((p) => ({ ...p, [s.enrollmentId]: e.target.value }))} error={over ? "Over balance" : undefined} />
                              {over && <span className="text-[11px] font-semibold text-danger">Max {money(s.available)}</span>}
                            </label>
                          </div>
                        );
                      })}
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
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Name *</span><Input value={walkinName} onChange={(e) => setWalkinName(e.target.value)} placeholder="Walk-in buyer name" /></label>
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Phone</span><Input value={walkinPhone} onChange={(e) => setWalkinPhone(e.target.value)} placeholder="Optional" /></label>
                </div>
              )}
            </Card>

            {/* Payment */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-extrabold">Payment</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5"><span className="text-xs font-bold">Method *</span>
                  <Select value={payMethod} onValueChange={setPayMethod} placeholder="Select method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} />
                </label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Status *</span>
                  <Select value={payStatus} onValueChange={setPayStatus} placeholder="Select status" options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))} />
                </label>
                {payStatus === "PARTIAL" && (
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Paid now (₹) *</span>
                    <Input type="number" step="0.01" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} error={partialInvalid ? "Must be > 0 and < remaining" : undefined} />
                    {partialInvalid && <span className="text-[11px] font-semibold text-danger">Between {money(0)} and {money(remaining)}</span>}
                  </label>
                )}
                <label className="grid gap-1.5"><span className="text-xs font-bold">Reference No.</span><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional" /></label>
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
                    const ph = customerMode === "existing" ? selectedCustomer?.phone : walkinPhone.trim();
                    return ph && ph !== "—" ? ` · ${ph}` : "";
                  })()}
                </div>
              </div>

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
                {schemeApplied ? (() => {
                  const pureRate = Number(product.goldRateApplied) || 0;
                  const netG = Number(product.netGoldWeightGrams) || 0;
                  const schemeGold = product.schemeApplied || redeemTotal;
                  const schemeG = pureRate > 0 ? schemeGold / pureRate : 0;
                  const normalG = Math.max(0, netG - schemeG);
                  const normalGold = Math.max(0, goldValueLine - schemeGold);
                  const normalSubtotal = round2(product.subtotalBeforeTax - schemeGold);
                  const makingLabel = chargePct(product.makingChargeType, makingVal || product.makingChargeValue);
                  const wastageLabel = chargePct(product.wastageType, wastageVal || product.wastageValue);
                  return (
                    <>
                      <div className="mt-1 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-emerald-800">Scheme portion</span>
                          <span className="text-[10px] font-bold text-emerald-800">{pureRate > 0 ? `${schemeG.toFixed(3)} g of ${product.purity}` : "—"}</span>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          <Row label="Gold Value (pure gold value)" value={money(schemeGold)} />
                          <Row label="Making Charge" value="₹0.00 · waived" tone="text-emerald-700" />
                          {product.wastageAmount > 0 && <Row label="Wastage" value="₹0.00 · waived" tone="text-emerald-700" />}
                          <Row label="GST" value="₹0.00 · waived" tone="text-emerald-700" />
                          <Row label="Subtotal" value={money(schemeGold)} divider strong />
                        </div>
                      </div>

                      <div className="mt-2 rounded-xl border border-line bg-canvas/40 p-3">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-muted">Normal portion</span>
                          <span className="text-[10px] font-bold text-muted">{pureRate > 0 ? `${normalG.toFixed(3)} g of ${product.purity}` : "—"}</span>
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          <Row label="Gold Value" value={money(Math.max(0, goldValuePure - schemeGold))} />
                          {goldProfitLine > 0 && <Row label={`Gold Profit ${round2(product.goldProfitPercent || 0)}%`} value={money(goldProfitLine)} />}
                          <Row label={`Making Charge${makingLabel ? ` ${makingLabel}` : ""}`} value={money(product.makingChargeAmount)} />
                          <Row label={`Wastage${wastageLabel ? ` ${wastageLabel}` : ""}`} value={money(product.wastageAmount)} />
                          {product.stoneChargeAmount > 0 && <Row label="Stone Charge" value={money(product.stoneChargeAmount)} />}
                          {product.otherChargesAmount > 0 && <Row label="Other Charges" value={money(product.otherChargesAmount)} />}
                          <Row label={`GST${product.gstApplied && product.taxRatePercent ? ` ${product.taxRatePercent}%` : ""}`} value={money(product.taxAmount)} />
                          <Row label="Subtotal" value={money(round2(normalSubtotal + product.taxAmount))} divider strong />
                        </div>
                      </div>

                      <div className="mt-2 space-y-0.5">
                        <Row label="Total" value={money(billTotal)} strong />
                        <Row label="Scheme Savings" value={`− ${money(redeemTotal)}`} tone="text-emerald-700" />
                        <Row label="Balance to Pay" value={money(remaining)} strong divider />
                        <p className="mt-1 text-[10px] leading-snug text-emerald-800/80">
                          The scheme's{pureRate > 0 ? ` ${schemeG.toFixed(3)} g ` : " "}gold is bought at pure gold value — no making charge, wastage or GST on it. The remaining
                          {pureRate > 0 ? ` ${normalG.toFixed(3)} g ` : " gold "}
                          carries the full making charge, wastage and GST, so the Making &amp; GST above are already only on that share.
                        </p>
                        {(product.goldProfitAmount || 0) > 0 && (
                          <p className="text-[10px] leading-snug text-muted">
                            Gold profit sits entirely in the normal portion.
                          </p>
                        )}
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
                      </div>
                    </>
                  );
                })() : (
                  <>
                    <Row label={`Gold Value${product.netGoldWeightGrams && product.goldRateApplied ? ` (${Number(product.netGoldWeightGrams).toFixed(3)} g x ${money(product.goldRateApplied)})` : ""}`} value={money(goldValuePure)} />
                    {goldProfitLine > 0 && <Row label={`Gold Profit ${round2(product.goldProfitPercent || 0)}%`} value={money(goldProfitLine)} />}
                    <Row label={`Making Charge${chargePct(product.makingChargeType, makingVal || product.makingChargeValue) ? ` ${chargePct(product.makingChargeType, makingVal || product.makingChargeValue)}` : ""}`} value={money(product.makingChargeAmount)} />
                    <Row label={`Wastage${chargePct(product.wastageType, wastageVal || product.wastageValue) ? ` ${chargePct(product.wastageType, wastageVal || product.wastageValue)}` : ""}`} value={money(product.wastageAmount)} />
                    {product.stoneChargeAmount > 0 && <Row label="Stone Charge" value={money(product.stoneChargeAmount)} />}
                    {product.otherChargesAmount > 0 && <Row label="Other Charges" value={money(product.otherChargesAmount)} />}
                    <Row label="Subtotal" value={money(product.subtotalBeforeTax)} divider />
                    <Row label={`GST${product.gstApplied && product.taxRatePercent ? ` ${product.taxRatePercent}%` : ""}`} value={money(product.taxAmount)} />
                    {product.discountAmount > 0 && <Row label="Discount" value={`− ${money(product.discountAmount)}`} tone="text-emerald-700" />}
                    <Row label="Bill Total" value={money(billTotal)} strong />
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

              <div className="mt-5 flex flex-col gap-2">
                <Button size="sm" className="bg-accent hover:bg-accent-strong w-full" disabled={!canCreate} onClick={handleCreateBill}>{creating ? "Working…" : schemeApplied ? "Create Bill & Redeem" : "Create Bill"}</Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={handleQuotation} disabled={creating || requoting}>Quotation</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={resetAll} disabled={creating}>Cancel</Button>
                </div>
              </div>
              {!canCreate && !creating && (
                <p className="mt-2 text-center text-[11px] text-muted">
                  {!customerIdentified ? "Identify the buyer to enable billing."
                    : !paymentChosen ? "Select the payment method and status to enable billing."
                    : partialInvalid ? "Enter a valid part payment to enable billing."
                    : discountExceedsProfit ? "Reduce the discount to enable billing."
                    : redeemOverGold ? "Reduce the scheme redemption to enable billing."
                    : ""}
                </p>
              )}
            </Card>
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
          <label className="grid gap-1.5"><span className="text-xs font-bold">Verification code *</span>
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

const MiniField = ({ label, value }) => (
  <div className="rounded-xl border border-line bg-canvas/40 p-3">
    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
    <div className="mt-0.5 num text-sm font-extrabold">{value}</div>
  </div>
);

const PriceStat = ({ label, value, sub, tone }) => (
  <div className="rounded-xl border border-line bg-canvas/40 p-3">
    <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
    <div className={`num mt-0.5 text-sm font-extrabold ${tone || ""}`}>{value}</div>
    {sub ? <div className={`mt-0.5 text-[10px] font-semibold ${tone || "text-muted"}`}>{sub}</div> : null}
  </div>
);

const PnlCard = ({ label, amount, pct, sub }) => {
  const pos = (amount || 0) >= 0;
  return (
    <div className={`rounded-xl border p-3 text-center ${pos ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${pos ? "text-emerald-700" : "text-red-700"}`}>{label}</div>
      <div className={`num mt-0.5 text-base font-extrabold ${pos ? "text-emerald-700" : "text-red-700"}`}>{amount < 0 ? "-" : ""}{money(Math.abs(amount || 0))}</div>
      <div className={`text-[10px] font-semibold ${pos ? "text-emerald-600" : "text-red-600"}`}>{pos ? "Profit" : "Loss"}{pct != null ? ` · ${Math.abs(pct).toFixed(2)}%` : ""}{sub ? <span className="ml-1 text-[9px] font-medium text-muted">{sub}</span> : null}</div>
    </div>
  );
};

const Row = ({ label, value, strong, divider, tone }) => (
  <div className={`flex items-center justify-between gap-4 py-1 ${divider ? "mt-1 border-t border-line pt-2" : ""} ${strong ? "mt-1 border-t border-line pt-2" : ""}`}>
    <span className={`text-xs ${strong ? "font-extrabold text-ink" : "text-muted"}`}>{label}</span>
    <span className={`num text-sm ${strong ? "text-base font-extrabold text-accent-strong" : `font-semibold ${tone || ""}`}`}>{value}</span>
  </div>
);
