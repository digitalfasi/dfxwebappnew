import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, SearchInput } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { billingService } from "../services/billingService";
import { customerService } from "../services/customerService";
import { enrollmentService } from "../services/enrollmentService";

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

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const grams = (n) => `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`;
const num = (s) => (s === "" || s == null ? 0 : Math.max(0, Number(s) || 0));

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
  const [payMethod, setPayMethod] = useState("CASH");
  const [payStatus, setPayStatus] = useState("PAID");
  const [partialAmount, setPartialAmount] = useState("");
  const [payRef, setPayRef] = useState("");

  // OTP redemption
  const [otp, setOtp] = useState(null); // {saleId, items:[{enrollmentId,amount}]}

  usePageMotion(scope, [loading, product]);

  useEffect(() => {
    let alive = true;
    billingService.getTodayGoldRate24k().then((r) => { if (alive) setGoldRate(r); }).catch(() => { if (alive) setGoldRate(null); });
    return () => { alive = false; };
  }, []);

  const discountNum = num(discount);
  const goldProfitCeiling = product && product.goldProfitAmount != null ? product.goldProfitAmount : null;
  const discountExceedsProfit = goldProfitCeiling != null && discountNum > goldProfitCeiling + 1e-6;

  // First HUID lookup — confirm a real sellable item and seed edit fields.
  const handleFind = useCallback(async () => {
    const key = code.trim();
    if (!key) { toast("Enter HUID"); return; }
    if (loading) return;
    setLoading(true); setLookupError("");
    setProduct(null); setProductCode("");
    setDiscount(""); setGst(true);
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
    if (!productCode) return;
    const t = setTimeout(async () => {
      setRequoting(true);
      try {
        const q = await billingService.getSaleQuote(productCode, {
          discountAmount: discountNum,
          gstApplied: gst,
          appliedRatePerGram: rate === "" ? undefined : num(rate),
          makingChargeValue: makingVal === "" ? undefined : num(makingVal),
          makingChargeType: product?.makingChargeType || undefined,
          wastageValue: wastageVal === "" ? undefined : num(wastageVal),
          wastageType: product?.wastageType || undefined,
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
  }, [productCode, rate, makingVal, wastageVal, discountNum, gst]);

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

  const billTotal = product ? product.finalAmount : 0;
  const redeemOverBill = redeemTotal > billTotal + 0.005;
  const remaining = Math.max(0, Number((billTotal - redeemTotal).toFixed(2)));

  const partialNum = num(partialAmount);
  const partialInvalid = payStatus === "PARTIAL" && !(partialNum > 0 && partialNum < remaining);
  const paidNow = payStatus === "PAID" ? remaining : payStatus === "PARTIAL" ? partialNum : 0;
  const outstanding = Math.max(0, Number((remaining - paidNow).toFixed(2)));

  const customerIdentified =
    customerMode === "existing" ? !!selectedCustomer?.id : walkinName.trim().length >= 2;

  const baseInputs = () => ({
    productCode: product.productCode,
    customerId: customerMode === "existing" ? selectedCustomer?.id : undefined,
    customerName: customerMode === "walkin" ? walkinName.trim() : undefined,
    customerPhone: customerMode === "walkin" ? (walkinPhone.trim() || undefined) : undefined,
    discountAmount: discountNum,
    gstApplied: gst,
    appliedRatePerGram: rate === "" ? undefined : num(rate),
    makingChargeValue: makingVal === "" ? undefined : num(makingVal),
    makingChargeType: product.makingChargeType || undefined,
    wastageValue: wastageVal === "" ? undefined : num(wastageVal),
    wastageType: product.wastageType || undefined,
  });

  const canCreate =
    !!product && !creating && !requoting && !discountExceedsProfit &&
    customerIdentified && !partialInvalid && !anyLineOverBalance && !redeemOverBill;

  const resetAll = () => {
    setProduct(null); setProductCode(""); setCode("");
    setRate(""); setMakingVal(""); setWastageVal(""); setDiscount(""); setGst(true);
    clearCustomer(); setCustQuery(""); setCustResults([]); setWalkinName(""); setWalkinPhone("");
    setPayMethod("CASH"); setPayStatus("PAID"); setPartialAmount(""); setPayRef("");
    setLookupError(""); setOtp(null);
  };

  const handleCreateBill = async () => {
    if (!canCreate || !product) {
      if (!customerIdentified) toast("Select a customer or enter a walk-in name");
      else if (discountExceedsProfit) toast("Discount exceeds available Gold Profit");
      else if (anyLineOverBalance) toast("A redemption exceeds its scheme balance");
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
        toast(`Sale ${sale.invoiceNumber} created — ${money(sale.finalAmount)}`);
        resetAll();
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
      toast(`Quotation ${q.quotationNumber} created — ${money(q.finalAmount)} (nothing sold)`);
    } catch (err) {
      toast(err?.message || "Could not generate quotation");
    }
  };

  const onOtpDone = () => { toast("Sale completed with scheme redemption"); resetAll(); };

  const goldValueLine = product ? product.goldValueAmount + (product.goldProfitAmount || 0) : 0;

  return (
    <div ref={scope} className="mx-auto max-w-[1040px]">
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">New Sale</h2>
        <p className="mt-1 max-w-[64ch] text-sm text-muted">Enter the item's HUID, adjust the applicable rate and charges if needed, identify the buyer, then confirm the bill. Every amount is calculated by the backend.</p>
      </div>

      {/* HUID lookup */}
      <Card data-motion="reveal" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold">Find product by HUID</h3>
          <Badge tone="neutral">{goldRate != null ? `Today 24K ₹${goldRate.toLocaleString("en-IN")}/g` : "Today 24K —"}</Badge>
        </div>
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

      {product && (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.35fr_1fr]" data-motion="reveal">
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
                <MiniField label="Live 24K" value={product.goldRate24k != null ? money(product.goldRate24k) : (goldRate != null ? money(goldRate) : "—")} />
              </div>
            </Card>

            {/* Rate & charges */}
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-extrabold">Rate &amp; charges</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">{product.purity ? `${product.purity} ` : ""}Sale Rate/g (₹) *</span>
                  <Input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
                  <span className="text-[11px] text-muted">Applicable purity rate. Default {product.goldRateApplied != null ? money(product.goldRateApplied) : "—"} (24K × purity). Editable.</span>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">GST</span>
                  <Select value={gst ? "Apply GST" : "No GST"} onValueChange={(v) => setGst(v === "Apply GST")} options={["Apply GST", "No GST"]} />
                  <span className="text-[11px] text-muted">{product.taxRatePercent ? `${product.taxRatePercent}% when applied` : "Backend tax rate"}</span>
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
                  <Input type="number" step="0.01" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} error={discountExceedsProfit ? "Exceeds Gold Profit" : undefined} placeholder="0" />
                  {goldProfitCeiling != null ? (
                    <span className={`text-[11px] ${discountExceedsProfit ? "font-semibold text-danger" : "text-muted"}`}>
                      {discountExceedsProfit ? `Max discount ${money(goldProfitCeiling)} — a discount may only reduce Gold Profit.` : `Up to ${money(goldProfitCeiling)} can be absorbed from Gold Profit.`}
                    </span>
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
                      <div className="mb-2 text-xs font-bold text-muted">Active schemes</div>
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
                <label className="grid gap-1.5"><span className="text-xs font-bold">Method</span>
                  <Select value={payMethod} onValueChange={setPayMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))} />
                </label>
                <label className="grid gap-1.5"><span className="text-xs font-bold">Status</span>
                  <Select value={payStatus} onValueChange={setPayStatus} options={PAYMENT_STATUSES.map((s) => ({ value: s, label: PAYMENT_STATUS_LABEL[s] }))} />
                </label>
                {payStatus === "PARTIAL" && (
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Paid now (₹) *</span>
                    <Input type="number" step="0.01" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} error={partialInvalid ? "Must be > 0 and < remaining" : undefined} />
                    {partialInvalid && <span className="text-[11px] font-semibold text-danger">Between {money(0)} and {money(remaining)}</span>}
                  </label>
                )}
                <label className="grid gap-1.5"><span className="text-xs font-bold">Reference No.</span><Input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Optional" /></label>
              </div>
              {schemeApplied && <p className="text-[11px] text-muted">Payment applies to the amount remaining after scheme redemption ({money(remaining)}).</p>}
            </Card>
          </div>

          {/* RIGHT: bill summary */}
          <div className="min-w-0">
            <Card className="p-5 lg:sticky lg:top-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold">Bill summary</h3>
                {requoting && <span className="text-[11px] text-muted">Recalculating…</span>}
              </div>
              <div className="mt-3 space-y-0.5">
                <Row label="Gold Value" value={money(goldValueLine)} />
                <Row label={`Making Charge${chargePct(product.makingChargeType, makingVal || product.makingChargeValue) ? ` ${chargePct(product.makingChargeType, makingVal || product.makingChargeValue)}` : ""}`} value={money(product.makingChargeAmount)} />
                <Row label={`Wastage${chargePct(product.wastageType, wastageVal || product.wastageValue) ? ` ${chargePct(product.wastageType, wastageVal || product.wastageValue)}` : ""}`} value={money(product.wastageAmount)} />
                {product.stoneChargeAmount > 0 && <Row label="Stone Charge" value={money(product.stoneChargeAmount)} />}
                {product.otherChargesAmount > 0 && <Row label="Other Charges" value={money(product.otherChargesAmount)} />}
                <Row label="Subtotal" value={money(product.subtotalBeforeTax)} divider />
                <Row label={`GST${product.gstApplied && product.taxRatePercent ? ` ${product.taxRatePercent}%` : ""}`} value={money(product.taxAmount)} />
                {product.discountAmount > 0 && <Row label="Discount" value={`− ${money(product.discountAmount)}`} tone="text-emerald-700" />}
                <Row label="Bill Total" value={money(billTotal)} strong />
                {schemeApplied && <Row label="Scheme Redemption" value={`− ${money(redeemTotal)}`} tone="text-emerald-700" divider />}
                {schemeApplied && <Row label="Amount Payable" value={money(remaining)} strong />}
                {schemeApplied && (
                  <>
                    <Row label="Paid now" value={money(paidNow)} />
                    <Row label="Outstanding" value={money(outstanding)} tone={outstanding > 0 ? "text-accent" : ""} />
                  </>
                )}
              </div>
              <div className="mt-5 flex flex-col gap-2">
                <Button size="sm" className="bg-accent hover:bg-accent-strong w-full" disabled={!canCreate} onClick={handleCreateBill}>{creating ? "Working…" : schemeApplied ? "Create Bill & Redeem" : "Create Bill"}</Button>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={handleQuotation} disabled={creating || requoting}>Quotation</Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={resetAll} disabled={creating}>Cancel</Button>
                </div>
              </div>
              {!customerIdentified && <p className="mt-2 text-center text-[11px] text-muted">Identify the buyer to enable billing.</p>}
            </Card>
          </div>
        </div>
      )}

      {otp && (
        <OtpDialog
          otp={otp}
          onClose={() => setOtp(null)}
          onDone={onOtpDone}
        />
      )}
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
          <p className="text-xs text-muted">Invoice {otp.invoiceNumber} is created and pending. Enter the code sent to the customer's app to redeem their scheme balance and settle it.</p>
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

const Row = ({ label, value, strong, divider, tone }) => (
  <div className={`flex items-center justify-between gap-4 py-1 ${divider ? "mt-1 border-t border-line pt-2" : ""} ${strong ? "mt-1 border-t border-line pt-2" : ""}`}>
    <span className={`text-xs ${strong ? "font-extrabold text-ink" : "text-muted"}`}>{label}</span>
    <span className={`num text-sm ${strong ? "text-base font-extrabold text-accent-strong" : `font-semibold ${tone || ""}`}`}>{value}</span>
  </div>
);
