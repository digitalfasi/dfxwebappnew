import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Badge } from "@/_shared/ui/badge";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { paymentService } from "@/modules/payments/paymentService";
import { billingService } from "@/modules/billing/billingService";
import { enrollmentService } from "@/modules/plan/enrollment/enrollmentService";
import { dueSchedule, fmtDueDate, fmtMissedDates } from "@/modules/plan/scheme/schemeDue";
import { isWalletScheme, NOT_APPLICABLE } from "@/modules/plan/scheme/schemeCapabilities";
import BusinessManualPaymentModal from "@/modules/payments/components/BusinessManualPaymentModal";
import SchemeManualPaymentModal from "@/modules/payments/components/SchemeManualPaymentModal";

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
/** enrollmentService row -> the Scheme payment table row shape. Scheme tab is
 *  enrollment-centric (not per-transaction): Total Amount = maturity, Paid =
 *  total_paid, plus backend-derived overdue. Method blank, Date = joined date. */
function mapSchemeRow(e) {
  return {
    id: e.id,
    paymentId: e.id,
    enrollment: e.enrollment,
    customer: e.customer,
    mobile: "",
    scheme: e.scheme,
    amount: e.maturityAmount || 0,
    paid: e.totalPaid || 0,
    outstanding: e.outstanding ?? 0,
    overdueDays: e.overdueDays || 0,
    overdueAmount: e.overdueAmount || 0,
    monthsPaid: e.paid || 0,
    monthsTotal: e.total || 0,
    installment: e.installment || 0,
    nextDue: e.nextDue || null,
    schemeType: e.schemeType || null,
    status: e.status,
    method: "",
    date: fmtSaleDate(e.joined),
    joinedIso: e.joined || null,
    time: "",
    ts: e.joined || null,
    kind: "scheme",
  };
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
    ts: s.saleTimestamp || null,
  };
}

// Business KPI period buttons -> backend dashboard-summary named periods
// (verified in billing_service._resolve_period_range). "Custom" uses
// date_from/date_to instead of a named period.
const UI_PERIOD_TO_BACKEND = {
  Today: "today",
  "This Week": "this_week",
  "This Month": "this_month",
  "Last Month": "last_month",
};

// Fallback KPI sublabel before the backend selected_period_label arrives.
function periodPfxNote(f) {
  return f === "Custom" ? "Custom" : f;
}

// [start,end] Date window for the selected period button, so the TABLE filters
// on the same period as the KPI cards (client-side; KPI stays backend-driven).
// null = no date constraint (Custom awaiting both dates).
function periodRange(dateFilter, bizRange) {
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (dateFilter === "Custom") {
    if (!bizRange.from || !bizRange.to) return null;
    return [new Date(`${bizRange.from}T00:00:00`), new Date(`${bizRange.to}T23:59:59`)];
  }
  if (dateFilter === "Today") { const s = startOfDay(now); return [s, new Date(s.getTime() + 86400000 - 1)]; }
  if (dateFilter === "This Week") { const day = (now.getDay() + 6) % 7; const s = startOfDay(now); s.setDate(s.getDate() - day); return [s, now]; }
  if (dateFilter === "This Month") { return [new Date(now.getFullYear(), now.getMonth(), 1), now]; }
  if (dateFilter === "Last Month") { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); return [s, new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, -1)]; }
  return null;
}

// Status-filter match against a row. Business: "Outstanding" = anything still
// owed. Scheme: "Overdue" = has an overdue amount (missed installments).
// SUCCESS/Paid = settled (Paid/SUCCESS/Completed); else case-insensitive equal.
function statusMatch(filter, r) {
  if (filter === "All") return true;
  const s = String(r.status || "").toLowerCase();
  if (filter === "Overdue") return (r.overdueAmount || 0) > 0;
  if (filter === "Outstanding") return (r.outstanding || 0) > 0;
  if (filter === "Paid" || filter === "SUCCESS") return s === "paid" || s === "success" || s === "completed";
  if (filter === "Pending") return s === "pending";
  return s === filter.toLowerCase();
}

// Status-filter options differ per tab: business tracks Outstanding, scheme
// tracks Overdue (the key metric the user acts on for each).
// "Paid" and the scheme term "SUCCESS" mean the same settled state, so the
// business tab lists "Paid" only (no duplicate option).
const BUSINESS_STATUS_FILTERS = ["All", "Paid", "Pending", "Outstanding"];
const SCHEME_STATUS_FILTERS = ["All", "Overdue", "Active", "Closed"];
// The scheme PAYMENT ledger filters on transaction status, not enrollment state.
const SCHEME_PAYMENT_STATUS_FILTERS = ["All", "SUCCESS", "Pending"];
const TONE = { SUCCESS: "success", Paid: "success", Completed: "success", Partial: "warning", Pending: "info", Outstanding: "danger", Failed: "danger", Active: "success", Cancelled: "neutral", Closed: "neutral", Redeemed: "info" };

