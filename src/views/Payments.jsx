import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input, SearchInput } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { paymentService } from "../services/paymentService";
import { billingService } from "../services/billingService";

// Scheme payments load from GET /payments via paymentService.
// Business (product/counter-sale) payments load from the billing domain
// (GET /billing/sales) via billingService — each invoice is one business payment
// with backend-authoritative paid/outstanding/status. No mock rows in either tab.

function fmtSaleDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}
function fmtSaleTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
/** billingService sale row -> the payment row shape the table renders. */
function mapBusinessRow(s) {
  return {
    id: s.inv,
    paymentId: s.id,
    enrollment: "—",
    customer: s.customer,
    mobile: "",
    scheme: "—",
    amount: s.amount,
    paid: s.paid,
    outstanding: s.outstanding,
    status: s.status,
    method: s.method,
    date: fmtSaleDate(s.saleTimestamp),
    time: fmtSaleTime(s.saleTimestamp),
  };
}

const STATUS_FILTERS = ["All Payments", "SUCCESS", "Paid", "Partial", "Pending", "Outstanding"];
const TONE = { SUCCESS: "success", Paid: "success", Completed: "success", Partial: "warning", Pending: "info", Outstanding: "danger", Failed: "danger" };

function MethodBadge({ method }) {
  const map = {
    Online: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: "◉" },
    Cheque: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", icon: "▭" },
    Card: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", icon: "◫" },
    UPI: { bg: "bg-violet-50", border: "border-violet-200", text: "text-violet-700", icon: "⬔" },
    Cash: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", icon: "₹" },
    "Bank Transfer": { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", icon: "🏦" },
  };
  const s = map[method] || map.Online;
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${s.bg} ${s.border} ${s.text}`}><span className="text-[11px]">{s.icon}</span>{method}</span>;
}

export default function Payments() {
  const scope = useRef(null);
  usePressFeedback(scope);
  // Spec: Scheme Payments — currently selected
  const [tab, setTab] = useState("scheme");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All Payments");
  const [dateFilter, setDateFilter] = useState("This Month");
  const [month, setMonth] = useState("All");
  const [year, setYear] = useState("All");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [enrollmentNo, setEnrollmentNo] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [advance, setAdvance] = useState("1 month (regular)");
  const [remarks, setRemarks] = useState("");
  const [applied, setApplied] = useState({ search: "", status: "All Payments", month: "All", year: "All", date: "", dateFilter: "This Month" });
  const [schemeRows, setSchemeRows] = useState([]);
  const [businessRows, setBusinessRows] = useState([]);
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [scheme, business] = await Promise.all([
        paymentService.getSchemePayments(),
        billingService.listSales().then((r) => r.sales.map(mapBusinessRow)),
      ]);
      setSchemeRows(scheme);
      setBusinessRows(business);
    } catch (err) {
      setLoadError(err?.message || "Could not load payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const source = tab === "business" ? businessRows : schemeRows;

  const totals = useMemo(() => {
    const totalValue = source.reduce((s, r) => s + r.amount, 0);
    const totalCount = source.length;
    const completedRows = source.filter(r => r.status === "SUCCESS" || r.status === "Paid");
    const completedCount = completedRows.length;
    const completedValue = completedRows.reduce((s, r) => s + r.paid, 0);
    const outstanding = source.reduce((s, r) => s + (r.outstanding || 0), 0);
    // overdue currently derived from outstanding; for demo keep separate
    const overdueAmount = outstanding > 0 ? outstanding : 0;
    return { totalValue, totalCount, completedCount, completedValue, outstanding, overdueAmount };
  }, [source]);

  const rows = useMemo(() => {
    return source.filter(r => {
      const q = applied.search.toLowerCase();
      const mSearch = !q || r.customer.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || (r.enrollment && r.enrollment.toLowerCase().includes(q)) || (r.mobile && r.mobile.includes(q)) || (r.scheme && r.scheme.toLowerCase().includes(q));
      const mStatus = applied.status === "All Payments" || r.status === applied.status || (applied.status === "Paid" && (r.status === "Paid" || r.status === "SUCCESS")) || (applied.status === "SUCCESS" && r.status === "SUCCESS");
      const mDate = !applied.date || r.date.includes(applied.date);
      const mMonth = applied.month === "All" || r.date.includes(applied.month);
      const mYear = applied.year === "All" || r.date.includes(applied.year);
      return mSearch && mStatus && mDate && mMonth && mYear;
    });
  }, [source, applied]);

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      {/* Page title + Subtitle */}
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Payments</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted">Manage and view all business and scheme payments — track installments, settle dues and reconcile collections.</p>
      </div>

      {/* Top navigation / toggle */}
      <div className="flex items-center justify-between mb-4">
        <div data-motion="toolbar" className="flex gap-2 border-b border-line">
          {[{ id: "business", label: "Product / Business Payments" }, { id: "scheme", label: "Scheme Payments" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`border-b-2 px-4 py-2.5 text-sm font-bold transition-colors ${tab === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`}>{t.label}</button>
          ))}
        </div>
        {/* Primary action — Record Manual Payment on upper-right, blue filled with plus */}
        <Button size="sm" variant="default" onClick={() => setShowManual(true)} className="bg-accent hover:bg-accent-strong">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg> Record Manual Payment
        </Button>
      </div>

      {/* Search & filters — horizontal filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder="Search by customer, invoice, mobile, payment ID..." value={search} onChange={e => setSearch(e.target.value)} className="min-w-[260px] flex-1" />
        <Select value={status} onValueChange={setStatus} options={["All Payments", "SUCCESS", "Paid", "Pending", "Outstanding"]} variant="accent" className="w-40" />
        {/* Date filters: Today / This Week / This Month — selected / Last Month / Custom + Clear */}
        <div className="flex flex-wrap items-center gap-1.5">
          {["Today", "This Week", "This Month", "Last Month", "Custom"].map(f => (
            <button
              key={f}
              onClick={() => { setDateFilter(f); setApplied(prev => ({ ...prev, dateFilter: f })); }}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${dateFilter === f ? "border-accent bg-accent text-white shadow-sm" : "border-line bg-surface text-muted hover:border-accent-line hover:text-ink"}`}
            >
              {f}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={() => { setSearch(""); setDate(""); setMonth("All"); setYear("All"); setStatus("All Payments"); setDateFilter("This Month"); setApplied({ search: "", status: "All Payments", month: "All", year: "All", date: "", dateFilter: "This Month" }); }}>Clear</Button>
        </div>
      </div>

      {/* Summary cards — 3 horizontal metric cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3" data-motion="stat">
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">{tab === "scheme" ? "Total Scheme Payments" : "Total Business Payments"}</div>
          <div className="num mt-1 text-2xl font-extrabold">{totals.totalCount}</div>
          <div className="mt-1 text-xs font-semibold text-muted">₹{totals.totalValue.toLocaleString("en-IN")} total value</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Completed / Paid</div>
          <div className="num mt-1 text-2xl font-extrabold text-emerald-700">{totals.completedCount}</div>
          <div className="mt-1 text-xs font-semibold text-emerald-700/70">₹{totals.completedValue.toLocaleString("en-IN")} collected</div>
        </Card>
        <Card className="p-4 border-danger-line bg-danger-soft/40">
          <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-danger">Overdue Amount</div>
          <div className="num mt-1 text-2xl font-extrabold text-danger">₹{totals.overdueAmount.toLocaleString("en-IN")}</div>
          <div className="mt-1 text-xs font-semibold text-danger/70">{totals.overdueAmount > 0 ? "Requires immediate follow-up" : "No overdue — all clear"}</div>
        </Card>
      </div>

      {/* Payment history table */}
      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3.5">
          <h3 className="text-sm font-extrabold tracking-tight">{tab === "scheme" ? "Scheme Payment History" : "Business Payment History"}</h3>
        </div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">#</th><th className="py-3">Payment ID</th><th className="py-3">Enrollment</th><th className="py-3">Customer</th><th className="py-3">Scheme</th><th className="py-3">Amount</th><th className="py-3">Status</th><th className="py-3">Method</th><th className="py-3">Date</th><th className="py-3 text-right pr-6">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <tr key={r.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 font-medium text-muted">{index + 1}</td>
                  <td className="py-3.5 font-mono text-xs font-semibold">{r.id}</td>
                  <td className="py-3.5 font-mono text-xs font-medium text-muted">{r.enrollment}</td>
                  <td className="py-3.5 font-bold">{r.customer}</td>
                  <td className="py-3.5 text-xs font-semibold text-ink-soft">{r.scheme}</td>
                  <td className="num py-3.5 font-bold">₹{r.amount.toLocaleString("en-IN")}</td>
                  <td className="py-3.5"><Badge tone={TONE[r.status] || "success"}>{r.status}</Badge></td>
                  <td className="py-3.5"><MethodBadge method={r.method} /></td>
                  <td className="py-3.5">
                    <div className="font-medium text-ink">{r.date}</div>
                    <div className="text-xs text-muted">{r.time}</div>
                  </td>
                  <td className="py-3.5 pr-6 text-right">
                    <button onClick={() => setSelected(r)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent ml-auto" aria-label={`View ${r.id}`}>
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</div>
          )}
          {!loading && loadError && (
            <div className="px-6 py-14 text-center">
              <div className="font-bold text-danger">Couldn’t load payments</div>
              <p className="mt-1 text-sm text-muted">{loadError}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={loadPayments}>Retry</Button>
            </div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <div className="px-6 py-14 text-center">
              <div className="font-bold">No payments found</div>
              <p className="mt-1 text-sm text-muted">{tab === "business" ? "No business payments recorded yet." : "Try adjusting search, status or date filters."}</p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-3 text-xs font-semibold text-muted">Showing {rows.length} of {source.length} payments</div>

      {showManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Dark/blurred background overlay */}
          <button className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setShowManual(false)} aria-label="Close modal" />
          {/* Large white rounded container */}
          <div className="relative w-full max-w-[560px] rounded-2xl border border-line bg-white shadow-2xl">
            {/* Header with Close × in top-right, separated by divider */}
            <div className="flex items-center justify-between px-6 py-4">
              <h3 className="text-base font-extrabold tracking-tight">Record Manual Payment</h3>
              <button onClick={() => setShowManual(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted hover:bg-canvas hover:text-ink transition-colors">
                <span className="text-lg leading-none">×</span>
              </button>
            </div>
            <div className="h-px bg-line" />
            {/* Form fields */}
            <div className="px-6 py-5 space-y-4">
              {/* 1. Enrollment Number * - full-width */}
              <div>
                <label className="mb-1.5 block text-xs font-bold">Enrollment Number <span className="text-danger">*</span></label>
                <Input placeholder="e.g. ENR-2025-0142" value={enrollmentNo} onChange={e => setEnrollmentNo(e.target.value)} />
                <p className="mt-1.5 text-xs text-muted">Use the enrollment number from the customer&apos;s enrollment in the Enrollments tab.</p>
              </div>
              {/* 2. Amount + 3. Method - two-column row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold">Amount (₹) <span className="text-danger">*</span></label>
                  <Input type="number" inputMode="numeric" placeholder="e.g. 5000" value={amount} onChange={e => setAmount(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold">Method <span className="text-danger">*</span></label>
                  <Select value={method} onValueChange={setMethod} options={["CASH", "UPI", "Card", "Online", "Cheque", "Bank Transfer"]} placeholder="Select method" />
                </div>
              </div>
              {/* 4. Advance (Months) - full-width dropdown */}
              <div>
                <label className="mb-1.5 block text-xs font-bold">Advance (Months)</label>
                <Select
                  value={advance}
                  onValueChange={setAdvance}
                  options={[
                    "1 month (regular)",
                    "2 months (advance)",
                    "3 months (advance)",
                    "6 months (advance)",
                    "11 months (full)",
                  ]}
                />
              </div>
              {/* 5. Remarks - full-width text input */}
              <div>
                <label className="mb-1.5 block text-xs font-bold">Remarks</label>
                <Input placeholder="e.g. Counter cash collection — verified by manager" value={remarks} onChange={e => setRemarks(e.target.value)} />
              </div>
            </div>
            {/* Bottom actions - two buttons aligned right: Cancel secondary, Record Payment primary blue */}
            <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
              <Button size="sm" variant="outline" onClick={() => setShowManual(false)}>Cancel</Button>
              <Button
                size="sm"
                variant="default"
                disabled={saving}
                className="bg-accent hover:bg-accent-strong"
                onClick={async () => {
                  if (!enrollmentNo.trim() || !amount.trim() || !method) {
                    toast("Please fill Enrollment Number, Amount and Method");
                    return;
                  }
                  const amt = Number(amount);
                  if (Number.isNaN(amt) || amt <= 0) {
                    toast("Please enter a valid amount");
                    return;
                  }
                  const monthsCovered = parseInt(advance, 10) || undefined;
                  setSaving(true);
                  try {
                    await paymentService.recordManualPayment({
                      enrollmentNumber: enrollmentNo.trim(),
                      amount: amt,
                      method,
                      monthsCovered,
                      remarks: remarks.trim() || undefined,
                    });
                    setShowManual(false);
                    setEnrollmentNo("");
                    setAmount("");
                    setRemarks("");
                    setMethod("CASH");
                    setAdvance("1 month (regular)");
                    await loadPayments();
                    toast(`Payment of ₹${amt.toLocaleString("en-IN")} recorded for ${enrollmentNo.trim()}`);
                  } catch (err) {
                    toast(err?.message || "Payment failed");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "Recording…" : "Record Payment"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setSelected(null)} aria-label="Close" />
          <div className="relative w-full max-w-[480px] rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="font-extrabold">Payment Details — {selected.id}</h3><button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <div><span className="text-muted">Customer:</span> <span className="font-bold">{selected.customer}</span></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Amount</div><div className="font-bold">₹{selected.amount.toLocaleString()}</div></div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Paid</div><div className="font-bold">₹{selected.paid.toLocaleString()}</div></div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Outstanding</div><div className="font-bold">₹{selected.outstanding.toLocaleString()}</div></div>
                <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Method</div><div className="mt-1"><MethodBadge method={selected.method} /></div></div>
              </div>
              <div className="flex gap-2"><Badge tone={TONE[selected.status] || "neutral"}>{selected.status}</Badge><span className="text-xs text-muted self-center">{selected.date}</span></div>
            </div>
            <div className="border-t border-line p-4 flex justify-end"><Button size="sm" variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}