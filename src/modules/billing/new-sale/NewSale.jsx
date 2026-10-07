import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ProfitToggle } from "@/_shared/ui/profit-toggle";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input, MoneyInput, PhoneInput, SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { VERDICT, PnlWordCard } from "@/_shared/ui/verdict";
import { money, grams } from "@/_shared/utils";
import { billingService } from "@/modules/billing/billingService";
import { useAuth } from "@/_shared/AuthContext";
import { customerService } from "@/modules/customers/customerService";
import { enrollmentService } from "@/modules/plan/enrollment/enrollmentService";
import { useScannerInput, CameraScanner } from "@/modules/barcode/scanner";

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
  if (type === "PERCENTAGE") return `${Math.round(Number(value) * 100) / 100}%`;
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

export default function NewSale({ intent, clearIntent } = {}) {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [code, setCode] = useState("");
  const [productCode, setProductCode] = useState("");
  const [product, setProduct] = useState(null);
  const [goldRate, setGoldRate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [lookupError, setLookupError] = useState("");
  // Raw gold / bullion. One search box serves the whole counter: if the code
  // scanned is not a hallmarked piece it may be a bar, which is a different
  // TRADE - metal at the live rate plus GST, no making, no wastage, no
  // discount, no scheme - so the screen switches rather than pretending a bar
  // is a piece with all its charges zeroed.
  const [rawGold, setRawGold] = useState(null);
  const [rawGoldRate, setRawGoldRate] = useState("");
  const [rawGoldGst, setRawGoldGst] = useState(true);
  const [rawGoldPaid, setRawGoldPaid] = useState("");
  const [rawGoldMethod, setRawGoldMethod] = useState("CASH");
  // How the bar is being settled, in the same three words a jewellery bill
  // uses. It was a bare "Amount collected, leave 0 to bill it as outstanding",
  // which made the counter translate their intent into a number.
  const [rawGoldStatus, setRawGoldStatus] = useState("");
  const [rawGoldBusy, setRawGoldBusy] = useState(false);

  // Re-price the bar whenever the counter changes the rate or the GST switch.
  // The rate is the only negotiable number on a bar, because on a bar the rate
  // IS the price - there is no charge to move instead.
  useEffect(() => {
    if (!rawGold?.serialNumber) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const rg = await billingService.getRawGoldQuote(rawGold.serialNumber, {
          appliedRatePerGram: Number(rawGoldRate) || undefined,
          gstApplied: rawGoldGst,
        });
        if (alive) setRawGold((prev) => (prev ? { ...rg } : prev));
      } catch { /* keep the last good figures on screen */ }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawGoldRate, rawGoldGst, rawGold?.serialNumber]);

  async function createRawGoldSale() {
    if (!rawGold) return;
    setRawGoldBusy(true);
    try {
      const sale = await billingService.sellRawGold({
        serialNumber: rawGold.serialNumber,
        customerId: customerMode === "existing" ? (selectedCustomer?.id || undefined) : undefined,
        customerName: customerMode === "existing" ? (selectedCustomer?.name || undefined) : (walkinName || undefined),
        customerPhone: customerMode === "existing" ? undefined : (walkinPhone || undefined),
        appliedRatePerGram: Number(rawGoldRate) || undefined,
        gstApplied: rawGoldGst,
        paymentMethod: rawGoldMethod,
        // Derived from the status, never typed alongside it: PAID settles the
        // whole bill, PARTIAL takes what was handed over, PENDING takes none.
        amountPaid: rawGoldPaidNow,
      });
      setRawGold(null); setRawGoldRate(""); setRawGoldPaid(""); setRawGoldStatus(""); setCode("");
      if (sale?.id) {
        setInvoice({
          id: sale.id,
          invoiceNumber: sale.invoice_number,
          finalAmount: sale.final_amount,
        });
      } else {
        // No id back means no PDF to offer; say what happened rather than
        // opening a dialog whose buttons cannot work.
        toast(`Bill ${sale?.invoice_number || ""} created`);
      }
    } catch (err) {
      toast(err?.message || "Could not create the bill");
    } finally {
      setRawGoldBusy(false);
    }
  }
  const [creating, setCreating] = useState(false);

  // Editable pricing inputs (seeded once from the first quote).
  const [rate, setRate] = useState("");
  const [makingVal, setMakingVal] = useState("");
  const [wastageVal, setWastageVal] = useState("");
  // What the admin has typed into the Discount box. It is NOT cleared on blur:
  // the figure they entered stands, and the line beneath states what the bill
  // does with it. Snapping the box to a re-derived value was the screen editing
  // the admin's own number behind their back - they type 8,000 and the field
  // answers 7,996.80. The machine advises; it does not overrule.
  const [discountText, setDiscountText] = useState(null);
  // Exchange value (owner 2026-09-28): what the customer's old gold is worth.
  // It comes off what they pay now; the bill's value and GST do not change.
  const [exchangeText, setExchangeText] = useState("");
  // GST is compulsory on every bill - there is no off (owner 2026-09-26).
  const [gst, setGst] = useState(true);
  // Profit / cost figures stay hidden until the admin asks for them, so a
  // customer across the counter never sees the margin. Resets on every piece.
  const [showProfit, setShowProfit] = useState(false);

  // Sale mode (doc Point 12). ONLINE = live gold rate, engine price, everything
  // locked. OFFLINE (full cash) = editable gold rate, customer price and gold
  // profit %. The Customer Price box, the Discount box and the Making Charge
  // box are three views of one bill: change any of them and the other two, and
  // the summary on the right, move with it.
  const [saleMode, setSaleMode] = useState(null); // null until the admin picks Online/Offline
  // Why the last re-quote was refused. Held separately from the breakdown so
  // the previous good figures stay on screen while the reason is stated.
  const [quoteError, setQuoteError] = useState("");
  // What the admin has typed into the Customer Price box while they are still
  // typing. null means "show the price the bill actually comes to". There is no
  // longer a price DRIVER: the concession has exactly one home, the making
  // charge, and Customer Price is that same concession read from the far end.
  // Two drivers - a solved-down making charge on one path and a discount line
  // on the other - is what made the two halves of this screen describe
  // different bills.
  const [priceText, setPriceText] = useState(null);
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
  // How many of this customer's schemes could not be read. A balance call that
  // failed used to be dropped from the list in silence, so the counter billed
  // without a credit the customer had already paid for.
  const [schemeLoadFailures, setSchemeLoadFailures] = useState(0);
  const [schemeAmounts, setSchemeAmounts] = useState({}); // {enrollmentId: string}

  // Payment
  // No default method and no default status. A pre-selected "Cash / Paid in
  // full" silently asserts money was collected: one distracted click on
  // Create Bill and the invoice is settled in the ledger against cash nobody
  // counted. The admin states both, every time.
  // A draft is an unfinished bill, not a sale: it holds no stock, takes no
  // invoice number and appears in no revenue figure. resumedDraftId is the
  // draft this screen came from, so billing it removes it rather than leaving
  // the same unfinished bill sitting in the list beside a real invoice.
  const [resumedDraftId, setResumedDraftId] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [drafts, setDrafts] = useState(null);
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
  const taxRate = (product?.gstApplied ? (product?.taxRatePercent || 0) : 0) / 100;
  const taxFactor = 1 + taxRate;
  // The gold a scheme has already bought carries NO GST. Converting between a
  // pre-tax figure and a bill total therefore has to leave that slice out,
  // which a flat x(1 + rate) does not - it taxed the covered gold as well and
  // put the asking price 3% of the credit too high. These two are exact
  // inverses of each other and of what the backend does.
  const schemeCovered = Number(product?.schemeApplied) || 0;
  const toFinal = (pre) => round2(pre + Math.max(0, pre - schemeCovered) * taxRate);
  const toPretax = (final) => round2((final + schemeCovered * taxRate) / taxFactor);
  // The band the counter prices inside, as the owner set it: 14% is list, of
  // which 4% is the tunch paid to the vendor and 4% is running cost - 8% that
  // is already spent and cannot be given away. 11% is break-even. Below that
  // the bill loses money. These are guidance; the hard stop is still the
  // item's real purchase cost, which the backend enforces.
  // These were welded at 14 and 11, which is only right for a lot bought at 4%
  // tunch. Every band on this screen now comes from the backend's own
  // resolver for THIS piece - base 6% + the store's running cost + the lot's
  // tunch - so the wording beside the field can never contradict the verdict.
  // The constants survive only as the shape to fall back to when a Staff user
  // gets no bands at all.
  const MAKING_LIST_FALLBACK_PCT = 14;
  const bands = product?.makingBands || null;
  const listPct = bands?.listPercent ?? MAKING_LIST_FALLBACK_PCT;
  const breakEvenPct = bands?.breakEvenFloorPercent ?? 11;
  const profitFloorPct = bands?.profitFloorPercent ?? 14;

  // ===========================================================================
  // ONE concession, three boxes.
  //
  // Customer Price, Discount and Making Charge are not three quantities. They
  // are three readings of the SAME giving-away, and it lives in the making
  // charge: coming down from a 14% list to 10% IS the concession, it is not a
  // concession on top of one. Holding a separate discount alongside the charge
  // is what made this screen contradict itself - drop the making charge and the
  // discount typed earlier stayed put, the two together overshot the floor, the
  // backend refused the quote, and the panel sat on a stale breakdown printing
  // a 1% making charge beside the rupees for 14%. It is also where the negative
  // "Max discount -2,036.82" came from.
  //
  // The making charge is now the only state. The other two are derived from it,
  // and typing into either sets it. Nothing can disagree, because there is only
  // one number to disagree about.
  // ===========================================================================
  const agreedPct = makingVal !== "" ? num(makingVal) : listPct;
  // The gold the making charge is actually levied on - scheme-covered grams
  // carry no charge, so they are no part of it.
  const chargeableGold = product
    ? Math.max(0, (product.goldValueAmount || 0) - (Number(product.schemeApplied) || 0))
    : 0;
  const pctToRupees = (pct) => round2((pct / 100) * chargeableGold);
  const rupeesToPct = (rs) => (chargeableGold > 0 ? (rs / chargeableGold) * 100 : 0);
  // Given away, before tax: the distance from list down to what was agreed.
  const concession = product ? Math.max(0, pctToRupees(listPct - agreedPct)) : 0;
  // The bill at the full list charge. Built from the backend's own figures -
  // its pre-tax subtotal with the quoted making charge taken out and the list
  // charge put back - so this anchor cannot drift from what the server bills.
  // subtotalBeforeTax is the CARVED subtotal, so the list charge put back has
  // to be the carved one too - pctToRupees already works off chargeableGold.
  // Mixing the full gold value with a charge on the chargeable gold produced an
  // asking price for a bill that does not exist (Rs 3,41,699.66 against a real
  // Rs 3,10,799.66), and the discount ceiling was measured from it.
  const askingPretax = product
    ? round2((product.subtotalBeforeTax || 0) - (product.makingChargeAmount || 0) + pctToRupees(listPct))
    : 0;
  const askingPrice = toFinal(askingPretax);
  const minSafe = product?.safePrice?.minimumSafePrice;
  // What may still be given, down to whichever floor binds - and never below
  // zero. The old ceiling mixed two unrelated quantities and could go negative.
  // Staff get no bands and no safe price from the server (profit words only),
  // so there is no ceiling to show them - never one invented from fallbacks.
  const discountCeiling = !product
    ? null
    : minSafe != null
      ? Math.max(0, round2(askingPretax - toPretax(minSafe)))
      : bands
        ? Math.max(0, pctToRupees(listPct - breakEvenPct))
        : null;
  // Past the ceiling the bill eats the gold profit (BREAK_EVEN) or loses
  // money (LOSS). Owner rule 2026-09-28: that is shown, never blocked.
  const discountExceedsProfit = discountCeiling != null && concession > discountCeiling + 1e-6;
  const discountBlocks = false;
  const ceilingReason = "beyond that the bill goes below break-even";

  /** The three setters. Each writes the ONE number and releases the other two
   *  boxes back to being derived, so no box can hold a figure typed against an
   *  older asking price. */
  const setAgreedPct = (pct) => {
    // SIX decimals, not two. A concession is typed in rupees and stored as a
    // percentage, and rounding that percentage to 2dp moved the money: a typed
    // 8,000 came back as 7,996.80. The percentage is a carrier here, not a
    // figure anyone negotiates in, so it keeps enough precision to hold the
    // rupees the admin actually agreed.
    const clamped = Math.max(0, Math.round(pct * 1e6) / 1e6);
    setMakingVal(String(clamped));
  };
  const onMakingInput = (v) => { setMakingVal(v); setDiscountText(null); setPriceText(null); };
  const onDiscountInput = (v) => {
    setDiscountText(v);
    setPriceText(null);
    if (!product) return;
    setAgreedPct(v === "" ? listPct : listPct - rupeesToPct(num(v)));
  };
  const onCustomerPriceInput = (v) => {
    setPriceText(v);
    setDiscountText(null);
    if (!product) return;
    if (v === "" || v == null) { setAgreedPct(listPct); return; }
    // Both ends converted through the scheme-aware inverse, so a typed price
    // maps to the concession that actually produces it.
    const off = Math.max(0, askingPretax - toPretax(toBillTotal(num(v))));
    setAgreedPct(listPct - rupeesToPct(off));
  };
  // The backend solves a typed price into the making charge and echoes the
  // value back, so this is read from the quote and never recomputed here -
  // two places deriving the same percentage is how they come to disagree.
  // The making charge as a share of the gold actually charged for. Read off
  // the backend's own figures so it is right for a per-gram or fixed charge
  // too, where there is no percentage to read.
  const impliedMakingPct = (() => {
    if (!product) return null;
    const chargeable = (product.goldValueAmount || 0) - (Number(product.schemeApplied) || 0);
    if (!(chargeable > 0)) return null;
    return ((product.makingChargeAmount || 0) / chargeable) * 100;
  })();
  // Why the making % is what it is - display only, from the backend's bands.
  // The "tunch" band is the HIGHER of the lot's Tunch and what the piece
  // really cost over today's gold (backend _cost_premium_pct), so when it is
  // the cost that sets it, say so with the rupees behind it.
  const makingSplit = (() => {
    if (!product || !bands) return null;
    const chargeable = (product.goldValueAmount || 0) - (Number(product.schemeApplied) || 0);
    const nonMaking = (product.subtotalBeforeTax || 0) - (product.makingChargeAmount || 0);
    const cost = Number(product.purchaseCost);
    const premiumPct = cost > 0 && chargeable > 0 ? ((cost - nonMaking) / chargeable) * 100 : null;
    const costDriven = premiumPct != null && Math.abs(premiumPct - (bands.tunchPercent || 0)) < 0.02;
    return { cost, nonMaking, costDriven };
  })();
  // The verdict is the backend's. The local fallback keeps the colour right
  // between quotes and uses the same 11% line, never a second rule.
  const billVerdict =
    product?.profitLabel
    || (impliedMakingPct == null
          ? "BREAK_EVEN"
          // Same rule the backend applies: above break-even (tunch + running)
          // is profit, exactly on it is break-even, below it is a loss.
          : impliedMakingPct > breakEvenPct + 0.005
            ? "PROFIT"
            : impliedMakingPct < breakEvenPct - 0.005
              ? "LOSS"
              : "BREAK_EVEN");

  // First HUID lookup — confirm a real sellable item and seed edit fields.
  const handleFind = useCallback(async (scanned) => {
    const key = (typeof scanned === "string" ? scanned : code).trim();
    if (!key) { toast("Enter a HUID, Item Code or serial number"); return; }
    if (loading) return;
    setLoading(true); setLookupError("");
    setProduct(null); setProductCode("");
    setRawGold(null); setRawGoldRate("");
    setDiscountText(null); setGst(true); setShowProfit(false);
    setPriceText(null); setQuoteError("");
    setSaleMode(null);
    try {
      const q = await billingService.getSaleQuote(key, { discountAmount: 0, gstApplied: true });
      setProduct(q);
      setProductCode(q.productCode);
      // The piece decides the mode; the cashier does not. HUID = ONLINE (rate
      // locked at the published rate before tax); Item Code = OFFLINE (rate
      // editable). The
      // backend refuses an edited rate on a HUID piece as well.
      const mode = (q.huid || "").trim() ? "ONLINE" : "OFFLINE";
      const published = q.goldRateApplied != null ? q.goldRateApplied : null;
      setSaleMode(mode);
      setRate(published == null ? "" : String(round2(published)));
      setPublishedRate(published);
      // The list percentage for THIS piece: the shop's base plus its running
      // cost plus the tunch of the lot this piece was received on. It was a
      // hard-coded 14, which is only right when the lot happened to be bought
      // at 4% tunch - every dearer lot was billed as if it had been cheap.
      // Only for a PERCENTAGE charge: seeding a percentage into a FIXED field
      // would bill that many rupees.
      // The shop's rule decides this, not the number frozen on the piece when
      // it was added to stock: base 6% + the store's running cost + THIS lot's
      // tunch. HU8879 carried an old 11% and that 11 was winning over the rule,
      // which is why the screen opened at break-even with nothing to discount.
      // The piece's own value is the fallback, for a non-percentage charge.
      setMakingVal(
        (q.makingChargeType || "PERCENTAGE") !== "PERCENTAGE"
          ? (q.makingChargeValue != null ? String(q.makingChargeValue) : "")
          : q.makingBands?.listPercent != null ? String(round2(q.makingBands.listPercent))
          : q.makingChargeValue != null ? String(q.makingChargeValue)
          : String(MAKING_LIST_FALLBACK_PCT)
      );
      setWastageVal(q.wastageValue != null ? String(q.wastageValue) : "");
      toast(`Found ${q.huid || key}`);
    } catch (err) {
      // 409 with this shape is the backend saying "that is a bullion bar".
      // Load it on the raw-gold path instead of making the user find another
      // screen - they scanned a real thing the shop really holds.
      if (err?.status === 409 && /raw gold/i.test(err?.message || "")) {
        try {
          const rg = await billingService.getRawGoldQuote(key);
          setRawGold(rg);
          setRawGoldRate(rg.publishedRatePerGram != null ? String(rg.publishedRatePerGram) : "");
          toast(`Found bar ${rg.serialNumber}`);
          return;
        } catch (e2) {
          setLookupError(e2?.message || `Could not price bar ${key}`);
          return;
        }
      }
      setLookupError(err?.message || `No sellable item found for ${key}`);
    } finally {
      setLoading(false);
    }
  }, [code, loading]);

  // A scan (USB scanner, phone app or camera) runs the same lookup as Find
  // Product. With a bill already open it never replaces the piece on its own:
  // the code is put in the box and the cashier confirms with Find Product.
  const [cameraOpen, setCameraOpen] = useState(false);
  // Once an item is on the bill the lookup folds away (the item card has a
  // "Change item" button). Display only - nothing about the lookup changes.
  const [findOpen, setFindOpen] = useState(false);
  useEffect(() => { setFindOpen(false); }, [product]);

  // The summary moves WITH the form - its top edge stays level with the left
  // column's - until its bottom (Safe Price, Create Bill) reaches the foot of
  // the screen, and pins there. So nothing in it is ever out of reach, there
  // is no second scrollbar inside the card, and the two columns' top edges
  // match whether profit is shown or hidden. (Pinning at the top instead left
  // it 16px below the left column whenever it was short enough to fit.)
  const summaryRef = useRef(null);
  const [summaryTop, setSummaryTop] = useState(16);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el) return;
    let scroller = el.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const measure = () => {
      const view = scroller ? scroller.clientHeight : window.innerHeight;
      // Never more than where the grid starts, or the summary would be
      // pushed down before anything has scrolled.
      let gridEl = el.parentElement;
      while (gridEl && getComputedStyle(gridEl).display !== "grid") gridEl = gridEl.parentElement;
      const grid = (gridEl || el.parentElement).getBoundingClientRect().top;
      const start = scroller ? grid - scroller.getBoundingClientRect().top + scroller.scrollTop : grid + window.scrollY;
      setSummaryTop(Math.min(start, view - el.offsetHeight - 16));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (scroller) ro.observe(scroller);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [product, saleMode]);
  const onScanned = useCallback((raw) => {
    const v = String(raw || "").trim().toUpperCase();
    if (!v) return;
    if (product || rawGold) {
      const onBill = [code, product?.productCode, product?.huid].map((x) => String(x || "").trim().toUpperCase());
      if (onBill.includes(v)) { toast("This piece is already on the bill"); return; }
      setCode(v);
      toast(`Scanned ${v} - press Find Product to bill it instead`);
      return;
    }
    setCode(v);
    handleFind(v);
  }, [product, rawGold, code, handleFind]);
  useScannerInput(onScanned, !loading && !cameraOpen);
  const onCameraResult = useCallback((v) => { setCameraOpen(false); onScanned(v); }, [onScanned]);
  const closeCamera = useCallback(() => setCameraOpen(false), []);
  // Arrived from a scan on another page: bill that piece.
  useEffect(() => {
    if (!intent?.scan) return;
    const v = intent.scan;
    clearIntent?.();
    onScanned(v);
  }, [intent]); // eslint-disable-line react-hooks/exhaustive-deps

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
          // Always 0. The concession is the making charge coming down, and it
          // is already inside makingChargeValue below - sending it again as a
          // discount line would take it off the bill twice.
          discountAmount: 0,
          gstApplied: gst,
          // Both modes send the rate they display (ex-tax published rate for
          // ONLINE); only OFFLINE lets it be edited.
          appliedRatePerGram: rate !== "" && !rateOutOfBand ? num(rate) : undefined,
          makingChargeValue: makingVal !== "" ? num(makingVal) : undefined,
          makingChargeType: product?.makingChargeType || undefined,
          wastageValue: wastageVal !== "" ? num(wastageVal) : undefined,
          wastageType: product?.wastageType || undefined,
          // The gold line is the published rate times the weight and nothing
          // else. Margin is the making charge, so the item's stored profit %
          // is explicitly overridden to 0 rather than left to apply itself.
          goldProfitPercent: 0,
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
  }, [productCode, saleMode, rate, makingVal, wastageVal, gst, schemeSelected, schemeRedeemRequested, allowBelowCost]);

  // There is deliberately NO effect writing back into the making charge. One
  // used to mirror the backend's solved value into this field, and because a
  // quote comes back after every keystroke it kept snapping the number the
  // admin had just typed back to the item's own - the field could not be
  // edited at all. The making charge is now the admin's input and nothing
  // writes to it but the admin.

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
    setSchemeOptions([]); setSchemeAmounts({}); setSchemeLoadFailures(0);
    if (!customerId) return;
    setSchemeLoading(true);
    try {
      const enrolls = await enrollmentService.getEnrollments(customerId);
      const active = enrolls.filter((e) => String(e.status || "").toUpperCase() !== "CANCELLED");
      const balances = await Promise.all(active.map((e) => enrollmentService.getBalance(e.id).catch(() => null)));
      // A null here is a balance that could not be READ, not a scheme with
      // nothing in it. Both used to vanish into the same filter, so a transient
      // failure silently shortened a list of money and the bill went out without
      // a credit the customer had already paid for. Count them and say so.
      setSchemeLoadFailures(balances.filter((b) => b == null).length);
      const opts = balances
        .filter((b) => b && b.can_redeem && (b.available_balance || 0) > 0)
        .map((b) => ({ enrollmentId: b.enrollment_id, schemeName: b.scheme_name, available: b.available_balance }));
      setSchemeOptions(opts);
    } catch {
      setSchemeOptions([]);
      // The enrollment list itself failed, so nothing is known about this
      // customer's schemes at all - which must not read as "has none".
      setSchemeLoadFailures(-1);
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
  // The credit this request will actually carve. The backend caps the redeemed
  // amount at the piece's gold value, so the same cap is applied here - the
  // figure has to be the one the server will use, not the one that was asked
  // for, or the conversion below lands on a different total.
  const schemeCarveNow = Math.min(
    schemeRedeemRequested,
    Number(product?.goldValueAmount) || schemeRedeemRequested
  );
  // On a scheme bill the counter types what the CUSTOMER PAYS, because that is
  // the number said out loud at the counter. The backend's customer_price is
  // the whole bill - the scheme is settled against it as a payment - so the
  // credit is added back on the way out and taken off again on the way in.
  const toBillTotal = (paid) => round2(Number(paid) + schemeCarveNow);
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
  // Not with a scheme on the same bill: the scheme re-prices the invoice after
  // the OTP, so the two settlements are kept apart.
  const exchangeValue = schemeSelected ? 0 : round2(num(exchangeText));
  const exchangeInvalid = exchangeValue > billTotal + 0.005;
  const remaining = Math.max(0, Number((billTotal - redeemTotal - exchangeValue).toFixed(2)));

  const partialNum = num(partialAmount);
  const partialInvalid = payStatus === "PARTIAL" && !(partialNum > 0 && partialNum < remaining);
  const paymentChosen = !!payMethod && !!payStatus;
  const paidNow = payStatus === "PAID" ? remaining : payStatus === "PARTIAL" ? partialNum : 0;
  const outstanding = Math.max(0, Number((remaining - paidNow).toFixed(2)));

  // Empty is valid (a walk-in need not give a number); anything typed has to be
  // all ten digits. PhoneInput already refuses letters, symbols and an 11th
  // digit, so this only guards the half-typed case.
  // A walk-in bill used to be raisable with no number at all. The shop cannot
  // call that customer back about a repair, an order or a return, and the bill
  // carries the number, so it is required now - and required in full: nine
  // digits is not a phone number.
  const walkinPhoneInvalid = customerMode === "walkin" && walkinPhone.length !== 10;
  // A bill needs a buyer, the same as any other. Either a real customer is
  // chosen, or a walk-in is named with a phone that is either blank or whole.
  //
  // Declared HERE, after the state it reads. It sat near the top of the
  // component and referenced customerMode/selectedCustomer/walkinName, all
  // declared a hundred lines below - a const evaluated on every render before
  // its dependencies exist, which is a temporal dead zone error. New Sale threw
  // "Cannot access before initialization" and the router fell back to another
  // page, so the whole screen was unreachable.
  const rawGoldBuyerReady =
    (customerMode === "existing" ? !!selectedCustomer?.id : walkinName.trim().length >= 2) && !walkinPhoneInvalid;

  const customerIdentified =
    (customerMode === "existing" ? !!selectedCustomer?.id : walkinName.trim().length >= 2) && !walkinPhoneInvalid;

  // The buyer's name as the bar's summary prints it. Declared with the rest of
  // the buyer reads, below the state they depend on - see rawGoldBuyerReady.
  const rawGoldBuyerName =
    customerMode === "existing" ? (selectedCustomer?.name || "") : walkinName.trim();

  // The bar's settlement, derived from the chosen status so the two can never
  // disagree: paid in full settles the bill, partial takes what was handed
  // over, pending takes nothing and the whole bill stands outstanding.
  const rawGoldTotal = rawGold ? round2(rawGold.finalAmount || 0) : 0;
  const rawGoldPaidNum = num(rawGoldPaid);
  const rawGoldPartialInvalid =
    rawGoldStatus === "PARTIAL" && !(rawGoldPaidNum > 0 && rawGoldPaidNum < rawGoldTotal);
  const rawGoldPaidNow =
    rawGoldStatus === "PAID" ? rawGoldTotal : rawGoldStatus === "PARTIAL" ? rawGoldPaidNum : 0;
  const rawGoldOutstanding = round2(Math.max(0, rawGoldTotal - rawGoldPaidNow));

  const baseInputs = () => {
    return {
      productCode: product.productCode,
      customerId: customerMode === "existing" ? selectedCustomer?.id : undefined,
      customerName: customerMode === "walkin" ? walkinName.trim() : undefined,
      customerPhone: customerMode === "walkin" ? (walkinPhone.trim() || undefined) : undefined,
      // Carried through on a scheme bill as well — the redemption's recompute
      // replays the sale's own discount, so it survives the carve-out.
      discountAmount: 0,   // in the making charge already - see the quote effect
      gstApplied: gst,
      // Both modes, exactly as the quote sends it, so the bill charges the rate
      // the screen showed.
      appliedRatePerGram: rate !== "" && !rateOutOfBand ? num(rate) : undefined,
      makingChargeValue: makingVal !== "" ? num(makingVal) : undefined,
      makingChargeType: product.makingChargeType || undefined,
      wastageValue: wastageVal !== "" ? num(wastageVal) : undefined,
      wastageType: product.wastageType || undefined,
      goldProfitPercent: 0,
      allowBelowCost: allowBelowCost || undefined,
      belowCostReason: allowBelowCost ? belowCostReason.trim() : undefined,
      // The credit about to be redeemed against this bill. Validation only -
      // the sale is stored uncarved and the carve still happens inside the OTP
      // redemption - but a discount that could not survive that carve is now
      // refused here, at the counter, instead of at the OTP step.
      schemeValue: schemeSelected ? schemeRedeemRequested : undefined,
      exchangeValue: exchangeValue > 0 ? exchangeValue : undefined,
    };
  };

  // The metal rate both modes quote: the published rate for the purity, BEFORE
  // tax (owner decision 2026-09-25). Online locks it; Offline lets it be edited.
  // The bill's own GST line is separate and applies in both modes.
  const modeRate = (m) => {
    const base = publishedRate;
    if (base == null) return "";
    return String(round2(base));
  };

  // Pick the mode. It changes the metal rate and nothing else; every other
  // calculator control stays available in both.
  const selectMode = (m) => {
    setSaleMode(m);
    setRate(modeRate(m));
  };

  // The band the backend enforces on a negotiated rate/g (+/-15% of the rate
  // published for this purity today). Checked here so a mistyped rate is a
  // field message instead of a rejected request.
  const rateBand = publishedRate != null
    ? { low: publishedRate * 0.85, high: publishedRate * 1.15 }
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
  // Selling Price is what the bill COMES TO. It used to add the discount back
  // so it never moved, and the owner read that - correctly - as the discount
  // not reaching the price. The asking price is still stated, underneath,
  // whenever a discount has moved the two apart.
  const sellingPrice = product ? round2(product.finalAmount || 0) : 0;

  // Max discount the admin may give before crossing break-even = current asking
  // price − minimum safe price. (safe_price.residual_discount is only the sliver
  // beyond all-charges-zero, not the real headroom — so it read ₹0 and confused.)
  // How far the admin has come down from the asking price. Display only - it
  // moves no money and is not a discount LINE on the bill; it is the answer to
  // "how much have I given away?", which was impossible to see while typing a
  // price, because the bill records the concession as a lower making charge
  // rather than as a discount.
  const comeDown = product ? Math.max(0, round2(askingPrice - sellingPrice)) : 0;

  // Today's gold worth of the piece at the PUBLISHED rate for its purity — the
  // same rate the bill is priced at, so this tile and the bill can never
  // disagree. (It used to recompute rate_24k × purity_factor here, which drifted
  // from the billed figure every time the published purity rate differed.)
  const todaysGoldValue = product ? (product.goldValueAmount || 0) : 0;

  // The backend refuses an approved below-cost sale that carries no reason, so
  // the button waits for it rather than letting the counter meet a 400.
  const belowCostIncomplete = allowBelowCost && belowCostReason.trim().length < 3;

  const canCreate =
    !!product && !creating && !requoting && !discountBlocks &&
    customerIdentified && paymentChosen && !partialInvalid && !anyLineOverBalance &&
    !redeemOverGold && !rateOutOfBand && !exchangeInvalid;

  const resetAll = () => {
    setProduct(null); setProductCode(""); setCode("");
    setRate(""); setMakingVal(""); setWastageVal(""); setDiscountText(null); setExchangeText(""); setGst(true); setShowProfit(false);
    setAllowBelowCost(false); setBelowCostReason(""); setPublishedRate(null);
    setPayMethod(""); setPayStatus(""); setPartialAmount(""); setPayRef("");
    setSaleMode(null); setPriceText(null); setQuoteError("");
    clearCustomer(); setCustQuery(""); setCustResults([]); setWalkinName(""); setWalkinPhone("");
    setPayMethod("CASH"); setPayStatus("PAID"); setPartialAmount(""); setPayRef("");
    setLookupError(""); setOtp(null);
  };

  const handleCreateBill = async () => {
    if (!canCreate || !product) {
      if (!customerIdentified) toast("Select a customer or enter a walk-in name");
      else if (discountBlocks) toast("Discount exceeds this bill’s making charge");
      else if (anyLineOverBalance) toast("A redemption exceeds its scheme balance");
      else if (redeemOverGold) toast(`Scheme redemption can't exceed the item's gold value (${money(goldValue)})`);
      else if (!paymentChosen) toast("Choose the payment method and status before billing");
      else if (partialInvalid) toast("Partial amount must be greater than 0 and less than the amount remaining");
      else if (exchangeInvalid) toast(`Exchange value can't be more than the bill total (${money(billTotal)})`);
      return;
    }
    setCreating(true);
    try {
      if (schemeApplied) {
        // NO money is collected before the OTP. The sale row has to exist first
        // (the challenge is keyed on a sale_id), but the moment a rupee is
        // recorded against it the sale can no longer be voided - it has to be
        // returned or refunded instead. That is what stranded INV-260913-87B4A2:
        // the admin cancelled the OTP, the void was correctly refused because
        // 2,00,000 was already on the invoice, and the item stayed SOLD with no
        // scheme carve on the bill.
        //
        // So the sale is created PENDING, the cash is collected only after the
        // redemption succeeds, and cancelling the OTP has nothing to undo.
        const sale = await billingService.createSale({
          ...baseInputs(),
          paymentMethod: payMethod,
          paymentStatus: "PENDING",
        });
        await enrollmentService.requestRedemptionOtp(sale.id);
        setOtp({
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          items: redeemLines.map((l) => ({ enrollmentId: l.enrollmentId, amount: l.amount })),
          // Collected by onOtpDone, once the credit is actually spent.
          collectAfter: paidNow > 0
            ? { amount: paidNow, paymentMethod: payMethod, referenceNo: payRef.trim() || undefined }
            : null,
        });
        toast("Verification code sent to the customer's app");
        if (resumedDraftId) {
          billingService.deleteDraft(resumedDraftId).catch(() => {});
          setResumedDraftId(null);
        }
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
        // The draft became a real bill, so it stops being an unfinished one.
        // Failing to clear it would leave the same bill in the list beside the
        // invoice it turned into, and somebody would bill it twice.
        if (resumedDraftId) {
          billingService.deleteDraft(resumedDraftId).catch(() => {});
          setResumedDraftId(null);
        }
      }
    } catch (err) {
      toast(err?.message || "Could not create bill");
    } finally {
      setCreating(false);
    }
  };

  const handleQuotation = async () => {
    if (!product || !customerIdentified) { toast("Load a product and identify the customer first"); return; }

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
  const onOtpDone = async () => {
    const done = otp;
    setOtp(null);
    // The cash the customer hands over, recorded only now - before this point
    // the sale had to stay voidable. If this one call fails the sale is still
    // correct and carved, just unpaid, and the admin collects it from the
    // Payments screen; say so plainly rather than implying the sale failed.
    if (done?.saleId && done?.collectAfter?.amount > 0) {
      try {
        await billingService.recordSalePayment(done.saleId, {
          amount: done.collectAfter.amount,
          paymentMethod: done.collectAfter.paymentMethod,
          referenceNo: done.collectAfter.referenceNo,
        });
        toast("Sale completed with scheme redemption");
      } catch (err) {
        toast(
          `Scheme redeemed, but the ${money(done.collectAfter.amount)} payment was not recorded` +
          `${err?.message ? ` — ${err.message}` : ""}. Collect it against ${done.invoiceNumber || "this invoice"} in Payments.`
        );
      }
    } else {
      toast("Sale completed with scheme redemption");
    }
    if (done?.saleId) setInvoice({ id: done.saleId, invoiceNumber: done.invoiceNumber });
  };

  // Abandoning the OTP step must not leave the item SOLD. The sale was created
  // before the OTP (the challenge needs a sale_id) but carries NO payment, so
  // the void always has something it is allowed to undo; it returns the item to
  // stock and cancels the invoice, then we re-scan the same HUID so the admin
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

  /** Save what has been typed so far, to come back to. */
  const handleSaveDraft = async () => {
    if (!product) { toast("Find a product first"); return; }
    setSavingDraft(true);
    try {
      const payload = {
        product_code: productCode,
        customer_id: customerMode === "existing" ? selectedCustomer?.id || undefined : undefined,
        customer_name: customerMode === "existing" ? selectedCustomer?.name || undefined : (walkinName.trim() || undefined),
        customer_phone: customerMode === "existing" ? undefined : (walkinPhone.trim() || undefined),
        gst_applied: gst,
        making_charge_value: makingVal !== "" ? num(makingVal) : undefined,
        wastage_value: wastageVal !== "" ? num(wastageVal) : undefined,
        gold_profit_percent: 0,
        discount_amount: 0,
        payment_method: payMethod || "CASH",
        payment_status: payStatus || "PAID",
      };
      if (resumedDraftId) await billingService.deleteDraft(resumedDraftId);
      await billingService.saveDraft(payload);
      setResumedDraftId(null);
      toast("Saved to drafts");
      resetAll();
    } catch (err) {
      toast(err?.message || "Could not save the draft");
    } finally {
      setSavingDraft(false);
    }
  };

  const openDrafts = async () => {
    setDraftsOpen(true);
    setDrafts(null);
    try {
      setDrafts(await billingService.listDrafts("OPEN"));
    } catch (err) {
      setDrafts([]);
      toast(err?.message || "Could not load drafts");
    }
  };

  /** Load a draft back into the screen. The draft is NOT deleted here - only
   * once it becomes a real bill, or when it is discarded on purpose. */
  const resumeDraft = async (id) => {
    try {
      const d = await billingService.getDraft(id);
      if (!d) return;
      setDraftsOpen(false);
      setCode(d.product_code || "");
      setResumedDraftId(d.id);
      setGst(true); // compulsory, whatever an older draft saved
      setMakingVal(d.making_charge_value != null ? String(d.making_charge_value) : "");
      setWastageVal(d.wastage_value != null ? String(d.wastage_value) : "");
      // A draft's concession is replayed through the making charge, which is
      // where it lives now; the percentage is resolved once the product is
      // found and the list is known.
      setDiscountText(null);
      setPayMethod(d.payment_method || "");
      setPayStatus(d.payment_status || "");
      toast(`Resumed draft — ${d.product_code}. Find the product to reprice it.`);
    } catch (err) {
      toast(err?.message || "Could not open that draft");
    }
  };

  const discardDraft = async (id) => {
    try {
      await billingService.deleteDraft(id);
      setDrafts((list) => (list || []).filter((d) => d.id !== id));
      if (resumedDraftId === id) setResumedDraftId(null);
      toast("Draft discarded");
    } catch (err) {
      toast(err?.message || "Could not discard the draft");
    }
  };

  // The gold line is the PUBLISHED rate times the weight, full stop. Folding
  // the margin into the rate printed 15,587/g where the shop had published
  // 14,170/g, and the customer cannot reconcile a rate he was never quoted.
  // The margin is a line of its own now - the making charge - so the rate on
  // this panel is the rate on the Gold Rate screen.
  const goldProfitLine = product ? (product.goldProfitAmount || 0) : 0;
  const goldValuePure = product ? (product.goldValueAmount || 0) : 0;
  const goldValueShown = round2(goldValuePure);
  const netGrams = product ? (Number(product.netGoldWeightGrams) || 0) : 0;
  const appliedRate = product ? (Number(product.goldRateApplied) || 0) : 0;
  // Only when it actually reproduces the amount beside it. The rate is quoted
  // to paise, so a few paise of rounding is tolerated; beyond a rupee the rate
  // would not describe the figure and the row prints bare instead.
  const sellingRate = (() => {
    if (!(netGrams > 0 && appliedRate > 0)) return null;
    return Math.abs(netGrams * appliedRate - goldValuePure) < 1 ? appliedRate : null;
  })();
  const goldValueLabel = `Gold Value${sellingRate ? ` (${netGrams.toFixed(3)} g \u00d7 ${money(sellingRate)})` : ""}`;

  // The lookup stays out of the way while a bill is open, and comes back by
  // itself whenever it has something to say: a code scanned in for a
  // different piece (it waits there for Find Product), a failed lookup, or a
  // sale that could not be voided.
  const upCode = (x) => String(x || "").trim().toUpperCase();
  const scannedOther = !!(product && upCode(code) && ![product.productCode, product.huid].map(upCode).includes(upCode(code)));
  const billOpen = !!(product && saleMode);
  const showFind = !billOpen || findOpen || scannedOther || !!lookupError || !!voidFailure || cameraOpen;

  return (
    <div ref={scope} className="mx-auto max-w-[1240px] pb-32 lg:pb-14">
      {/* The page title is for the empty screen. Once a bill is open it
          only pushes the bill down - Pricing ended up below the fold. */}
      {!billOpen && (
        <div data-motion="page-head" className="mb-6">
          <h2 className="text-2xl font-extrabold tracking-tight">New Sale</h2>
          <p className="mt-1 text-sm text-muted">Find the item, choose the buyer, set the price and create the bill.</p>
        </div>
      )}

      {/* One grid for the whole bill. Lookup sits at the top of the LEFT column
          - it is how Step 1's item got there - and the Bill summary owns the
          right column alone, top to bottom. Before an item is loaded the same
          two columns hold the lookup and the summary placeholder, so the layout
          never jumps halfway through the task. On a phone everything stacks in
          the same order as before: lookup, steps, summary. */}
      <div className={product && saleMode ? "grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]" : ""}>
      <div className={billOpen ? (showFind ? "min-w-0 lg:col-start-1 lg:row-start-1" : "hidden") : product ? "" : "grid items-start gap-5 lg:grid-cols-[1.35fr_1fr]"}>
      {showFind && (
      <Card data-motion="reveal" className="min-w-0 overflow-hidden p-0">
        {/* One box for both trades. The shop holds finished jewellery, which
            is found by HUID, and bullion, which is found by serial number -
            naming only the HUID told the counter the bar could not be sold
            here, when in fact typing its serial has always worked. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-gradient-to-r from-accent-soft/80 via-accent-soft/30 to-transparent px-5 py-4 sm:flex-nowrap sm:px-6">
          {/* Title shrinks (its hint wraps) so the two buttons stay on the
              title's line in the narrower left column. */}
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-white shadow-[0_6px_16px_-6px_rgba(159,29,53,0.6)]">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-extrabold tracking-tight">Find product</h3>
              <p className="text-[11px] text-muted">HUID or Item Code for jewellery · serial number for a gold bar</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {billOpen && findOpen && (
              <Button size="sm" variant="ghost" className="h-9 px-3" onClick={() => { setFindOpen(false); setCode(product.huid || product.productCode || ""); }}>Keep current item</Button>
            )}
            <Button size="sm" variant="outline" className="h-9 bg-surface px-3.5" disabled={loading} onClick={() => setCameraOpen(true)} title="Scan the piece's barcode sticker with the camera. A USB or phone scanner works without this - just scan.">
              <svg viewBox="0 0 24 24" className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M10.5 8v8M14 8v8M17 8v8" /></svg>
              Scan barcode
            </Button>
            <Button size="sm" variant="outline" className="h-9 bg-surface px-3.5" onClick={openDrafts}>
              <svg viewBox="0 0 24 24" className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
              Unfinished bills
            </Button>
          </div>
        </div>
        <div className="px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <label htmlFor="ns-find-code" className="text-xs font-bold">HUID, Item Code or Serial No. *</label>
        <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row">
          <SearchInput id="ns-find-code" className="min-w-0 flex-1" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Type or scan a code" onKeyDown={(e) => e.key === "Enter" && handleFind()} />
          <Button size="sm" className="h-10 shrink-0 bg-accent px-7 hover:bg-accent-strong" disabled={loading} onClick={handleFind}>{loading ? "Finding…" : "Find Product"}</Button>
        </div>
        {cameraOpen && <CameraScanner onResult={onCameraResult} onClose={closeCamera} />}
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
        {/* A bar, not a piece. Its own panel because it is its own trade:
            metal at the live rate plus GST, and none of the charge fields
            beside it apply. No scheme section either - a scheme buys jewellery
            gold at a contracted rate, and spending it on bullion at the market
            rate is a different promise than the one the customer was sold. */}
        {rawGold && (
          <div className="mt-5 space-y-4 border-t border-line-soft pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold">{rawGold.productName}</div>
                <div className="mt-0.5 font-mono text-[11px] text-muted">{rawGold.serialNumber} · {rawGold.purity} · {Number(rawGold.netGoldWeightGrams).toFixed(3)} g net</div>
              </div>
              <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-accent-strong">Raw gold</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">{rawGold.purity} Sale Rate/g (₹) *</span>
                <Input type="number" step="0.01" min="0" value={rawGoldRate} onChange={(e) => setRawGoldRate(e.target.value)} />
                <span className="text-[11px] text-muted">
                  Published {money(rawGold.publishedRatePerGram)}. On a bar the rate is the price — there is no making charge to move instead.
                </span>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">GST</span>
                {/* Compulsory - shown, not switched. */}
                <div className="num flex h-10 items-center rounded-xl border border-line bg-canvas/60 px-3.5 text-sm font-bold">
                  {rawGold.taxRatePercent}%
                  <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">Compulsory</span>
                </div>
                <span className="text-[11px] text-muted">{rawGold.taxRatePercent}% on the metal. A bar carries no other charge.</span>
              </label>
            </div>

            {/* The buyer. An existing customer can be chosen exactly as on a
                jewellery bill - what is absent is the SCHEME section, because a
                scheme buys jewellery gold at a contracted rate and spending it
                on bullion at the market rate is a different promise. */}
            <div className="space-y-3 rounded-xl border border-line bg-canvas/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold">Customer</span>
                <div className="flex gap-2">
                  {[["existing", "Existing customer"], ["walkin", "Walk-in"]].map(([m, label]) => (
                    <button key={m} type="button" onClick={() => setCustomerMode(m)}
                      className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${customerMode === m ? "border-accent bg-accent-soft text-accent-strong" : "border-line text-ink-soft hover:bg-canvas"}`}>{label}</button>
                  ))}
                </div>
              </div>

              {customerMode === "existing" ? (
                selectedCustomer ? (
                  <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2.5">
                    <div>
                      <div className="text-sm font-bold">{selectedCustomer.name}</div>
                      <div className="text-[11px] text-muted">{selectedCustomer.phone && selectedCustomer.phone !== "—" ? selectedCustomer.phone : "No phone on file"}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setSelectedCustomer(null)}>Change</Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <SearchInput value={custQuery} onChange={(e) => setCustQuery(e.target.value)} placeholder="Search name, phone or customer code…" />
                    {custSearching && <div className="text-[11px] text-muted">Searching…</div>}
                    {custResults.slice(0, 5).map((c) => (
                      <button key={c.id} type="button" onClick={() => setSelectedCustomer(c)}
                        className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3 py-2 text-left hover:border-accent-line hover:bg-accent-soft/40">
                        <span className="text-sm font-semibold">{c.name}</span>
                        <span className="font-mono text-[11px] text-muted">{c.code || c.phone}</span>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid min-w-0 gap-1.5"><span className="text-xs font-bold">Name *</span><Input value={walkinName} onChange={(e) => setWalkinName(e.target.value)} placeholder="Walk-in buyer name" /></label>
                  <label className="grid min-w-0 gap-1.5">
                    <span className="text-xs font-bold">Phone <span className="font-normal text-muted">— 10 digits</span></span>
                    <PhoneInput value={walkinPhone} onValueChange={setWalkinPhone} error={walkinPhoneInvalid} />
                    {walkinPhoneInvalid && <span className="text-[11px] font-semibold text-danger">Enter all 10 digits</span>}
                  </label>
                </div>
              )}
              <p className="text-[11px] text-muted">Scheme redemption does not apply to bullion — a scheme buys jewellery gold at its contracted rate.</p>
            </div>

          </div>
        )}

        {!product && !rawGold && !lookupError && !loading && (
          <div className="mt-5 rounded-xl border border-line-soft bg-canvas/50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">How a bill is made</div>
            <ol className="mt-3 space-y-2.5">
              {[
                "Find the piece by its HUID or Item Code, or a bar by its serial number.",
                "Choose Online (live rate) or Offline (editable rate).",
                "Adjust rate, profit % and charges — or type the customer's price.",
                "Identify the buyer and redeem any schemes they hold.",
                "State how they are paying, then create the bill.",
              ].map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-xs leading-5 text-ink-soft">
                  <span className="num grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-extrabold text-accent-strong ring-1 ring-accent-line">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        </div>
      </Card>
      )}

      {/* A bar's summary and its payment live HERE, in the column that stood
          empty and white while the whole short trade was stacked down the left
          and made the page scroll for no reason. Same shape as the jewellery
          summary, so the screen reads the same whichever is being sold. */}
      {!product && rawGold && (
        <Card data-motion="reveal" className="p-5 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold">Bill summary</h3>
            {(rawGold.profitOrLoss != null || rawGold.profitLabel) && <ProfitToggle compact on={showProfit} onToggle={() => setShowProfit((v) => !v)} />}
          </div>
          <div className="mt-3 rounded-xl border border-line bg-canvas/40 p-3">
            <div className="text-[13px] font-bold">{rawGold.productName}</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">{rawGold.serialNumber} · {rawGold.purity} · {Number(rawGold.netGoldWeightGrams).toFixed(3)} g</div>
            <div className="mt-1 text-[11px] text-muted">Buyer: <b className="text-ink">{rawGoldBuyerName || "Not selected"}</b></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
            <span className="text-muted">Gold value ({Number(rawGold.netGoldWeightGrams).toFixed(3)} g × {money(rawGold.appliedRatePerGram)})</span>
            <span className="num text-right font-semibold">{money(rawGold.goldValueAmount)}</span>
            <span className="text-muted">GST {rawGold.taxRatePercent}%</span>
            <span className="num text-right font-semibold">{money(rawGold.taxAmount)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between rounded-xl border border-accent-line bg-accent-soft px-3 py-2.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-accent-strong">Bill total</span>
            <span className="num text-lg font-extrabold text-accent-strong">{money(rawGold.finalAmount)}</span>
          </div>

          {/* How it is being settled - the same three states a jewellery bill
              offers. "Amount collected, leave 0 to bill it as outstanding" left
              the counter to work out which of the three they meant. */}
          <div className="mt-4 space-y-3 border-t border-line-soft pt-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Payment method *</span>
              <Select value={rawGoldMethod} onValueChange={setRawGoldMethod} options={["CASH", "UPI", "CARD", "BANK_TRANSFER"]} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Status *</span>
              <Select value={rawGoldStatus} onValueChange={setRawGoldStatus} placeholder="Select status"
                options={PAYMENT_STATUSES.map((v) => ({ value: v, label: PAYMENT_STATUS_LABEL[v] }))} />
            </label>
            {rawGoldStatus === "PARTIAL" && (
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Paid now (₹)</span>
                <Input type="number" step="0.01" min="0" value={rawGoldPaid} onChange={(e) => setRawGoldPaid(e.target.value)}
                  error={rawGoldPartialInvalid ? "Must be more than 0 and less than the bill" : undefined} placeholder="0" />
              </label>
            )}
            {rawGoldStatus && (
              <div className="grid grid-cols-2 gap-y-1 border-t border-line-soft pt-2.5 text-sm">
                <span className="text-muted">{rawGoldStatus === "PARTIAL" ? "Paid now" : "Amount paid"}</span>
                <span className="num text-right font-semibold">{money(rawGoldPaidNow)}</span>
                <span className={rawGoldOutstanding > 0 ? "font-bold text-danger" : "text-muted"}>Outstanding</span>
                <span className={`num text-right font-bold ${rawGoldOutstanding > 0 ? "text-danger" : ""}`}>{money(rawGoldOutstanding)}</span>
              </div>
            )}
          </div>

          {showProfit && rawGold.profitOrLoss == null && rawGold.profitLabel && (
            <div className="mt-3 max-w-[220px]"><PnlWordCard label="This bill" verdict={rawGold.profitLabel} /></div>
          )}
          {showProfit && rawGold.profitOrLoss != null && (
            <div className={`mt-3 flex items-baseline justify-between rounded-lg border px-3 py-2 ${rawGold.profitOrLoss < 0 ? "border-danger-line bg-danger-soft/50" : "border-emerald-200 bg-emerald-50"}`}>
              <span className={`text-[11px] font-bold uppercase tracking-[0.07em] ${rawGold.profitOrLoss < 0 ? "text-danger" : "text-emerald-700"}`}>
                {rawGold.profitOrLoss < 0 ? "Loss" : "Profit"}
              </span>
              <span className={`num text-[12px] font-bold ${rawGold.profitOrLoss < 0 ? "text-danger" : "text-emerald-700"}`}>
                {money(Math.abs(rawGold.profitOrLoss))} <span className="font-semibold opacity-70">over the {money(rawGold.purchaseCost)} it cost</span>
              </span>
            </div>
          )}

          <Button className="mt-4 w-full" disabled={rawGoldBusy || !rawGoldBuyerReady || !rawGoldStatus || rawGoldPartialInvalid} onClick={createRawGoldSale}>
            {rawGoldBusy ? "Creating…" : `Create bill · ${money(rawGold.finalAmount)}`}
          </Button>
          {!rawGoldBuyerReady
            ? <p className="mt-2 text-center text-[11px] text-muted">Identify the buyer to enable billing.</p>
            : !rawGoldStatus
              ? <p className="mt-2 text-center text-[11px] text-muted">Choose how it is being paid.</p>
              : null}
        </Card>
      )}

      {/* Placeholder for the pinned summary: keeps the right column occupied so
          the page reads as a billing screen rather than an empty form. */}
      {!product && !rawGold && (
        <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface/70 lg:block">
          <div className="h-1.5 bg-gradient-to-r from-accent via-accent-strong to-[#c9a84c] opacity-60" />
          <div className="p-6">
          <div className="text-sm font-extrabold text-ink-soft">Bill summary</div>
          <p className="mt-1 text-xs text-muted">Appears here once an item is loaded, and stays pinned while you work down the form.</p>
          <div className="mt-4 space-y-2.5" aria-hidden="true">
            {["Gold value", "Making charge", "Wastage", "GST", "Bill total"].map((label, i) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <span className={`text-xs ${i === 4 ? "font-extrabold text-faint" : "text-faint"}`}>{label}</span>
                <span className={`h-2 rounded-full bg-line-soft ${i === 4 ? "w-24" : "w-16"}`} />
              </div>
            ))}
          </div>
          </div>
        </div>
      )}
      </div>

      {/* No mode picker: the piece's identifier sets the mode on lookup. */}

      {product && saleMode && (
        <div className="contents">
          {/* LEFT: details + controls. Dense on purpose: Customer and Pricing
              share a row on wide screens, charges sit three to a row, so the
              whole bill fits in about one screen instead of a long scroll. */}
          {/* Stretches to the summary's height on desktop, and the last card
              (Payment) takes up any difference, so both columns end on one
              line instead of the summary hanging below the form. */}
          <div className={`min-w-0 space-y-4 lg:col-start-1 lg:flex lg:flex-col lg:self-stretch ${showFind ? "lg:row-start-2" : "lg:row-start-1"}`} data-motion="reveal">
            {/* Item. One compact card: what it is, then the four facts that
                set its price as a single row of chips. The old three-box strip
                plus a separate Mode footer took a third of the screen to say
                five words. */}
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong ring-1 ring-accent-line">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M11 3 8 9l4 12 4-12-3-6M2 9h20" /></svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <h3 className="min-w-0 truncate text-base font-extrabold tracking-tight">{product.name || "Not provided"}</h3>
                    <Badge tone={product.stockStatus === "IN_STOCK" ? "success" : "warning"}>{product.stockStatus === "IN_STOCK" ? "In stock" : (product.stockStatus || "—")}</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted">{[product.category, product.subcategory].filter(Boolean).join(" · ") || "Not provided"}</div>
                </div>
                <Button size="sm" variant="outline" className="h-8 shrink-0 bg-surface px-3 text-xs" onClick={() => setFindOpen(true)} title="Look up a different piece">
                  Change item
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="num rounded-lg border border-line bg-canvas/50 px-2.5 py-1 font-bold text-ink-soft">{product.huid ? `HUID ${product.huid}` : `Item Code ${product.productCode || "Not provided"}`}</span>
                <span className="rounded-lg border border-line bg-canvas/50 px-2.5 py-1"><span className="text-muted">Purity </span><b className="text-ink">{product.purity || "—"}</b></span>
                <span className="rounded-lg border border-line bg-canvas/50 px-2.5 py-1"><span className="text-muted">Net </span><b className="num text-ink">{grams(product.netGoldWeightGrams)}</b></span>
                <span className="rounded-lg border border-line bg-canvas/50 px-2.5 py-1"><span className="text-muted">{`${product.purity || ""} rate `.trimStart()}</span><b className="num text-ink">{product.goldRateApplied != null ? `${money(product.goldRateApplied)}/g` : "—"}</b></span>
                {/* Fixed by the piece, not switchable: HUID = Online, Item Code = Offline. */}
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 font-bold text-white" title={saleMode === "OFFLINE" ? "Item Code piece - gold rate editable" : "HUID piece - gold rate locked to live"}>
                  <span className={`h-1.5 w-1.5 rounded-full ${saleMode === "OFFLINE" ? "bg-white/60" : "animate-pulse bg-emerald-300"}`} />
                  {saleMode === "OFFLINE" ? "Offline · rate editable" : "Online · live rate"}
                </span>
              </div>
            </Card>

            {/* Customer and Pricing are full-width rows. Squeezed side by side
                each was half a card of small print and the pair read as a wall
                of things to fill in; as rows, each says one thing at a glance. */}
            <div className="space-y-4">
            {/* Customer */}
            <Card className="min-w-0 space-y-3 p-4">
              {/* One search box for every buyer. A match is picked from the
                  suggestions; anyone not on file is added from the last row as
                  a walk-in buyer - the same two buyer modes underneath, with
                  the same required fields, only without a switch to choose. */}
              <SectionHead step={2} title="Customer" action={
                customerMode === "walkin" ? (
                  <button type="button" onClick={() => setCustomerMode("existing")}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:border-accent-line hover:text-accent-strong">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                    Search customers
                  </button>
                ) : null
              } />

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
                      {!schemeLoading && schemeLoadFailures !== 0 && (
                        <div className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-xs font-semibold text-danger">
                          {schemeLoadFailures < 0
                            ? "This customer's schemes could not be loaded. Refresh before billing — any scheme credit is missing from this bill."
                            : `${schemeLoadFailures} scheme${schemeLoadFailures === 1 ? "" : "s"} could not be loaded. Refresh before billing — the list below may be missing a credit.`}
                        </div>
                      )}
                      {!schemeLoading && schemeOptions.length === 0 && schemeLoadFailures === 0 && <div className="rounded-xl border border-line px-4 py-3 text-xs text-muted">No redeemable schemes for this customer.</div>}
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
                  <div className="space-y-2">
                    <SearchInput placeholder="Type the buyer's name, phone or customer code" value={custQuery} onChange={(e) => setCustQuery(e.target.value)} />
                    {custQuery.trim() && (
                      <div className="overflow-hidden rounded-xl border border-line">
                        <div className="max-h-56 overflow-y-auto">
                          {custSearching && <div className="px-4 py-3 text-xs text-muted">Searching…</div>}
                          {!custSearching && custResults.length === 0 && <div className="px-4 py-3 text-xs text-muted">No customer on file matches “{custQuery.trim()}”.</div>}
                          {!custSearching && custResults.map((c) => (
                            <button key={c.id} type="button" onClick={() => selectCustomer(c)} className="flex w-full items-center justify-between border-b border-line-soft px-4 py-2.5 text-left last:border-0 hover:bg-accent-soft/40">
                              <span className="text-sm font-semibold">{c.name}</span>
                              <span className="text-xs text-muted">{c.phone && c.phone !== "—" ? c.phone : c.code || ""}</span>
                            </button>
                          ))}
                        </div>
                        {/* Not on file: carry what was typed into the walk-in
                            fields - digits to Phone, anything else to Name. */}
                        <button type="button"
                          onClick={() => {
                            const q = custQuery.trim();
                            const digits = q.replace(/\D/g, "");
                            if (/^[\d\s+()-]+$/.test(q) && digits.length >= 6) setWalkinPhone(digits.slice(-10));
                            else setWalkinName(q);
                            setCustQuery("");
                            setCustomerMode("walkin");
                          }}
                          className="flex w-full items-center gap-2 border-t border-line bg-canvas/50 px-4 py-2.5 text-left text-sm font-semibold text-accent-strong hover:bg-accent-soft/50">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold leading-none text-white" aria-hidden="true">+</span>
                          <span className="min-w-0 truncate">Add walk-in buyer “{custQuery.trim()}”</span>
                        </button>
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <label className="grid min-w-0 content-start gap-1.5"><span className="text-xs font-bold">Name *</span><Input value={walkinName} onChange={(e) => setWalkinName(e.target.value)} placeholder="Walk-in buyer name" /></label>
                  {/* Optional, but if it is filled it must be a real mobile
                      number - the bill carries it and the store calls it back. */}
                  <label className="grid min-w-0 content-start gap-1.5">
                    <span className="text-xs font-bold">Phone * <span className="font-normal text-muted">— 10 digits</span></span>
                    <PhoneInput value={walkinPhone} onValueChange={setWalkinPhone} error={walkinPhoneInvalid} />
                    {walkinPhoneInvalid && <span className="text-[11px] font-semibold text-danger">Enter all 10 digits</span>}
                  </label>
                </div>
              )}
              <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted">
                <svg viewBox="0 0 24 24" className="mt-px h-3.5 w-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
                {customerMode === "existing"
                  ? "Pick a customer to see their redeemable schemes, or add a walk-in buyer from the list."
                  : "Walk-in buyers need a name and a 10-digit phone. Schemes apply to customers on file only."}
              </p>
            </Card>

            {/* Purchase Cost and Purchase-Cost P/L are intentionally omitted from
                this screen — the counter sees selling figures only. */}
                <Card className="min-w-0 space-y-3.5 p-4">
                  <SectionHead step={3} title="Pricing" meta={requoting ? "Updating…" : undefined}
                    action={<ProfitToggle compact on={showProfit} onToggle={() => setShowProfit((v) => !v)} />} />
                  {/* Reference figures stay small: the field below is the one
                      the admin acts on, so it gets the visual weight. */}
                  {/* Two equal columns, each carrying its own padding. Every
                      SpecCell strip is a bordered box, so no cell is ever
                      edge-flush - that only pulled the first label onto the
                      border while its neighbours stayed indented. */}
                  {/* The eye flips THIS strip between the price figures and the
                      profit figures, so showing profit never grows the card or
                      pushes anything below it (it used to add a verdict strip
                      and a margin card, and the whole Pricing card jumped).
                      Both views sit in the same grid cell and the hidden one is
                      only invisible, so the strip is always as tall as the
                      taller view at every width. */}
                  {/* The price box is the one thing to type, so on a wide row
                      it leads and the reference figures sit beside it. */}
                  <div className="grid gap-3.5 md:grid-cols-2">
                  <div className="grid md:order-2">
                    <div aria-hidden={!showProfit} className={`[grid-area:1/1] grid grid-cols-2 divide-x divide-line-soft rounded-xl border px-1 md:grid-cols-1 md:divide-x-0 md:divide-y ${VERDICT[billVerdict].line} ${showProfit ? "" : "invisible"}`}>
                        <SpecCell
                          label="This bill"
                          value={VERDICT[billVerdict].word}
                          tone={VERDICT[billVerdict].text}
                          sub={bands && impliedMakingPct != null
                            ? `${round2(impliedMakingPct)}% making · list ${round2(listPct)}% · break-even ${round2(breakEvenPct)}%`
                            : VERDICT[billVerdict].note}
                        />
                        {/* Rupees only for a privileged caller - the backend
                            sends the word to everyone, the figure to Admin. */}
                        {product.currentGoldValuePnl != null ? (
                          <SpecCell
                            label="Margin over metal"
                            value={`${product.currentGoldValuePnl < 0 ? "-" : ""}${money(Math.abs(product.currentGoldValuePnl))}`}
                            tone={product.currentGoldValuePnl < 0 ? "text-danger" : product.currentGoldValuePnl > 0 ? "text-emerald-700" : ""}
                            sub={`over the metal${product.currentGoldValueMarginPct != null ? ` · ${Math.abs(product.currentGoldValueMarginPct).toFixed(2)}%` : ""} · before GST`}
                            mono
                          />
                        ) : (
                          <SpecCell label={quoteHasScheme ? "Bill total" : "Selling price"} value={schemeSelected && !quoteHasScheme ? "—" : money(sellingPrice)} mono />
                        )}
                    </div>
                    <div aria-hidden={showProfit} className={`[grid-area:1/1] grid grid-cols-2 divide-x divide-line-soft rounded-xl border px-1 md:grid-cols-1 md:divide-x-0 md:divide-y border-line-soft bg-canvas/60 ${showProfit ? "invisible" : ""}`}>
                    {/* Named for what it IS, not for when it was taken. This tile
                        and the bill summary's Gold Value row are different money -
                        the metal at the published rate versus the metal at the
                        SELLING rate, differing by exactly the Gold Profit - and
                        while both read "gold value" the screen looked broken every
                        time the profit % was changed. The rate is stated beneath so
                        the figure can be checked by hand, the same rule the invoice
                        follows. Staff-only: this rate is the store's cost basis and
                        never appears on a customer document. */}
                    <SpecCell
                      label="Metal at published rate"
                      value={money(todaysGoldValue)}
                      sub={netGrams > 0 && appliedRate > 0
                        ? `${netGrams.toFixed(3)} g × ${money(appliedRate)}`
                        : undefined}
                      mono
                    />
                    {/* A scheme changes the selling price, so until the quote
                        carrying it comes back there is no honest figure to
                        print. Showing the un-carved one is how this strip came
                        to display a price the server had already refused. */}
                    <SpecCell
                      label={quoteHasScheme ? "Bill total" : "Selling price"}
                      value={schemeSelected && !quoteHasScheme ? "—" : money(sellingPrice)}
                      sub={
                        schemeSelected && !quoteHasScheme
                          ? "once the scheme is applied"
                          : quoteHasScheme
                            ? `${money(quotedScheme)} paid by scheme`
                            : comeDown > 0.05
                              ? `${money(askingPrice)} list − ${money(comeDown)}`
                              : undefined
                      }
                      mono
                    />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-accent-line bg-accent-soft p-3.5 md:order-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-[0.08em] text-accent-strong">
                        {quoteHasScheme ? "Customer pays now" : "Customer Price"}
                      </span>
                      {requoting && <span className="text-[10px] font-semibold text-muted">Updating…</span>}
                    </div>
                    <MoneyInput
                      allowDecimal
                      placeholder="0"
                      inlineSymbol
                      frameClassName="mt-2 h-12"
                      className="text-xl font-extrabold tracking-tight"
                      symbolClassName="text-xl font-extrabold text-ink"
                      value={
                        priceText != null
                          ? priceText
                          : product.finalAmount != null
                            ? round2(product.finalAmount - quotedScheme).toFixed(2)
                            : ""
                      }
                      onValueChange={onCustomerPriceInput}
                      onBlur={() => setPriceText(null)}
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
                      <>
                        <p className="mt-1.5 text-[11px] text-muted">
                          {schemeSelected
                            ? "After the scheme credit. Change it and the making charge adjusts."
                            : "Type the agreed price. The making charge adjusts to match."}
                        </p>
                      </>
                    )}
                  </div>
                  </div>
                </Card>
            </div>

                {/* Editable rate + Gold Profit % + Making/Wastage + Discount */}
                <Card className="space-y-3.5 p-4">
                  <SectionHead step={4} title="Rate & charges" />
                  <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                    <label className="grid min-w-0 content-start gap-1.5">
                      <span className="text-xs font-bold">{product.purity ? `${product.purity} ` : ""}Sale Rate/g (₹) *</span>
                      <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} disabled={saleMode === "ONLINE"} className={saleMode === "ONLINE" ? "opacity-60" : ""} />
                      {/* The backend refuses a rate more than 15% either side of
                          the published one, so the range is stated up front. */}
                      <span className={`text-[11px] ${rateOutOfBand ? "font-semibold text-danger" : "text-muted"}`}>
                        {saleMode === "ONLINE"
                          ? `Locked at today's published rate ${publishedRate != null ? money(publishedRate) : "—"} (before GST).`
                          : rateOutOfBand
                            ? `Must be between ${money(rateBand.low)} and ${money(rateBand.high)}.`
                            : `Published ${publishedRate != null ? money(publishedRate) : "—"} (before GST)${rateBand != null ? ` · allowed ${money(rateBand.low)} – ${money(rateBand.high)}` : ""}.`}
                      </span>
                    </label>
                    <label className="grid min-w-0 content-start gap-1.5">
                      <span className="text-xs font-bold">Making Charge {chargePct(product.makingChargeType, makingVal || product.makingChargeValue)}</span>
                      <Input type="number" step="0.01" min="0" value={makingVal} onChange={(e) => onMakingInput(e.target.value)} />
                      <span className="text-[11px] text-muted">= {money(product.makingChargeAmount)}{schemeSelected ? " — on the un-covered grams only" : ""}</span>
                      {/* The bands are THIS piece's, from the backend: the
                          store's 6% base plus its running cost plus the tunch
                          of the lot this piece was received on. They were
                          welded at 4/4/3 here, which read "4% tunch" over a
                          lot actually bought at 7%. */}
                      {showProfit && impliedMakingPct != null && (
                        <span className={`text-[11px] font-semibold ${VERDICT[billVerdict].text}`}>
                          {/* The verdict only. What the bands are MADE of -
                              tunch, running cost, gold profit, extra - belongs
                              in Store Pricing Defaults, where they are set; the
                              counter needs the decision, not the derivation. */}
                          {bands
                            ? billVerdict === "LOSS"
                              ? `Loss — break-even is ${round2(breakEvenPct)}%.`
                              : billVerdict === "BREAK_EVEN"
                                ? "Break-even — no profit."
                                : `Profit — ${round2(impliedMakingPct - breakEvenPct)}% above break-even.`
                            : billVerdict === "LOSS" ? "Loss."
                              : billVerdict === "BREAK_EVEN" ? "Break-even — no profit."
                              : "Profit."}
                        </span>
                      )}
                    </label>
                    <label className="grid min-w-0 content-start gap-1.5">
                      <span className="text-xs font-bold">Wastage {chargePct(product.wastageType, wastageVal || product.wastageValue)}</span>
                      <Input type="number" step="0.01" min="0" value={wastageVal} onChange={(e) => setWastageVal(e.target.value)} />
                      <span className="text-[11px] text-muted">= {money(product.wastageAmount)}</span>
                    </label>
                    <label className="grid min-w-0 content-start gap-1.5 sm:col-span-1 xl:col-span-1">
                      {/* The unit matters now: a discount comes off the taxable
                          value, so the bill falls by the discount plus the GST
                          that is no longer due on it. */}
                      <span className="text-xs font-bold">Discount (₹) <span className="font-normal text-muted">— before GST</span></span>
                      {/* The same concession the Making Charge box is showing,
                          in rupees. Type here and the percentage above moves to
                          match; type there and this follows. Neither is a
                          separate giving-away, so they cannot add up to more
                          than the piece has to give. */}
                      <Input
                        type="number" step="0.01" min="0"
                        value={discountText != null ? discountText : (concession > 0 ? String(concession) : "")}
                        onChange={(e) => onDiscountInput(e.target.value)}

                        placeholder="0" />
                      {concession > 0 && (
                        <span className="text-[11px] text-muted">
                          Making {round2(listPct)}% → {round2(agreedPct)}% · bill <b className="num">−{money(round2(concession * taxFactor))}</b> incl. GST
                        </span>
                      )}
                      {discountCeiling != null && (showProfit || discountExceedsProfit) && (
                        <span className={`text-[11px] ${discountExceedsProfit ? "font-semibold text-amber-700" : "text-muted"}`}>
                          {discountExceedsProfit
                            ? `Over ${money(discountCeiling)} the bill is below break-even. You can still bill it.`
                            : `Max ${money(discountCeiling)} before break-even.`}
                        </span>
                      )}
                    </label>
                    <label className="grid min-w-0 content-start gap-1.5 sm:col-span-1 xl:col-span-2">
                      <span className="text-xs font-bold">Exchange Value (₹) <span className="font-normal text-muted">— the customer&apos;s old gold</span></span>
                      <Input
                        type="number" step="0.01" min="0" inputMode="decimal"
                        value={exchangeText}
                        onChange={(e) => setExchangeText(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 12))}
                        disabled={schemeSelected}
                        error={exchangeInvalid ? "More than the bill total" : undefined}
                        placeholder="0" />
                      <span className={`text-[11px] ${exchangeInvalid ? "font-semibold text-danger" : "text-muted"}`}>
                        {schemeSelected
                          ? "Not available on a scheme bill."
                          : exchangeInvalid
                            ? `Can't be more than the bill total of ${money(billTotal)}.`
                            : "Deducted from the amount to pay. Bill value and GST are unchanged."}
                      </span>
                    </label>
                  </div>
                  {/* Making % split - behind the profit eye, Admin only (Staff
                      get no bands). Answers "Tunch is 5%, why is making 18%?". */}
                  {showProfit && makingSplit && (
                    <div className="rounded-xl border border-line-soft bg-canvas/60 p-3">
                      <p className="text-xs font-bold">
                        Why making is {round2(listPct)}%
                        <span className="font-normal text-muted"> — break-even {round2(breakEvenPct)}%, everything above it is profit</span>
                      </p>
                      <div className="mt-2 grid grid-cols-3 divide-x divide-line-soft">
                        {[
                          [makingSplit.costDriven ? "Piece cost" : "Tunch", bands.tunchPercent],
                          ["Running cost", bands.runningCostPercent],
                          ["Gold profit", bands.goldProfitPercent],
                        ].map(([label, pct], i) => (
                          <div key={label} className={i ? "pl-3" : "pr-3"}>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
                            <p className="num text-base font-extrabold">{round2(pct || 0)}%</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-muted">
                        {makingSplit.costDriven
                          ? <>This piece cost <b className="num text-ink">{money(makingSplit.cost)}</b>{product.purchaseRatePerGram ? <> (bought at 24K {money(product.purchaseRatePerGram)}/g, with Tunch and purchase charges)</> : null} — <b className="num text-ink">{money(round2(makingSplit.cost - makingSplit.nonMaking))}</b> over today&apos;s gold value of {money(makingSplit.nonMaking)}. That cost has to be recovered before any profit, so it replaces the lot&apos;s Tunch.</>
                          : "The Tunch paid to the vendor on this lot."}
                      </p>
                    </div>
                  )}
                </Card>

            {/* Payment */}
            <Card className="space-y-3.5 p-4 lg:flex-1">
              <SectionHead step={5} title="Payment" meta={paymentChosen ? undefined : "Required"} />
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="grid min-w-0 content-start gap-1.5"><span className="text-xs font-bold">Method *</span>
                  <Select value={payMethod} onValueChange={setPayMethod} placeholder="Select method" options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} />
                </label>
                <label className="grid min-w-0 content-start gap-1.5"><span className="text-xs font-bold">Status *</span>
                  <Select value={payStatus} onValueChange={setPayStatus} placeholder="Select status" options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))} />
                </label>
                {payStatus === "PARTIAL" && (
                  <label className="grid min-w-0 content-start gap-1.5"><span className="text-xs font-bold">Paid now (₹) *</span>
                    <Input type="number" step="0.01" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} error={partialInvalid ? "Must be > 0 and < remaining" : undefined} />
                    {partialInvalid && <span className="text-[11px] font-semibold text-danger">Between {money(0)} and {money(remaining)}</span>}
                  </label>
                )}
                <label className="grid min-w-0 content-start gap-1.5"><span className="text-xs font-bold">Reference No.</span><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional" /></label>
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
          {/* Spans the lookup row only while the lookup is shown. Spanning an
              empty row kept its 20px gap, and the sticky summary slid down
              into it - 20px off the left column at top and bottom. */}
          <div ref={summaryRef} style={{ top: summaryTop }} className={`min-w-0 lg:sticky lg:col-start-2 lg:row-start-1 lg:self-start ${showFind ? "lg:row-span-2" : ""}`} data-motion="reveal">
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-2 border-b border-line-soft border-t-[3px] border-t-accent px-5 py-3">
                <h3 className="text-[15px] font-extrabold tracking-tight text-accent-strong">Bill summary</h3>
                <div className="flex items-center gap-2">
                  {requoting && <span className="text-[11px] text-muted">Updating…</span>}
                  <span className="rounded-full border border-accent-line bg-accent-soft px-2.5 py-1 text-[10px] font-bold text-accent-strong" title="GST is compulsory on every bill">GST {product.taxRatePercent || 3}%</span>
                </div>
              </div>
              <div className="px-5 py-4">
              <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5 text-[11px] leading-snug">
                <div className="font-bold text-ink">{product.name || "—"}</div>
                <div className="text-muted">{product.huid ? `HUID ${product.huid}` : `Item Code ${product.productCode || "—"}`} · {product.purity || "—"} · {grams(product.netGoldWeightGrams)}</div>
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
                      {/* Pure gold less the credit. The margin is no longer
                          inside it, so this is the gold the customer is
                          actually charged for - the grams the making charge
                          below is calculated on. */}
                      <Row label="Chargeable gold value" value={money(round2(chargeableGold))} divider />

                      {/* Same presentation as a non-scheme bill: making at list,
                          then the concession taken off it. */}
                      {concession > 0.004 ? (
                        <>
                          <Row label={`Making Charge ${round2(listPct)}%`} value={money(round2((product.makingChargeAmount || 0) + concession))} />
                        </>
                      ) : (
                        <Row label={`Making Charge${makingLabel ? ` ${makingLabel}` : ""}`} value={money(product.makingChargeAmount)} />
                      )}
                      <Row label={`Wastage${wastageLabel ? ` ${wastageLabel}` : ""}`} value={money(product.wastageAmount)} />
                      {product.stoneChargeAmount > 0 && <Row label="Stone Charge" value={money(product.stoneChargeAmount)} />}
                      {product.otherChargesAmount > 0 && <Row label="Other Charges" value={money(product.otherChargesAmount)} />}
                      {concession > 0.004 && <Row label={`Discount (${round2(listPct)}% → ${round2(agreedPct)}%)`} value={`− ${money(concession)}`} tone="text-emerald-700" />}
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
                      <RoundOffRow total={totalPayable} parts={round2(normalSubtotal - disc) + (product.taxAmount || 0)} />
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
                        No making, wastage or GST on the scheme gold{pureRate > 0 ? ` (${schemeG.toFixed(3)} g)` : ""} — only on the rest{pureRate > 0 ? ` (${normalG.toFixed(3)} g)` : ""}.
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
                    {/* A discount is given as a lower making charge. The bill
                        states it the way the invoice does: making at the list
                        rate, then the discount taken off it. */}
                    {concession > 0.004 ? (
                      <>
                        <Row label={`Making Charge ${round2(listPct)}%`} value={money(round2((product.makingChargeAmount || 0) + concession))} />
                      </>
                    ) : (
                      <Row label={`Making Charge${chargePct(product.makingChargeType, makingVal || product.makingChargeValue) ? ` ${chargePct(product.makingChargeType, makingVal || product.makingChargeValue)}` : ""}`} value={money(product.makingChargeAmount)} />
                    )}
                    <Row label={`Wastage${chargePct(product.wastageType, wastageVal || product.wastageValue) ? ` ${chargePct(product.wastageType, wastageVal || product.wastageValue)}` : ""}`} value={money(product.wastageAmount)} />
                    {product.stoneChargeAmount > 0 && <Row label="Stone Charge" value={money(product.stoneChargeAmount)} />}
                    {product.otherChargesAmount > 0 && <Row label="Other Charges" value={money(product.otherChargesAmount)} />}
                    {concession > 0.004 && <Row label={`Discount (${round2(listPct)}% → ${round2(agreedPct)}%)`} value={`− ${money(concession)}`} tone="text-emerald-700" />}
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
                    <RoundOffRow total={billTotal} parts={round2((product.subtotalBeforeTax || 0) - (product.discountAmount || 0)) + (product.taxAmount || 0)} />
                    <BillTotalBand label="Bill Total" value={money(billTotal)} />
                    {exchangeValue > 0 && !exchangeInvalid && (
                      <>
                        <Row label="Less: Exchange Value" value={`− ${money(exchangeValue)}`} tone="text-emerald-700" divider />
                        <Row label="Amount to Pay" value={money(round2(billTotal - exchangeValue))} strong />
                      </>
                    )}
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

              {showProfit && canApproveBelowCost && (
                product.safePrice ? (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-800">Safe Price</div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      {/* On a scheme bill these are what the customer HANDS OVER -
                          the credit already taken off. Printing the pre-credit
                          total as "Current Price" put 3,40,799.66 on screen
                          beside a real 3,10,799.66. */}
                      <div><div className="text-[10px] font-bold uppercase text-muted">{quoteHasScheme ? "Customer Pays" : "Current Price"}</div><div className="num text-sm font-extrabold">{money(round2((product.finalAmount || 0) - quotedScheme))}</div></div>
                      <div><div className="text-[10px] font-bold uppercase text-muted">Min Safe Price</div><div className="num text-sm font-extrabold">{minSafe != null ? money(round2(minSafe - quotedScheme)) : "—"}</div></div>
                      {/* How far THIS price can still come down - measured
                          from what the customer pays now, not from list, so it
                          shrinks as a discount is given. */}
                      {(() => {
                        const roomLeft = minSafe != null ? round2((product.finalAmount || 0) - minSafe) : null;
                        return (
                          <div><div className="text-[10px] font-bold uppercase text-muted">Room left</div>
                            <div className={`num text-sm font-extrabold ${roomLeft != null && roomLeft < 0 ? "text-danger" : ""}`}>{roomLeft != null ? (roomLeft < 0 ? `− ${money(-roomLeft)}` : money(roomLeft)) : "—"}</div></div>
                        );
                      })()}
                    </div>
                    {discountCeiling != null && (
                      <div className="mt-2 text-[10px] leading-snug text-emerald-800/80">
                        Discount box: up to <b>{money(discountCeiling)}</b> in total before break-even{concession > 0 ? ` (${money(concession)} given)` : ""}.
                      </div>
                    )}
                    {/* The screen sends the agreed making charge, not a price,
                        so the server's "No customer price entered." is noise. */}
                    {product.safePrice.message && product.safePrice.requestedPrice != null && <div className={`mt-2 text-[11px] ${product.safePrice.isLoss ? "font-semibold text-danger" : "text-emerald-800"}`}>{product.safePrice.message}</div>}
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
              {product.safePrice?.isLoss && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 text-[11px] leading-snug text-amber-900">
                  <b>This bill sells at a loss.</b> It can still be created — the verdict is recorded on the sale.
                </div>
              )}

              {false && (product.safePrice?.isLoss || allowBelowCost) && canApproveBelowCost && (
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

              <div className="mt-4 flex flex-col gap-2">
                <Button size="sm" className="h-11 w-full bg-accent text-sm hover:bg-accent-strong" disabled={!canCreate} onClick={handleCreateBill}>{creating ? "Working…" : schemeApplied ? "Create Bill & Redeem" : "Create Bill"}</Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={handleQuotation} disabled={creating || requoting}>Quotation</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={handleSaveDraft} disabled={creating || savingDraft}>{savingDraft ? "Saving…" : "Save draft"}</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={resetAll} disabled={creating}>Cancel</Button>
                </div>
              </div>
              {/* placeholder-anchor */}
              {!canCreate && !creating && (
                <p className="mt-2 text-center text-[11px] text-muted">
                  {!customerIdentified ? "Identify the buyer to enable billing."
                    : !paymentChosen ? "Select the payment method and status to enable billing."
                    : partialInvalid ? "Enter a valid part payment to enable billing."
                    : discountBlocks ? "Reduce the discount to enable billing."
                    : redeemOverGold ? "Reduce the scheme redemption to enable billing."
                    : belowCostIncomplete ? "Enter the reason for selling below cost to enable billing."
                    : rateOutOfBand ? "Bring the sale rate back inside the allowed range to enable billing."
                    : ""}
                </p>
              )}
              </div>
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
      </div>

      {otp && (
        <OtpDialog
          otp={otp}
          onClose={onOtpAbandon}
          onDone={onOtpDone}
        />
      )}

      {quote && <QuoteDialog quote={quote} onClose={() => setQuote(null)} />}

      {invoice && <InvoiceDialog invoice={invoice} onClose={() => { setInvoice(null); resetAll(); }} />}

      {/* Unfinished bills. A draft holds no stock, carries no invoice number
          and is in no revenue figure - it is only what somebody typed. */}
      {draftsOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-base font-extrabold">Unfinished bills</h3>
                <p className="mt-0.5 text-xs text-muted">Saved before billing. Nothing here is a sale yet.</p>
              </div>
              <button onClick={() => setDraftsOpen(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas" aria-label="Close">✕</button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
              {drafts === null && <p className="py-8 text-center text-sm font-bold text-muted">Loading…</p>}
              {drafts !== null && drafts.length === 0 && (
                <p className="py-8 text-center text-sm text-muted">No unfinished bills.</p>
              )}
              {(drafts || []).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{d.product_code}</p>
                    <p className="truncate text-xs text-muted">
                      {d.customer_name || "No buyer yet"}
                      {d.customer_phone ? ` · ${d.customer_phone}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => resumeDraft(d.id)}>Resume</Button>
                    <Button size="sm" variant="outline" className="text-danger" onClick={() => discardDraft(d.id)}>Discard</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
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

/** Numbered step header. The bill is a sequence, so the sequence is shown. */
const SectionHead = ({ step, title, meta, action }) => (
  <div className="flex items-center gap-2.5">
    {step != null && (
      <span className="num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-extrabold text-white shadow-[0_4px_10px_-4px_rgba(159,29,53,0.6)]">
        {step}
      </span>
    )}
    <h3 className="text-[15px] font-extrabold tracking-tight">{title}</h3>
    {meta ? <span className="ml-auto text-[11px] font-semibold text-muted">{meta}</span> : null}
    {action ? <span className={meta ? "" : "ml-auto"}>{action}</span> : null}
  </div>
);

/** One cell of the item spec strip: label over value, hairline separated. */
const SpecCell = ({ label, value, mono, sub, tone = "text-ink" }) => (
  <div className="min-w-0 flex-1 px-4 py-3">
    <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">{label}</div>
    <div className={`mt-1 truncate text-base font-extrabold ${tone || "text-ink"} ${mono ? "num" : ""}`}>{value}</div>
    {sub ? <div className="truncate text-[10px] font-semibold text-muted">{sub}</div> : null}
  </div>
);

/** The one figure the whole screen exists to produce — given its own band so
    it stops competing with the charge rows above it. */
const BillTotalBand = ({ label, value }) => (
  <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-accent px-4 py-3.5 text-white">
    <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-white/85">{label}</span>
    <span className="num text-xl font-extrabold">{value}</span>
  </div>
);

const Row = ({ label, value, strong, divider, tone }) => (
  <div className={`flex items-center justify-between gap-4 py-1 ${divider ? "mt-1 border-t border-dashed border-line pt-2" : ""} ${strong ? "mt-1 border-t border-line pt-2" : ""}`}>
    <span className={`text-xs ${strong ? "font-extrabold text-ink" : "text-muted"}`}>{label}</span>
    <span className={`num text-sm ${strong ? "text-base font-extrabold text-accent-strong" : `font-semibold ${tone || ""}`}`}>{value}</span>
  </div>
);

// The backend totals from unrounded figures (and a typed customer price is
// kept exactly), so the rounded lines can miss the total by a paisa. That gap
// is stated as a round-off so the column adds up; anything larger is not a
// rounding gap and is left visible rather than absorbed.
const RoundOffRow = ({ total, parts }) => {
  const diff = round2(total - parts);
  if (Math.abs(diff) < 0.005 || Math.abs(diff) > 0.05) return null;
  return <Row label="Round off" value={`${diff > 0 ? "+" : "−"} ${money(Math.abs(diff))}`} tone="text-muted" />;
};
