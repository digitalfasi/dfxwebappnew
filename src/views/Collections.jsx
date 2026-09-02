import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { enrollmentService } from "../services/enrollmentService";
import { passbookService } from "../services/passbookService";

// Real collection status is derived from live enrollments; timeline from the
// real passbook ledger. No mock rows/KPIs/timeline remain.

const FILTERS = ["All", "On Track", "Overdue", "Completed"];

// Enrollment status label -> collection-health label the view filters on.
// "Overdue" has no backend field, so it is never fabricated here.
function collectionStatus(enrollmentStatus) {
  if (enrollmentStatus === "Active") return "On Track";
  if (enrollmentStatus === "Completed") return "Completed";
  return enrollmentStatus;
}
function fmtMonth(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  } catch { return iso; }
}

export default function Collections() {
  const scope = useRef(null);
  usePressFeedback(scope);
  const [filter, setFilter] = useState("All");
  const [period, setPeriod] = useState("This Month");
  const [timeline, setTimeline] = useState(null);
  const [timelineEntries, setTimelineEntries] = useState([]);
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const enrollments = await enrollmentService.getEnrollments();
      setAllRows(enrollments.map((e) => ({
        id: e.id,
        customer: e.customer,
        enrollment: e.enrollment,
        scheme: e.scheme,
        installment: e.installment,
        paid: e.paid,
        total: e.total,
        totalPaid: e.totalPaid,
        // Display subtraction of two authoritative figures (base maturity − paid).
        outstanding: Math.max(0, (e.maturityAmount || 0) - (e.totalPaid || 0)),
        nextDue: e.nextDue || "—",
        overdue: "—",
        status: collectionStatus(e.status),
      })));
    } catch (err) {
      setLoadError(err?.message || "Could not load collections.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const rows = useMemo(() => filter === "All" ? allRows : allRows.filter(r => r.status === filter), [allRows, filter]);

  const kpi = useMemo(() => ({
    total: allRows.length,
    onTrack: allRows.filter(r => r.status === "On Track").length,
    overdue: allRows.filter(r => r.status === "Overdue").length,
    outstanding: allRows.reduce((s, r) => s + (r.outstanding || 0), 0),
    collected: allRows.reduce((s, r) => s + (r.totalPaid || 0), 0),
  }), [allRows]);
  const overallCollections = kpi.collected;

  async function openTimeline(r) {
    setTimeline(r);
    setTimelineEntries([]);
    try {
      const pb = await passbookService.getAdminPassbook(r.id);
      setTimelineEntries((pb?.entries ?? []).map((e) => ({
        month: fmtMonth(e.entryDate),
        amount: e.amount,
        status: "PAID",
      })));
    } catch { /* keep empty timeline on failure */ }
  }

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Collections</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">Full scheme collection status per enrollment — installments paid, outstanding and overdue timeline.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadCollections}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
          Refresh
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5" data-motion="stat">
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Total Enrollments</div><div className="num mt-1 text-2xl font-extrabold text-info" style={{ textShadow: "0 0 14px rgba(59,130,246,0.35)" }}>{kpi.total}</div><div className="text-xs text-faint">All time</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">On Track</div><div className="num mt-1 text-2xl font-extrabold text-emerald-600" style={{ textShadow: "0 0 14px rgba(16,185,129,0.35)" }}>{kpi.onTrack}</div><div className="text-xs text-faint">Paying on time</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Overdue</div><div className="num mt-1 text-2xl font-extrabold text-danger" style={{ textShadow: "0 0 14px rgba(239,68,68,0.32)" }}>{kpi.overdue}</div><div className="text-xs text-faint">Needs follow-up</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Outstanding (Active)</div><div className="num mt-1 text-2xl font-extrabold" style={{ textShadow: "0 0 14px rgba(201,168,76,0.28)" }}>₹{kpi.outstanding.toLocaleString("en-IN")}</div><div className="text-xs text-faint">Active enrollments</div></Card>
        <Card className="p-4"><div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Overall Collections</div><div className="num mt-1 text-2xl font-extrabold text-ink" style={{ textShadow: "0 0 14px rgba(0,0,0,0.08)" }}>₹{overallCollections.toLocaleString("en-IN")}</div><div className="text-xs text-faint">Total collected</div></Card>
      </div>

      <div data-motion="toolbar" className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{f}</button>
          ))}
          {filter !== "All" && <button onClick={() => setFilter("All")} className="ml-1 text-xs font-bold text-accent underline">Clear</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={setPeriod} options={["This Month", "Last Month", "This Quarter", "This Year", "All Time"]} className="w-[148px]" />
          <Button variant="outline" size="sm" onClick={() => toast(`Report generated for ${period}`)}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M10 13H8" /><path d="M16 17H8" /><path d="M13 13h4" /></svg>
            Generate Report
          </Button>
          <Button variant="outline" size="sm" onClick={loadCollections}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
            Refresh
          </Button>
        </div>
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Customer</th><th className="py-3">Scheme</th><th className="py-3">Installment</th><th className="py-3">Paid</th><th className="py-3">Total Paid</th><th className="py-3">Outstanding</th><th className="py-3">Next Due</th><th className="py-3">Overdue</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Timeline</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.enrollment} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="font-bold leading-tight">{r.customer}</div>
                    <div className="font-mono text-[11px] text-muted">Enrollment: {r.enrollment}</div>
                  </td>
                  <td className="py-3.5 font-medium">{r.scheme}</td>
                  <td className="num py-3.5 font-semibold">₹{r.installment.toLocaleString()}</td>
                  <td className="num py-3.5"><span className="font-bold">{r.paid}/{r.total}</span></td>
                  <td className="num py-3.5 font-semibold">₹{r.totalPaid.toLocaleString()}</td>
                  <td className="num py-3.5 font-bold">₹{r.outstanding.toLocaleString()}</td>
                  <td className="py-3.5 text-muted">{r.nextDue}</td>
                  <td className="py-3.5"><span className={r.overdue !== "—" ? "font-bold text-danger" : "text-muted"}>{r.overdue}</span></td>
                  <td className="py-3.5"><Badge tone={r.status === "Overdue" ? "danger" : r.status === "On Track" ? "info" : "success"} dot>{r.status}</Badge></td>
                  <td className="py-3.5 pr-6 text-right">
                    <button onClick={() => openTimeline(r)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent ml-auto" aria-label={`Timeline ${r.enrollment}`}>
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={10} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={10} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load collections</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={loadCollections}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && rows.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-14 text-center"><div className="font-bold">No enrollments found</div><p className="mt-1 text-sm text-muted">Nothing matches this filter.</p></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="mt-3 text-xs font-semibold text-muted">Showing {rows.length} of {allRows.length} enrollments</div>

      {timeline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setTimeline(null)} aria-label="Close timeline" />
          <div className="relative w-full max-w-[520px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-extrabold">Customer Timeline — {timeline.customer}</h3>
              <button onClick={() => setTimeline(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid gap-1.5 text-sm">
                <div><span className="font-bold">Customer:</span> {timeline.customer}</div>
                <div><span className="font-bold">Scheme:</span> {timeline.scheme}</div>
                <div><span className="font-bold">Enrollment:</span> <span className="font-mono text-xs">{timeline.enrollment}</span></div>
              </div>
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Summary</h4>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas/40 p-4 text-sm">
                  <div><div className="text-xs text-muted">Installment</div><div className="font-bold">₹{timeline.installment.toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted">Paid</div><div className="font-bold">{timeline.paid}/{timeline.total}</div></div>
                  <div><div className="text-xs text-muted">Total Paid</div><div className="font-bold">₹{timeline.totalPaid.toLocaleString()}</div></div>
                  <div><div className="text-xs text-muted">Outstanding</div><div className="font-bold">₹{timeline.outstanding.toLocaleString()}</div></div>
                  <div className="col-span-2"><div className="text-xs text-muted">Last payment</div><div className="font-bold">—</div></div>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest">Payment Timeline</h4>
                <div className="mt-3 grid gap-2">
                  {timelineEntries.map((e, i) => (
                    <div key={i} className="grid grid-cols-3 items-center rounded-xl border border-line bg-white px-4 py-3 text-sm">
                      <span className="font-semibold text-left">{e.month}</span>
                      <span className="font-mono text-center">₹{e.amount.toLocaleString()}</span>
                      <span className={`justify-self-end rounded-full px-2.5 py-1 text-xs font-bold ${e.status === "PAID" ? "bg-accent-soft text-accent-strong border border-accent-line" : "bg-danger-soft text-danger border border-danger-line"}`}>{e.status}</span>
                    </div>
                  ))}
                  {timelineEntries.length === 0 && (
                    <div className="rounded-xl border border-dashed border-line p-4 text-center text-muted">No contributions yet</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