// GET /payments returns the backend enum (CASH, BANK_TRANSFER, …); map it to the
// MethodBadge label so the ledger shows the same styled pill as the business tab.
const METHOD_LABEL = { CASH: "Cash", CARD: "Card", UPI: "UPI", BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", ONLINE: "Online" };

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
  // Business and Scheme are INDEPENDENT views. Each keeps its OWN search,
  // status, period and custom range — changing a filter on one tab must never
  // change the other. (They used to share one set of filter state, which is why
  // picking Custom on Scheme also switched Business to Custom.)
  const NEW_FILTERS = { search: "", status: "All", dateFilter: "Today", range: { from: "", to: "" } };
  const [filters, setFilters] = useState({ business: { ...NEW_FILTERS }, scheme: { ...NEW_FILTERS } });
  const f = filters[tab];
  const patch = (p) => setFilters((prev) => ({ ...prev, [tab]: { ...prev[tab], ...p } }));
  const [selected, setSelected] = useState(null);
  const [showManual, setShowManual] = useState(false); // scheme manual payment
  const [showBizManual, setShowBizManual] = useState(false); // business sale payment
  const [bizClear, setBizClear] = useState(null); // row-level clear-outstanding pre-fill
  const [schemeClear, setSchemeClear] = useState(null); // row-level clear-overdue pre-fill
  const [schemeRows, setSchemeRows] = useState([]);
  const [schemePayments, setSchemePayments] = useState([]);
  const [businessRows, setBusinessRows] = useState([]);
  // Backend-authoritative TOTAL outstanding across ALL sales (not just the loaded
  // page). listSales caps rows at limit=100, so summing loaded rows would
  // undercount; the response's total_outstanding is the true figure.
  const [bizOutstandingTotal, setBizOutstandingTotal] = useState(0);
  // Scheme tab has two sub-views: the real payment ledger (per-transaction, from
  // GET /payments — this is what "history" means) and the enrollment/overdue view
  // (one row per enrollment, for collections + Clear Overdue). Default to the
  // ledger so a recorded payment is visible immediately.
  const [schemeView, setSchemeView] = useState("payments");
  // Backend-authoritative business money-in collection KPI (Offline/Online/
  // Other/Total from /billing/dashboard-summary). Never derived from rows.
  const [bizKpi, setBizKpi] = useState(null);
  const [bizKpiLoading, setBizKpiLoading] = useState(false);
  const [bizKpiError, setBizKpiError] = useState("");
  // Backend-authoritative scheme money-in collection KPI (Offline/Online/Other/
  // Total from /payments/summary). Never derived from rows.
  const [schemeKpi, setSchemeKpi] = useState(null);
  const [schemeKpiLoading, setSchemeKpiLoading] = useState(false);
  const [schemeKpiError, setSchemeKpiError] = useState("");
  const [kpiTick, setKpiTick] = useState(0); // bump to force a KPI refresh (e.g. after recording)
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");

  const loadPayments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [scheme, payments, businessResp] = await Promise.all([
        enrollmentService.getEnrollments().then((rows) => rows.map(mapSchemeRow)),
        paymentService.getSchemePayments(),
        billingService.listSales(),
      ]);
      setSchemeRows(scheme);
      setSchemePayments(payments);
      setBusinessRows(businessResp.sales.map(mapBusinessRow));
      setBizOutstandingTotal(businessResp.totalOutstanding || 0);
    } catch (err) {
      setLoadError(err?.message || "Could not load payments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  // Business KPI period follows the date-filter buttons (named period) or the
  // Custom from/to range. Own effect (not the row loader) so changing period
  // refetches ONLY the KPI, never the payment rows. Fetches only on the
  // business tab; a stale-response guard drops out-of-order replies.
  const kpiReq = useRef("");
  const bizFilters = filters.business;
  useEffect(() => {
    if (tab !== "business") return;
    const isCustom = bizFilters.dateFilter === "Custom";
    const opts = isCustom
      ? (bizFilters.range.from && bizFilters.range.to ? { dateFrom: bizFilters.range.from, dateTo: bizFilters.range.to } : null)
      : { period: UI_PERIOD_TO_BACKEND[bizFilters.dateFilter] || "today" };
    if (!opts) { setBizKpi(null); setBizKpiError(""); return; } // Custom awaiting both dates
    const key = JSON.stringify(opts);
    kpiReq.current = key;
    setBizKpiLoading(true);
    setBizKpiError("");
    billingService.getBusinessCollectionSummary(opts)
      .then((k) => { if (kpiReq.current === key) setBizKpi(k); })
      .catch((e) => { if (kpiReq.current === key) { setBizKpi(null); setBizKpiError(e?.message || "Could not load collection summary"); } })
      .finally(() => { if (kpiReq.current === key) setBizKpiLoading(false); });
  }, [tab, bizFilters.dateFilter, bizFilters.range.from, bizFilters.range.to, kpiTick]);

  // Scheme KPI period follows the SAME date-filter control. Own effect, fetches
  // only on the scheme tab, backend-authoritative (/payments/summary). Mirrors
  // the business KPI pattern; a stale-response guard drops out-of-order replies.
  const schemeKpiReq = useRef("");
  const schemeFilters = filters.scheme;
  useEffect(() => {
    if (tab !== "scheme") return;
    const isCustom = schemeFilters.dateFilter === "Custom";
    const opts = isCustom
      ? (schemeFilters.range.from && schemeFilters.range.to ? { dateFrom: schemeFilters.range.from, dateTo: schemeFilters.range.to } : null)
      : { period: UI_PERIOD_TO_BACKEND[schemeFilters.dateFilter] || "today" };
    if (!opts) { setSchemeKpi(null); setSchemeKpiError(""); return; } // Custom awaiting both dates
    const key = JSON.stringify(opts);
    schemeKpiReq.current = key;
    setSchemeKpiLoading(true);
    setSchemeKpiError("");
    paymentService.getSchemePaymentSummary(opts)
      .then((k) => { if (schemeKpiReq.current === key) setSchemeKpi(k); })
      .catch((e) => { if (schemeKpiReq.current === key) { setSchemeKpi(null); setSchemeKpiError(e?.message || "Could not load collection summary"); } })
      .finally(() => { if (schemeKpiReq.current === key) setSchemeKpiLoading(false); });
  }, [tab, schemeFilters.dateFilter, schemeFilters.range.from, schemeFilters.range.to, kpiTick]);

  const schemeSource = schemeView === "payments" ? schemePayments : schemeRows;
  const source = tab === "business" ? businessRows : schemeSource;
  // The enrollment/overdue view is current-state (one row per enrollment), not a
  // dated transaction list, so the period buttons must NOT filter it — filtering
  // by join date would hide every enrollment on "Today". Period applies to the
  // business tab and the scheme PAYMENT ledger only.
  const dateFilterActive = !(tab === "scheme" && schemeView === "enrollments");
  // Search placeholder names only the fields actually searchable in the current
  // view (scheme rows have no mobile; enrollments have no payment ref).
  const searchPlaceholder = tab === "business"
    ? "Search by customer or invoice…"
    : (schemeView === "payments" ? "Search by customer, enrollment or payment ref…" : "Search by customer, enrollment or scheme…");

  // Live table filtering: search + status dropdown + the SAME period buttons the
  // KPI uses. All applied to the rows directly (no separate Apply step), so the
  // table and the KPI cards always agree.
  // Custom period with an incomplete From/To constrains nothing, so showing the
  // full list would falsely read as "all results for your custom range".
  const customPending = dateFilterActive && f.dateFilter === "Custom" && (!f.range.from || !f.range.to);

  const rows = useMemo(() => {
    if (customPending) return [];
    const q = f.search.trim().toLowerCase();
    const range = dateFilterActive ? periodRange(f.dateFilter, f.range) : null;
    return source.filter(r => {
      const mSearch = !q || r.customer.toLowerCase().includes(q) || (r.id && r.id.toLowerCase().includes(q)) || (r.enrollment && r.enrollment.toLowerCase().includes(q)) || (r.mobile && r.mobile.includes(q)) || (r.scheme && r.scheme.toLowerCase().includes(q));
      const mStatus = statusMatch(f.status, r);
      let mDate = true;
      if (range && r.ts) { const t = new Date(r.ts); mDate = t >= range[0] && t <= range[1]; }
      return mSearch && mStatus && mDate;
    });
  }, [source, f.search, f.status, f.dateFilter, f.range, customPending, dateFilterActive]);

  // Live balances for the added KPI cards (spec Point 15): Business = total
  // Outstanding across sales; Scheme = total Overdue Amount across enrollments.
  // Scheme enrollment list is unpaginated, so summing overdueAmount over all
  // loaded rows is the true total. (Business Outstanding uses the backend
  // total_outstanding instead — see bizOutstandingTotal — because sales ARE paged.)
  const schemeOverdue = useMemo(() => schemeRows.reduce((s, r) => s + (r.overdueAmount || 0), 0), [schemeRows]);

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      {/* Page title + Subtitle */}
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Payments</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-muted">Manage and view all business and scheme payments — track installments, settle dues and reconcile collections.</p>
      </div>

      {/* Top navigation / toggle */}
      <div className="flex items-center justify-between mb-4">
        <div data-motion="toolbar" className="flex items-center gap-2.5">
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Payment type</span>
          <Select
            value={tab}
            onValueChange={setTab}
            options={[{ value: "business", label: "Business Payment" }, { value: "scheme", label: "Scheme Payment" }]}
            variant="accent"
            className="w-52"
          />
        </div>
        {/* Primary action — Record Manual Payment on upper-right, blue filled with plus */}
        <Button size="sm" variant="default" onClick={() => (tab === "business" ? setShowBizManual(true) : setShowManual(true))} className="bg-accent hover:bg-accent-strong">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg> Record Manual Payment
        </Button>
      </div>

      {/* Search & filters — horizontal filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder={searchPlaceholder} value={f.search} onChange={e => patch({ search: e.target.value })} className="min-w-[260px] flex-1" />
        <Select value={f.status} onValueChange={(v) => patch({ status: v })} options={tab === "business" ? BUSINESS_STATUS_FILTERS : (schemeView === "payments" ? SCHEME_PAYMENT_STATUS_FILTERS : SCHEME_STATUS_FILTERS)} variant="accent" className="w-40" />
        {/* Date filters: Today / This Week / This Month / Last Month / Custom.
            Scoped to the selected Payment type only. Hidden in the scheme
            Enrollments view — that view is current-state (not a dated list), so a
            period button there would filter nothing and only mislead. */}
        {dateFilterActive && (
        <div className="flex flex-wrap items-center gap-1.5">
          {["Today", "This Week", "This Month", "Last Month", "Custom"].map(p => (
            <button
              key={p}
              onClick={() => patch({ dateFilter: p })}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${f.dateFilter === p ? "border-accent bg-accent text-white shadow-sm" : "border-line bg-surface text-muted hover:border-accent-line hover:text-ink"}`}
            >
              {p}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={() => patch({ ...NEW_FILTERS })}>Clear</Button>
        </div>
        )}
      </div>

      {/* Custom range — scoped to the selected Payment type only. Feeds
          date_from/date_to to that tab's backend summary AND its table filter. */}
      {dateFilterActive && f.dateFilter === "Custom" && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">From
            <input type="date" value={f.range.from} max={f.range.to || undefined} onChange={e => patch({ range: { ...f.range, from: e.target.value } })} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink" />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-muted">To
            <input type="date" value={f.range.to} min={f.range.from || undefined} onChange={e => patch({ range: { ...f.range, to: e.target.value } })} className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs font-semibold text-ink" />
          </label>
          {customPending && <span className="text-xs font-semibold text-muted">Pick both dates to load collection.</span>}
        </div>
      )}

      {/* Summary cards — backend-authoritative money-in collection for BOTH
          tabs (Offline/Online/Other/Total), never reduced from payment rows.
          Business: /billing/dashboard-summary. Scheme: /payments/summary. */}
      {tab === "business" ? (
        <div className="mb-4" data-motion="stat">
          {bizKpiError && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-danger-line bg-danger-soft/40 px-3 py-2 text-xs font-semibold text-danger">
              <span>Couldn’t load collection summary: {bizKpiError}</span>
              <button onClick={() => setKpiTick(t => t + 1)} className="font-bold underline">Retry</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(() => {
              const note = bizKpiLoading ? "Loading…" : (bizKpi?.label || periodPfxNote(bizFilters.dateFilter));
              return (
                <>
                  <Card className="p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Offline (Cash)</div>
                    <div className="num mt-1 text-2xl font-extrabold">₹{(bizKpi?.offline ?? 0).toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-muted">{note} · CASH</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Online</div>
                    <div className="num mt-1 text-2xl font-extrabold text-emerald-700">₹{(bizKpi?.online ?? 0).toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-emerald-700/70">{note} · UPI + Card + Bank</div>
                  </Card>
                  <Card className="p-4 border-danger-line bg-danger-soft/30">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-danger">Outstanding</div>
                    <div className="num mt-1 text-2xl font-extrabold text-danger">₹{bizOutstandingTotal.toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-danger/70">Uncollected · all sales</div>
                  </Card>
                  <Card className="p-4 border-accent-line bg-accent-soft/40">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-accent">Total Collected</div>
                    <div className="num mt-1 text-2xl font-extrabold text-accent">₹{(bizKpi?.total ?? 0).toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-accent/70">{note} · money in (excl. scheme &amp; refunds)</div>
                  </Card>
                </>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="mb-4" data-motion="stat">
          {schemeKpiError && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-danger-line bg-danger-soft/40 px-3 py-2 text-xs font-semibold text-danger">
              <span>Couldn’t load collection summary: {schemeKpiError}</span>
              <button onClick={() => setKpiTick(t => t + 1)} className="font-bold underline">Retry</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(() => {
              const note = schemeKpiLoading ? "Loading…" : (schemeKpi?.label || periodPfxNote(schemeFilters.dateFilter));
              return (
                <>
                  <Card className="p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Offline (Cash)</div>
                    <div className="num mt-1 text-2xl font-extrabold">₹{(schemeKpi?.offline ?? 0).toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-muted">{note} · CASH</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Online</div>
                    <div className="num mt-1 text-2xl font-extrabold text-emerald-700">₹{(schemeKpi?.online ?? 0).toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-emerald-700/70">{note} · UPI + Card + Bank</div>
                  </Card>
                  <Card className="p-4 border-danger-line bg-danger-soft/30">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-danger">Overdue Amount</div>
                    <div className="num mt-1 text-2xl font-extrabold text-danger">₹{schemeOverdue.toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-danger/70">Overdue installments · all enrollments</div>
                  </Card>
                  <Card className="p-4 border-accent-line bg-accent-soft/40">
                    <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-accent">Total Collection</div>
                    <div className="num mt-1 text-2xl font-extrabold text-accent">₹{(schemeKpi?.total ?? 0).toLocaleString("en-IN")}</div>
                    <div className="mt-1 text-xs font-semibold text-accent/70">{note} · scheme money in (excl. refunds)</div>
                  </Card>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Payment history table */}
      <Card data-motion="reveal" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3.5">
          <h3 className="text-sm font-extrabold tracking-tight">
            {tab === "business"
              ? "Business Payment History"
              : (schemeView === "payments" ? "Scheme Payment History" : "Scheme Enrollments · Overdue")}
          </h3>
          {tab === "scheme" && (
            <div className="inline-flex rounded-xl border border-line bg-canvas/50 p-0.5">
              {[{ v: "payments", l: "Payments" }, { v: "enrollments", l: "Enrollments" }].map((o) => (
                <button
                  key={o.v}
                  onClick={() => { setSchemeView(o.v); patch({ status: "All" }); }}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-colors ${schemeView === o.v ? "bg-accent text-white shadow-sm" : "text-muted hover:text-ink"}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          )}
        </div>
        <CardContent className="auto-fade-scroll overflow-x-auto px-0 pb-0">
          {tab === "business" ? (
            /* Business Payments — spec column order:
               Invoice, Customer, Date, Method, Total Amount, Paid, Outstanding,
               Status, Clear Outstanding, View. */
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-3">
                  <th className="!pl-6">Invoice</th><th>Customer Name</th><th>Date</th><th>Method</th>
                  <th className="text-right">Total Amount</th><th className="text-right">Paid</th><th className="text-right">Outstanding</th>
                  <th>Status</th><th className="text-center">Clear Outstanding</th><th className="!pr-6 text-right">View</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line-soft align-middle last:border-0 hover:bg-canvas/60 transition-colors [&>td]:px-3 [&>td]:py-3.5">
                    <td className="!pl-6 font-mono text-xs font-semibold">{r.id}</td>
                    <td className="font-bold">{r.customer}</td>
                    <td className="whitespace-nowrap">
                      <div className="font-medium text-ink">{r.date}</div>
                      <div className="text-xs text-muted">{r.time}</div>
                    </td>
                    <td><MethodBadge method={r.method} /></td>
                    <td className="num whitespace-nowrap text-right font-bold">₹{r.amount.toLocaleString("en-IN")}</td>
                    <td className="num whitespace-nowrap text-right">₹{r.paid.toLocaleString("en-IN")}</td>
                    <td className={`num whitespace-nowrap text-right font-semibold ${r.outstanding > 0 ? "text-danger" : "text-muted"}`}>₹{r.outstanding.toLocaleString("en-IN")}</td>
                    <td><Badge tone={TONE[r.status] || "success"}>{r.status}</Badge></td>
                    <td className="text-center">
                      {r.outstanding > 0 ? (
                        <button onClick={() => setBizClear({ saleId: r.paymentId, inv: r.id, customerName: r.customer })} className="rounded-lg border border-danger-line bg-danger-soft/40 px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger-soft">Clear</button>
                      ) : <span className="text-xs font-semibold text-muted">—</span>}
                    </td>
                    <td className="!pr-6 text-right">
                      <button onClick={() => setSelected(r)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent ml-auto" aria-label={`View ${r.id}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : schemeView === "enrollments" ? (
            /* Scheme Enrollments (overdue/collection view) — spec column order:
               Enrollment Number, Customer, Date, Scheme, Method, Total Amount,
               Paid, Overdue Days, Overdue Amount, Status, Clear Overdue, View. */
            /* table-fixed with a width per column. Without it, w-full spread
                every spare pixel across the columns by content, which is what
                pushed the right-hand columns out of reach and left gaps in the
                middle. Headers wrap to two lines rather than forcing a column
                wider than its data needs, and the widths total the same 1240px
                the table already asked for - this is a distribution fix, not a
                wider table. Alignment follows one rule per column: identifiers
                and text left, money and counts right, Status / Clear Overdue /
                View centred, so every placeholder dash sits where its column
                says it should. */
            <table className="w-full min-w-[1240px] table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left align-bottom text-[11px] font-bold uppercase tracking-[0.06em] text-muted [&>th]:px-3 [&>th]:py-3 [&>th]:leading-tight">
                  <th className="!pl-6 w-[164px]">Enrollment<br />Number</th><th className="w-[116px]">Customer Name</th><th className="w-[116px]">Joined</th><th className="w-[108px]">Scheme</th><th className="w-[84px]">Method</th>
                  <th className="w-[104px] text-right">Total Amount</th><th className="w-[96px] text-right">Paid</th><th className="w-[92px] text-right">Overdue Days</th><th className="w-[108px] text-right">Overdue Amount</th>
                  <th className="w-[92px] text-center">Status</th><th className="w-[96px] text-center">Clear Overdue</th><th className="!pr-6 w-[64px] text-center">View</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.paymentId || r.id} className="border-b border-line-soft align-middle last:border-0 hover:bg-canvas/60 transition-colors [&>td]:px-3 [&>td]:py-3.5">
                    <td className="!pl-6 font-mono text-xs font-semibold">{r.enrollment}</td>
                    <td className="font-bold">{r.customer}</td>
                    <td className="whitespace-nowrap">
                      <div className="font-medium text-ink">{r.date}</div>
                      <div className="text-xs text-muted">{r.time}</div>
                    </td>
                    <td className="text-xs font-semibold text-ink-soft">{r.scheme}</td>
                    <td className="text-muted">{r.method ? <MethodBadge method={r.method} /> : NOT_APPLICABLE}</td>
                    {/* FDG-001. A wallet has no maturity, so there is no total
                        amount to reach. The stored figure is untouched — it is
                        simply not a fact about this kind of scheme. */}
                    <td className="num whitespace-nowrap text-right font-bold">{isWalletScheme(r.schemeType) ? <span className="font-semibold text-muted">{NOT_APPLICABLE}</span> : `₹${r.amount.toLocaleString("en-IN")}`}</td>
                    <td className="num whitespace-nowrap text-right">₹{r.paid.toLocaleString("en-IN")}</td>
                    <td className={`num whitespace-nowrap text-right font-semibold ${r.overdueDays > 0 ? "text-danger" : "text-muted"}`}>{r.overdueDays > 0 ? `${r.overdueDays} d` : NOT_APPLICABLE}</td>
                    <td className={`num whitespace-nowrap text-right font-semibold ${r.overdueAmount > 0 ? "text-danger" : "text-muted"}`}>₹{(r.overdueAmount || 0).toLocaleString("en-IN")}</td>
                    <td className="text-center"><Badge tone={TONE[r.status] || "success"}>{r.status}</Badge></td>
                    <td className="text-center">
                      {r.overdueAmount > 0 ? (
                        <button onClick={() => setSchemeClear({ enrollmentId: r.id, enrollment: r.enrollment, scheme: r.scheme, customerName: r.customer })} className="rounded-lg border border-danger-line bg-danger-soft/40 px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:bg-danger-soft">Clear</button>
                      ) : <span className="text-xs font-semibold text-muted">{NOT_APPLICABLE}</span>}
                    </td>
                    <td className="!pr-6 text-center">
                      <button onClick={() => setSelected(r)} className="mx-auto grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent" aria-label={`View ${r.id}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Scheme Payment Ledger — actual transactions from GET /payments:
               Payment Ref, Customer, Enrollment, Scheme, Date, Method, Amount,
               Status, View. This is where a recorded payment appears, and the
               period buttons filter on the real transaction date. */
            <table className="w-full min-w-[1040px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted [&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-3">
                  <th className="!pl-6">Payment Ref</th><th>Customer Name</th><th>Enrollment</th><th>Scheme</th><th>Date</th><th>Method</th>
                  <th className="text-right">Amount</th><th className="!pr-6">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.paymentId || r.id} className="border-b border-line-soft align-middle last:border-0 hover:bg-canvas/60 transition-colors [&>td]:px-3 [&>td]:py-3.5">
                    <td className="!pl-6 font-mono text-xs font-semibold">{r.id}</td>
                    <td className="font-bold">{r.customer}</td>
                    <td className="font-mono text-xs text-ink-soft">{r.enrollment}</td>
                    <td className="text-xs font-semibold text-ink-soft">{r.scheme}</td>
                    <td className="whitespace-nowrap font-medium text-ink">{r.date}</td>
                    <td><MethodBadge method={METHOD_LABEL[r.method] || r.method} /></td>
                    <td className="whitespace-nowrap text-right">
                      <div className="num font-bold">₹{r.amount.toLocaleString("en-IN")}</div>
                      <div className="text-xs font-semibold text-muted">{r.monthsCovered} {r.monthsCovered === 1 ? "installment" : "installments"}</div>
                    </td>
                    <td className="!pr-6"><Badge tone={r.status === "PENDING" ? "warning" : (TONE[r.status] || "success")}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
              <div className="font-bold">{customPending ? "Select a date range" : "No payments found"}</div>
              <p className="mt-1 text-sm text-muted">
                {customPending
                  ? "Pick both From and To dates above to load this custom range."
                  : (tab === "business" ? "No business payments recorded yet." : "Try adjusting search, status or date filters.")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="mt-3 text-xs font-semibold text-muted">Showing {rows.length} of {source.length} payments</div>

      {showManual && (
        <SchemeManualPaymentModal
          onClose={() => setShowManual(false)}
          onRecorded={() => { loadPayments(); setKpiTick(t => t + 1); }}
        />
      )}

      {schemeClear && (
        <SchemeManualPaymentModal
          initial={schemeClear}
          onClose={() => setSchemeClear(null)}
          onRecorded={() => { loadPayments(); setKpiTick(t => t + 1); }}
        />
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setSelected(null)} aria-label="Close" />
          <div className="relative w-full max-w-[480px] rounded-2xl border border-line bg-white shadow-2xl">
            {selected.kind === "scheme" ? (
              /* Scheme enrollment — installment + overdue context, not a single txn. */
              <>
                <div className="flex items-start justify-between border-b border-line px-6 py-4">
                  <div>
                    <h3 className="font-extrabold">Scheme Enrollment</h3>
                    <p className="mt-0.5 font-mono text-xs text-muted">{selected.enrollment}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
                </div>
                <div className="px-6 py-5 space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div><span className="text-muted">Customer:</span> <span className="font-bold">{selected.customer}</span></div>
                    <Badge tone={TONE[selected.status] || "neutral"}>{selected.status}</Badge>
                  </div>
                  <div className="text-xs font-semibold text-muted">{selected.scheme} · joined {selected.date}</div>
                  {/* FDG-003. A wallet has no maturity to reach and no balance
                      left to it, and its instalment amount is a fiction — the
                      customer pays what he likes. Those cards are not shown for
                      it; the count stays, without a per-month figure. */}
                  <div className="grid grid-cols-2 gap-3">
                    {!isWalletScheme(selected.schemeType) && (
                      <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Maturity amount</div><div className="num font-bold">₹{selected.amount.toLocaleString("en-IN")}</div></div>
                    )}
                    <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Total paid</div><div className="num font-bold">₹{selected.paid.toLocaleString("en-IN")}</div></div>
                    {!isWalletScheme(selected.schemeType) && (
                      <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Balance to maturity</div><div className="num font-bold">₹{(selected.outstanding || 0).toLocaleString("en-IN")}</div></div>
                    )}
                    <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Installments</div><div className="num font-bold">{selected.monthsPaid}/{selected.monthsTotal}{isWalletScheme(selected.schemeType) ? "" : ` · ₹${selected.installment.toLocaleString("en-IN")}/mo`}</div></div>
                  </div>
                  {(() => {
                    // next_due_date from the backend is the OLDEST UNPAID installment,
                    // so it sits in the past once payments are missed. Show it as such
                    // and derive the real next upcoming due date.
                    const sched = dueSchedule(selected.nextDue, selected.installment, Math.max(0, (selected.monthsTotal || 0) - (selected.monthsPaid || 0)));
                    if (selected.overdueAmount > 0 || sched.missedCount > 0) {
                      return (
                        <div className="rounded-xl border border-danger-line bg-danger-soft/30 p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wide text-danger">Overdue</span>
                            <span className="num text-lg font-extrabold text-danger">₹{(selected.overdueAmount || sched.missedAmount).toLocaleString("en-IN")}</span>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs font-semibold text-danger/90">
                            <div className="flex justify-between gap-3">
                              <span>Installments missed</span>
                              <span className="num">{sched.missedCount} × ₹{(selected.installment || 0).toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="shrink-0">Missed dates</span>
                              <span className="text-right">{fmtMissedDates(sched.missedDates)}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span>Overdue since</span>
                              <span>{fmtDueDate(sched.oldestUnpaid)} — {sched.daysOverdue} days</span>
                            </div>
                            {sched.nextUpcoming && (
                              <div className="flex justify-between gap-3 text-ink-soft">
                                <span>Next installment due</span>
                                <span>{fmtDueDate(sched.nextUpcoming)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-xl border border-line bg-canvas/40 p-3 text-xs font-semibold text-muted">
                        No overdue installments{sched.nextUpcoming ? ` · next due ${fmtDueDate(sched.nextUpcoming)}` : ""}
                      </div>
                    );
                  })()}
                </div>
                {/* FDG-003. The bottom Close goes for a wallet — the top-right
                    X is the way out. The bar itself is dropped when it would be
                    left empty, rather than leaving a bare strip under the card. */}
                {(!isWalletScheme(selected.schemeType) || selected.overdueAmount > 0) && (
                  <div className="flex items-center justify-between border-t border-line p-4">
                    {selected.overdueAmount > 0 ? (
                      <Button size="sm" onClick={() => { setSchemeClear({ enrollmentId: selected.id, enrollment: selected.enrollment, scheme: selected.scheme, customerName: selected.customer }); setSelected(null); }}>Clear overdue</Button>
                    ) : <span />}
                    {!isWalletScheme(selected.schemeType) && (
                      <Button size="sm" variant="outline" onClick={() => setSelected(null)}>Close</Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Business sale payment. */
              <>
                <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="font-extrabold">Payment Details — {selected.id}</h3><button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
                <div className="px-6 py-5 space-y-3 text-sm">
                  <div><span className="text-muted">Customer:</span> <span className="font-bold">{selected.customer}</span></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Amount</div><div className="font-bold">₹{selected.amount.toLocaleString()}</div></div>
                    <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Paid</div><div className="font-bold">₹{selected.paid.toLocaleString()}</div></div>
                    <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Outstanding</div><div className="font-bold">₹{selected.outstanding.toLocaleString()}</div></div>
                    <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Method</div><div className="mt-1">{selected.method ? <MethodBadge method={selected.method} /> : <span className="text-sm text-muted">—</span>}</div></div>
                  </div>
                  <div className="flex gap-2"><Badge tone={TONE[selected.status] || "neutral"}>{selected.status}</Badge><span className="text-xs text-muted self-center">{selected.date}</span></div>
                </div>
                <div className="border-t border-line p-4 flex justify-end"><Button size="sm" variant="outline" onClick={() => setSelected(null)}>Close</Button></div>
              </>
            )}
          </div>
        </div>
      )}

      {showBizManual && (
        <BusinessManualPaymentModal
          onClose={() => setShowBizManual(false)}
          onRecorded={() => { loadPayments(); setKpiTick(t => t + 1); }}
        />
      )}

      {bizClear && (
        <BusinessManualPaymentModal
          initial={bizClear}
          onClose={() => setBizClear(null)}
          onRecorded={() => { loadPayments(); setKpiTick(t => t + 1); }}
        />
      )}
    </div>
  );
}