import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, SearchInput } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { formatINR } from "../lib/utils";
import { billingService } from "../services/billingService";

const STATUS_TONE = { Paid: "success", Partial: "warning", Pending: "danger", Returned: "info", Canceled: "neutral" };
const PAY_STATUS_TONE = { PAID: "success", PARTIAL: "warning", PENDING: "danger" };
const PAGE_LIMIT = 100; // backend caps /billing/sales at limit<=100

// Named periods the backend resolves server-side, plus a Custom range.
const PERIODS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

// Backend payment_method enum -> label for the Record Payment form.
const PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
];

const RETURN_TYPES = [
  { value: "RETURN", label: "Return" },
  { value: "CANCELLATION", label: "Cancellation" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatWeight(grams) {
  const n = Number(grams);
  return `${Number.isFinite(n) ? n.toFixed(3) : "0.000"} g`;
}

// Charge label like the PDF: "(11%)" / "(Rs.600.00/g)" / "(fixed)".
function chargeLabel(type, value) {
  const t = String(type || "").toUpperCase();
  if (t === "PERCENTAGE") return `(${value}%)`;
  if (t === "PER_GRAM") return `(₹${Number(value).toFixed(2)}/g)`;
  return "(fixed)";
}

export default function SalesHistory() {
  const scope = useRef(null);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("this_month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fCat, setFCat] = useState("All Categories");
  const [fSub, setFSub] = useState("All Sub-categories");
  const [fPurity, setFPurity] = useState("All Purity");

  const [bills, setBills] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [printing, setPrinting] = useState(null);

  usePageMotion(scope, [loading]);
  usePressFeedback(scope);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const args = { limit: PAGE_LIMIT, search: query.trim() };
      if (period === "custom") {
        if (dateFrom) args.dateFrom = dateFrom;
        if (dateTo) args.dateTo = dateTo;
      } else if (period !== "all") {
        args.period = period;
      }
      const { sales, total: count, totalOutstanding: out } = await billingService.listSales(args);
      setBills(sales);
      setTotal(count);
      setTotalOutstanding(out || 0);
    } catch (err) {
      setLoadError(err?.message || "Could not load sales history");
      setBills([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, period, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Category / sub-category / purity are filtered client-side (backend list has
  // no such params); search + date/period go through the backend.
  const rows = useMemo(() => {
    return bills.filter((b) => {
      const matchesCat = fCat === "All Categories" || b.category === fCat;
      const matchesSub = fSub === "All Sub-categories" || b.subcategory === fSub;
      const matchesPurity = fPurity === "All Purity" || b.purity === fPurity;
      return matchesCat && matchesSub && matchesPurity;
    });
  }, [bills, fCat, fSub, fPurity]);

  const catOptions = useMemo(() => [...new Set(bills.map(b => b.category).filter(Boolean))].sort(), [bills]);
  const subOptions = useMemo(() => [...new Set(bills.map(b => b.subcategory).filter(Boolean))].sort(), [bills]);
  const purityOptions = useMemo(() => [...new Set(bills.map(b => b.purity).filter(Boolean))].sort(), [bills]);

  const totalGoldSold = useMemo(() => rows.reduce((s, b) => s + (b.netGoldWeightGrams || 0), 0), [rows]);

  // Purity-wise sold-gold composition of the current view (respects the
  // category / sub-category / purity filters, since `rows` is already filtered).
  const composition = useMemo(() => {
    const map = new Map();
    let sum = 0;
    rows.forEach((b) => {
      const g = b.netGoldWeightGrams || 0;
      if (g <= 0) return;
      const key = b.purity || "—";
      map.set(key, (map.get(key) || 0) + g);
      sum += g;
    });
    const parts = [...map.entries()]
      .map(([pur, g]) => ({ pur, g, pct: sum > 0 ? Math.round((g / sum) * 100) : 0 }))
      .sort((a, b) => b.g - a.g);
    return { sum, parts };
  }, [rows]);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await billingService.exportSalesXlsx({ search: query.trim() });
      toast("Sales history exported");
    } catch (err) {
      toast(err?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const clearFilters = () => {
    setFCat("All Categories"); setFSub("All Sub-categories"); setFPurity("All Purity");
  };
  const filtersActive = fCat !== "All Categories" || fSub !== "All Sub-categories" || fPurity !== "All Purity";

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  // Print Invoice — open the invoice PDF in a new tab (auth-fetched) to view/print.
  const handlePrint = async (b) => {
    if (printing) return;
    setPrinting(b.id);
    try {
      await billingService.openInvoicePdf(b.id);
    } catch (err) {
      toast(err?.message || "Could not open invoice");
    } finally {
      setPrinting(null);
    }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1280px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Sales History</h2>
          <p className="mt-1 max-w-[55ch] text-sm text-muted">
            Every bill raised at the counter — filter, view the full breakdown, and reprint invoices.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={exporting} onClick={handleExport}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 15V3m0 12-4-4m4 4 4-4" /><path d="M2 17l.62 2.48A2 2 0 0 0 4.56 21h14.88a2 2 0 0 0 1.94-1.52L22 17" />
          </svg>
          {exporting ? "Exporting…" : "Export Excel"}
        </Button>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(220px,270px)_1fr]">
        <div className="grid gap-3">
          <Card data-motion="stat" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Total Gold Sold</div>
            <div className="num mt-1 text-2xl font-extrabold">{totalGoldSold.toFixed(2)} g</div>
            <div className="text-xs text-muted">Net gold · current view</div>
          </Card>
          <Card data-motion="stat" className="p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Outstanding</div>
            <div className="num mt-1 text-2xl font-extrabold">{formatINR(totalOutstanding)}</div>
            <div className="text-xs text-muted">Across filtered bills</div>
          </Card>
        </div>
        <Card data-motion="stat" className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Sales Composition</div>
            <div className="text-[11px] text-muted">Purity-wise · sold gold</div>
          </div>
          {composition.parts.length === 0 ? (
            <div className="mt-3 text-sm text-muted">No sold gold in the current view.</div>
          ) : (
            <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
              {composition.parts.map(({ pur, g, pct }) => (
                <div key={pur}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-bold">
                      <span className="inline-block h-2 w-2 rounded-full bg-accent" />{pur}
                    </span>
                    <span className="num font-mono text-xs font-semibold text-muted tabular-nums">{g.toFixed(2)} g · {pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-soft">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Filter row — old-app layout: search + from/to date + category + sub + purity + period. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput
          className="min-w-[200px] flex-1"
          placeholder="Search invoice, product, or customer..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sales"
        />
        <Select value={period} onValueChange={setPeriod} options={PERIODS} className="w-[140px]" />
        {period === "custom" && (
          <>
            <Input type="date" value={dateFrom} max={dateTo || todayIso()} onChange={(e) => setDateFrom(e.target.value)} className="w-[150px]" aria-label="From date" />
            <Input type="date" value={dateTo} max={todayIso()} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="w-[150px]" aria-label="To date" />
          </>
        )}
        <Select value={fCat} onValueChange={setFCat} options={["All Categories", ...catOptions]} className="w-[150px]" />
        <Select value={fSub} onValueChange={setFSub} options={["All Sub-categories", ...subOptions]} className="w-[170px]" />
        <Select value={fPurity} onValueChange={setFPurity} options={["All Purity", ...purityOptions]} className="w-[130px]" />
        {filtersActive && (
          <button onClick={clearFilters} className="text-xs font-bold text-accent underline">Clear</button>
        )}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="auto-fade-scroll overflow-x-auto px-0 pb-0">
          {/* Draft B Point 13 — 16-column order:
             Invoice, Date, Customer, HUID, Category, Sub-category, No. of Items,
             Weight, Payment Type, Total, Paid, Outstanding, Profit/Loss, Status,
             View, Print Invoice. */}
          <table className="w-full min-w-[1500px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-3">
                <th className="!pl-5">Invoice No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th>HUID</th>
                <th>Category</th>
                <th>Sub-category</th>
                <th className="text-right">Items</th>
                <th className="text-right">Weight</th>
                <th>Payment Type</th>
                <th className="text-right">Total Amount</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Outstanding</th>
                <th className="text-right">Profit/Loss</th>
                <th>Status</th>
                <th className="text-center">View</th>
                <th className="!pr-5 text-center">Print Invoice</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className="cursor-pointer border-b border-line-soft align-middle transition-colors duration-150 last:border-0 hover:bg-canvas/60 [&>td]:px-3 [&>td]:py-3.5"
                >
                  <td className="!pl-5 font-mono text-xs font-semibold">{b.inv}</td>
                  <td className="whitespace-nowrap text-muted">{formatDate(b.saleTimestamp)}</td>
                  <td className="min-w-[130px]">
                    <div className="font-bold">{b.customer}</div>
                    {b.customerCode && <div className="font-mono text-[11px] text-muted">{b.customerCode}</div>}
                  </td>
                  <td className="whitespace-nowrap font-mono text-xs text-muted">{b.huid || "—"}</td>
                  <td className="text-muted">{b.category || "—"}</td>
                  <td className="text-muted">{b.subcategory || "—"}</td>
                  <td className="num text-right">{b.items}</td>
                  <td className="num whitespace-nowrap text-right">{formatWeight(b.grossWeightGrams)}</td>
                  <td className="whitespace-nowrap text-muted">{b.method}</td>
                  <td className="num whitespace-nowrap text-right font-bold">{formatINR(b.amount)}</td>
                  <td className="num whitespace-nowrap text-right">{formatINR(b.paid)}</td>
                  <td className={`num whitespace-nowrap text-right font-semibold ${b.outstanding > 0 ? "text-danger" : "text-muted"}`}>{formatINR(b.outstanding)}</td>
                  <td className="num whitespace-nowrap text-right font-semibold">
                    {b.grossMargin == null ? (
                      <span className="text-faint">—</span>
                    ) : (
                      <span className={b.grossMargin < 0 ? "text-danger" : "text-emerald-600"}>
                        {b.grossMargin < 0 ? "−" : "+"}{formatINR(Math.abs(b.grossMargin))}
                      </span>
                    )}
                  </td>
                  <td><Badge tone={STATUS_TONE[b.status]} dot>{b.status}</Badge></td>
                  <td className="text-center">
                    <button
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink transition-colors duration-150 hover:border-accent-line hover:bg-accent-soft hover:text-accent-strong"
                      onClick={(e) => { e.stopPropagation(); setSelectedId(b.id); }}
                    >
                      View
                    </button>
                  </td>
                  <td className="!pr-5 text-center">
                    <button
                      className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink transition-colors duration-150 hover:border-accent-line hover:bg-accent-soft hover:text-accent-strong disabled:opacity-50"
                      disabled={printing === b.id}
                      onClick={(e) => { e.stopPropagation(); handlePrint(b); }}
                    >
                      {printing === b.id ? "Opening…" : "Print"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="px-6 py-14 text-center"><div className="font-bold">Loading bills…</div></div>
          )}
          {!loading && loadError && (
            <div className="px-6 py-14 text-center">
              <div className="font-bold">Couldn’t load sales</div>
              <p className="mt-1 text-sm text-muted">{loadError}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={load}>Retry</Button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <div className="px-6 py-14 text-center">
              <div className="font-bold">No bills found</div>
              <p className="mt-1 text-sm text-muted">Try a different search, date range, or filter.</p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-3 flex items-center justify-between text-xs font-semibold text-muted">
        <span>Showing {rows.length} of {total.toLocaleString("en-IN")} bills</span>
        <span>Page 1 of {totalPages}</span>
      </div>

      {selectedId && (
        <SaleDetail
          sale={bills.find((b) => b.id === selectedId)}
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

function BreakdownRow({ label, value, strong }) {
  return (
    <div className={`flex items-center justify-between py-1 ${strong ? "border-t border-line pt-2 font-bold" : ""}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="num font-semibold">{value}</span>
    </div>
  );
}

/**
 * View popup — full price breakdown, admin purchase cost + profit/loss %, the
 * payment ledger with Record Payment, and Return/Cancel + PDF/Excel/Print
 * actions. All figures come from the already-mapped sale row + the payment
 * ledger; nothing is recomputed.
 */
function SaleDetail({ sale, onClose, onChanged }) {
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);

  // Record Payment form.
  const [form, setForm] = useState({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Return / Cancel form (hidden until opened).
  const [retOpen, setRetOpen] = useState(false);
  const [ret, setRet] = useState({ type: "RETURN", reason: "", amount: "", method: "CASH", reference: "", date: todayIso() });
  const [retError, setRetError] = useState("");
  const [retSubmitting, setRetSubmitting] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!sale) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      setHistory(await billingService.getSalePayments(sale.id));
    } catch (err) {
      setHistoryError(err?.message || "Could not load payment history");
      setHistory(null);
    } finally {
      setHistoryLoading(false);
    }
  }, [sale]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  if (!sale) return null;

  const paid = history ? history.amountPaid : sale.paid;
  const outstanding = history ? history.amountOutstanding : sale.outstanding;
  const lossPct = sale.purchaseCost > 0 && sale.grossMargin != null
    ? (sale.grossMargin / sale.purchaseCost) * 100
    : null;
  const reversed = sale.saleStatus === "RETURNED" || sale.saleStatus === "CANCELLED";

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError("");
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setFormError("Enter a valid amount greater than 0."); return; }
    if (!form.date) { setFormError("Select a payment date."); return; }
    setSubmitting(true);
    try {
      const updated = await billingService.recordSalePayment(sale.id, {
        amount, paymentDate: form.date, paymentMethod: form.method,
        referenceNo: form.reference.trim(), remarks: form.remarks.trim(),
      });
      setHistory(updated);
      setForm({ amount: "", method: "CASH", date: todayIso(), reference: "", remarks: "" });
      toast("Payment recorded");
      onChanged?.();
    } catch (err) {
      setFormError(err?.message || "Could not record payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (e) => {
    e.preventDefault();
    if (retSubmitting) return;
    setRetError("");
    if (ret.reason.trim().length < 3) { setRetError("Reason must be at least 3 characters."); return; }
    setRetSubmitting(true);
    try {
      await billingService.processReturn(sale.id, {
        returnType: ret.type,
        reason: ret.reason.trim(),
        refundAmount: ret.amount,
        refundMethod: ret.amount !== "" ? ret.method : undefined,
        refundReferenceNo: ret.reference.trim(),
        refundDate: ret.date,
      });
      toast(ret.type === "CANCELLATION" ? "Sale cancelled" : "Sale returned");
      onChanged?.();
      onClose();
    } catch (err) {
      setRetError(err?.message || "Could not process return");
    } finally {
      setRetSubmitting(false);
    }
  };

  const runAction = async (fn, okMsg, errMsg) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (err) { toast(err?.message || errMsg); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative flex max-h-[92vh] w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-line px-6 py-4">
          <div>
            <h3 className="text-base font-extrabold">Invoice {sale.inv}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {sale.productName} · {sale.productCode}{sale.purity ? ` · ${sale.purity}` : ""}
              {sale.huid ? ` · HUID ${sale.huid}` : ""}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {sale.customer}{sale.customerCode ? ` (${sale.customerCode})` : ""} · {formatDate(sale.saleTimestamp)}
            </p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas" aria-label="Close">✕</button>
        </div>

        <div className="auto-fade-scroll flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {/* Product weights. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Gross weight</div>
              <div className="num mt-0.5 text-sm font-bold">{formatWeight(sale.grossWeightGrams)}</div>
            </div>
            <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Net gold weight</div>
              <div className="num mt-0.5 text-sm font-bold">{formatWeight(sale.netGoldWeightGrams)}</div>
            </div>
          </div>

          {/* Price breakdown — customer-facing lines only (no Gold Profit line). */}
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted">Price breakdown</div>
            <div className="rounded-xl border border-line px-4 py-3 text-sm">
              <BreakdownRow label={`Gold Value${sale.goldRateApplied ? ` (₹${Number(sale.goldRateApplied).toFixed(2)}/g)` : ""}`} value={formatINR(sale.goldValueAmount)} />
              <BreakdownRow label={`Making ${chargeLabel(sale.makingChargeType, sale.makingChargeValue)}`} value={formatINR(sale.makingChargeAmount)} />
              <BreakdownRow label={`Wastage ${chargeLabel(sale.wastageType, sale.wastageValue)}`} value={formatINR(sale.wastageAmount)} />
              {sale.stoneChargeAmount > 0 && <BreakdownRow label="Stone" value={formatINR(sale.stoneChargeAmount)} />}
              {sale.otherChargesAmount > 0 && <BreakdownRow label="Other" value={formatINR(sale.otherChargesAmount)} />}
              <BreakdownRow label="Subtotal" value={formatINR(sale.subtotalBeforeTax)} />
              {sale.gstApplied && <BreakdownRow label={`GST (${sale.taxRatePercent}%)`} value={formatINR(sale.taxAmount)} />}
              {sale.discountAmount > 0 && <BreakdownRow label="Discount" value={`− ${formatINR(sale.discountAmount)}`} />}
              <BreakdownRow label="Bill Total" value={formatINR(sale.finalAmount)} strong />
            </div>
          </div>

          {/* Admin-only cost + profit/loss. */}
          {sale.purchaseCost != null && (
            <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-sm">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted">Internal (admin only)</div>
              <BreakdownRow label="Purchase Cost" value={formatINR(sale.purchaseCost)} />
              <div className="flex items-center justify-between py-1">
                <span className="text-muted">{sale.grossMargin < 0 ? "Loss" : "Profit"}</span>
                <span className={`num font-bold ${sale.grossMargin < 0 ? "text-danger" : "text-emerald-600"}`}>
                  {sale.grossMargin < 0 ? "−" : "+"}{formatINR(Math.abs(sale.grossMargin ?? 0))}
                  {lossPct != null ? ` (${lossPct < 0 ? "−" : "+"}${Math.abs(lossPct).toFixed(1)}%)` : ""}
                </span>
              </div>
            </div>
          )}

          {/* Payment figures + ledger. */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Total</div>
              <div className="num mt-0.5 text-sm font-bold">{formatINR(sale.finalAmount)}</div>
            </div>
            <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Paid</div>
              <div className="num mt-0.5 text-sm font-bold">{formatINR(paid)}</div>
            </div>
            <div className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">Outstanding</div>
              <div className="num mt-0.5 text-sm font-bold">{formatINR(outstanding)}</div>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-muted">Payments</div>
            {historyLoading && <div className="py-4 text-center text-sm font-bold">Loading payments…</div>}
            {!historyLoading && historyError && (
              <div className="py-4 text-center">
                <p className="text-sm text-muted">{historyError}</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={loadHistory}>Retry</Button>
              </div>
            )}
            {!historyLoading && !historyError && history && (
              history.payments.length === 0 ? (
                <p className="rounded-xl border border-line bg-canvas/40 px-3 py-4 text-center text-sm text-muted">No payments recorded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {history.payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
                      <div>
                        <div className="num text-sm font-bold">{formatINR(p.amount)}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          {p.methodLabel} · {formatDate(p.paymentDate)}{p.referenceNo ? ` · Ref ${p.referenceNo}` : ""}
                        </div>
                        {p.remarks && <div className="mt-0.5 text-xs text-muted">{p.remarks}</div>}
                      </div>
                      {p.recordedByName && <div className="shrink-0 text-right text-[11px] text-faint">{p.recordedByName}</div>}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          {/* Record Payment — only when still owed and not reversed. */}
          {!reversed && history && outstanding > 0 && (
            <form onSubmit={handleRecordPayment} className="space-y-4 border-t border-line pt-5">
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Record payment</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Amount *</span>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" placeholder={`Up to ${formatINR(outstanding)}`} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Method *</span>
                  <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })} options={PAY_METHODS} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Payment date *</span>
                  <Input type="date" value={form.date} max={todayIso()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Reference no.</span>
                  <Input placeholder="Txn / cheque ref" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                </label>
                <label className="grid gap-1.5 sm:col-span-2">
                  <span className="text-xs font-bold">Remarks</span>
                  <Input placeholder="Optional note" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
                </label>
              </div>
              {formError && <p role="alert" className="text-xs font-semibold text-danger">{formError}</p>}
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={submitting}>{submitting ? "Recording…" : "Record payment"}</Button>
              </div>
            </form>
          )}

          {/* Return / Cancel form. */}
          {!reversed && retOpen && (
            <form onSubmit={handleReturn} className="space-y-4 border-t border-line pt-5">
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Return / Cancel</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Type *</span>
                  <Select value={ret.type} onValueChange={(v) => setRet({ ...ret, type: v })} options={RETURN_TYPES} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Refund amount</span>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" placeholder="Defaults to refundable cash" value={ret.amount} onChange={(e) => setRet({ ...ret, amount: e.target.value })} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Refund method</span>
                  <Select value={ret.method} onValueChange={(v) => setRet({ ...ret, method: v })} options={PAY_METHODS} />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Refund date</span>
                  <Input type="date" value={ret.date} max={todayIso()} onChange={(e) => setRet({ ...ret, date: e.target.value })} />
                </label>
                <label className="grid gap-1.5 sm:col-span-2">
                  <span className="text-xs font-bold">Reason *</span>
                  <Input placeholder="Why is this being reversed?" value={ret.reason} onChange={(e) => setRet({ ...ret, reason: e.target.value })} />
                </label>
              </div>
              {retError && <p role="alert" className="text-xs font-semibold text-danger">{retError}</p>}
              <div className="flex justify-end gap-2.5">
                <Button type="button" variant="outline" size="sm" onClick={() => setRetOpen(false)} disabled={retSubmitting}>Cancel</Button>
                <Button type="submit" size="sm" disabled={retSubmitting}>{retSubmitting ? "Processing…" : "Confirm"}</Button>
              </div>
            </form>
          )}

          {reversed && (
            <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-center text-sm font-semibold text-muted">
              This sale has been {sale.saleStatus === "CANCELLED" ? "cancelled" : "returned"}.
            </div>
          )}
        </div>

        {/* Action bar. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction(() => billingService.openInvoicePdf(sale.id), null, "Could not open invoice")}>Print</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction(() => billingService.downloadInvoicePdf(sale.id, sale.inv), `${sale.inv} PDF downloaded`, "Could not download PDF")}>PDF</Button>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => runAction(() => billingService.downloadInvoiceExcel(sale.id, sale.inv), `${sale.inv} Excel downloaded`, "Could not download Excel")}>Excel</Button>
            {!reversed && !retOpen && (
              <Button variant="outline" size="sm" onClick={() => setRetOpen(true)}>Return / Cancel</Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}

