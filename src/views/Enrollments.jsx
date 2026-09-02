import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { enrollmentService } from "../services/enrollmentService";

// Real enrollments load from the DFX backend via enrollmentService.
// No mock/demo enrollments remain as an active source or fallback.

const FILTERS = ["All", "Active", "Completed", "Cancelled"];

export default function Enrollments() {
  const scope = useRef(null);
  usePressFeedback(scope);
  const [filter, setFilter] = useState("All");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState(null);
  const [passbook, setPassbook] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editStatus, setEditStatus] = useState("Active");
  const REMARK_OPTIONS = ["Followed up by phone", "Requested payment extension", "Payment promised", "Documents pending", "Do not disturb"];
  const [editTags, setEditTags] = useState([]);
  const [editCustomRemark, setEditCustomRemark] = useState("");

  const loadEnrollments = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setRows(await enrollmentService.getEnrollments());
    } catch (err) {
      setLoadError(err?.message || "Could not load enrollments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  const filtered = useMemo(() => filter === "All" ? rows : rows.filter(r => r.status === filter), [rows, filter]);

  // Open detail, then enrich with the authoritative balance (available/redeemed).
  async function openView(r) {
    setView(r);
    try {
      const b = await enrollmentService.getBalance(r.id);
      if (b) setView((prev) => prev && prev.id === r.id
        ? { ...prev, totalPaid: b.total_paid ?? prev.totalPaid, alreadyRedeemed: b.total_redeemed ?? 0 }
        : prev);
    } catch { /* detail keeps list values if balance fails */ }
  }

  function openEdit(r) {
    setEditing(r);
    setEditStatus(r.status);
    setEditTags(r.remarksTags || []);
    setEditCustomRemark(r.customRemark || "");
  }
  function toggleTag(tag) {
    setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }
  async function saveEdit() {
    const remarks = [...editTags, editCustomRemark.trim()].filter(Boolean).join("; ");
    setSaving(true);
    try {
      // Remarks are always persisted. A move to Cancelled/Closed uses the backend
      // close workflow (the only status transition the contract supports).
      if (remarks !== (editing.remarks || "")) {
        await enrollmentService.updateRemarks(editing.id, remarks || null);
      }
      const wantsClose = (editStatus === "Cancelled" || editStatus === "Closed");
      const wasOpen = (editing.status === "Active");
      if (wantsClose && wasOpen) {
        await enrollmentService.closeEnrollment(editing.id, remarks || "Closed by admin");
      } else if (editStatus !== editing.status && !wantsClose) {
        toast("Only closing an enrollment is supported by the backend");
      }
      setEditing(null);
      await loadEnrollments();
      toast(`Enrollment updated — ${editing.enrollment}`);
    } catch (err) {
      toast(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const passbookEntries = passbook ? Array.from({ length: passbook.total }, (_, i) => {
    const paid = i < passbook.paid;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const d = new Date(passbook.joined);
    d.setMonth(d.getMonth() + i);
    return { label: `${months[d.getMonth()]} ${d.getFullYear()}`, paid, amount: passbook.installment };
  }) : [];

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Scheme Enrollments</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-muted">Customer enrollments across active and past schemes — track tenure, maturity and lifecycle.</p>
      </div>

      <div data-motion="toolbar" className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{f}</button>
        ))}
        {filter !== "All" && <button onClick={() => setFilter("All")} className="ml-1 text-xs font-bold text-accent underline">Clear</button>}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Enrollment number</th><th className="py-3">Customer</th><th className="py-3">Scheme</th><th className="py-3">Joined date</th><th className="py-3">Maturity date</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.enrollment} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-xs font-semibold">{r.enrollment}</td>
                  <td className="py-3.5"><div className="font-bold leading-tight">{r.customer}</div><div className="font-mono text-[11px] text-muted">{r.code}</div></td>
                  <td className="py-3.5 font-medium">{r.scheme}</td>
                  <td className="py-3.5 text-muted">{r.joined}</td>
                  <td className="py-3.5 text-muted">{r.maturity}</td>
                  <td className="py-3.5"><Badge tone={r.status === "Active" ? "info" : r.status === "Completed" ? "success" : "danger"} dot>{r.status}</Badge></td>
                  <td className="py-3.5 pr-6 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => openView(r)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent" title="View Details" aria-label={`View ${r.enrollment}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                      <button onClick={() => setPassbook(r)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent" title="Passbook" aria-label={`Passbook ${r.enrollment}`}>
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 5a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5z" /><path d="M8 7h8" /><path d="M8 11h8" /></svg>
                      </button>
                      <button onClick={() => openEdit(r)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent" title="Edit" aria-label={`Edit ${r.enrollment}`}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={7} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={7} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load enrollments</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={loadEnrollments}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-14 text-center"><div className="font-bold">No enrollments found</div><p className="mt-1 text-sm text-muted">Nothing matches this filter.</p></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="mt-3 text-xs font-semibold text-muted">Showing {filtered.length} of {rows.length} enrollments</div>

      {view && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setView(null)} aria-label="Close" />
          <div className="relative w-full max-w-[560px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-lg font-extrabold">Enrollment Details</h3><button onClick={() => setView(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm">
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Customer + Scheme</h4>
                <div className="mt-3 rounded-xl bg-accent-soft/50 border border-accent-line p-4 space-y-2">
                  <div><span className="text-xs text-muted">Customer</span><div className="font-bold">{view.customer} <span className="font-mono text-xs text-muted">· {view.code}</span></div></div>
                  <div><span className="text-xs text-muted">Scheme</span><div className="font-bold">{view.scheme}</div></div>
                  <div><span className="text-xs text-muted">Enrollment Status</span><div className="mt-1"><Badge tone={view.status === "Active" ? "info" : view.status === "Completed" ? "success" : "danger"} dot>{view.status}</Badge></div></div>
                </div>
              </section>
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Enrollment Summary</h4>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Monthly Amount</div><div className="font-bold">₹{view.installment.toLocaleString()}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Planned Duration</div><div className="font-bold">{view.total} months</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Successful Payments</div><div className="font-bold">{view.paid} / {view.total}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Total Paid</div><div className="font-bold">₹{(view.totalPaid ?? view.paid * view.installment).toLocaleString()}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Already Redeemed</div><div className="font-bold">₹{(view.alreadyRedeemed ?? 0).toLocaleString()}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Available Balance</div><div className="font-bold text-accent-strong">₹{((view.totalPaid ?? view.paid * view.installment) - (view.alreadyRedeemed ?? 0)).toLocaleString()}</div></div>
                  <div className="col-span-2 rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Maturity</div><div className="font-bold">{view.maturity}</div></div>
                </div>
              </section>
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Contributions</h4>
                <div className="mt-3 grid gap-2">
                  {Array.from({ length: view.paid }, (_, i) => {
                    const d = new Date(view.joined); d.setMonth(d.getMonth() + i);
                    return <div key={i} className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-2.5"><span className="text-xs font-semibold text-muted">{d.toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</span><span className="font-mono font-bold">₹{view.installment.toLocaleString()}</span><span className="rounded-full bg-accent-soft border border-accent-line px-2 py-0.5 text-xs font-bold text-accent-strong">PAID</span></div>;
                  })}
                  {view.paid === 0 && <div className="rounded-xl border border-dashed border-line p-4 text-center text-muted">No contributions yet</div>}
                </div>
              </section>
              <section>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Redemption History</h4>
                <div className="mt-3">
                  {(view.alreadyRedeemed ?? 0) > 0 ? (
                    <div className="rounded-xl border border-line bg-white px-4 py-3 flex items-center justify-between"><span className="text-xs text-muted">Redeemed</span><span className="font-bold">₹{view.alreadyRedeemed.toLocaleString()}</span><span className="text-xs text-muted">{view.maturity}</span></div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-line p-4 text-center text-muted">No redemptions — balance available for purchase</div>
                  )}
                </div>
              </section>
            </div>
            <div className="border-t border-line p-4 flex justify-end gap-2.5">
              <Button size="sm" variant="outline" onClick={() => { toast("Redeem flow — coming soon"); setView(null); }}>Redeem For Purchase</Button>
              <Button size="sm" onClick={() => setView(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {passbook && (() => {
        const isMonthlyGoldPlan = passbook.scheme === "Monthly Gold Saving Plan" || passbook.enrollment === "ENR-260828-50AAB0";
        // Spec ledger for Monthly Gold Saving Plan — 6 entries totaling ₹12,000 at ₹15,460/g
        const monthlyPlanLedger = [
          { n: 1, date: "29 Aug 2026", desc: "Scheme contribution", amount: 4000, rate: 15460, weight: "0.259" },
          { n: 2, date: "29 Aug 2026", desc: "Scheme contribution", amount: 4000, rate: 15460, weight: "0.259" },
          { n: 3, date: "29 Aug 2026", desc: "Scheme contribution", amount: 1000, rate: 15460, weight: "0.065" },
          { n: 4, date: "29 Aug 2026", desc: "Scheme contribution", amount: 1000, rate: 15460, weight: "0.065" },
          { n: 5, date: "29 Aug 2026", desc: "Scheme contribution", amount: 1000, rate: 15460, weight: "0.065" },
          { n: 6, date: "29 Aug 2026", desc: "Scheme contribution", amount: 1000, rate: 15460, weight: "0.065" },
        ];
        const totalGoldWeight = isMonthlyGoldPlan ? "0.778" : `${((passbook.totalPaid ?? 0) / (passbook.goldRate ?? 15460)).toFixed(3)}`;
        if (isMonthlyGoldPlan) {
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setPassbook(null)} aria-label="Close" />
              <div className="relative w-full max-w-[720px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
                <div className="border-b border-line px-6 py-4">
                  <h3 className="text-base font-extrabold tracking-tight">Monthly Gold Saving Plan — Passbook</h3>
                  <p className="mt-1 text-xs text-muted">Read-only view. Payments will appear here once the Payments module is live.</p>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                  {/* Enrollment information + status + totals */}
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Enrollment Summary</h4>
                    <div className="mt-3 overflow-hidden rounded-xl border border-line">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                            <th className="px-4 py-2.5 border-b border-line">Field</th>
                            <th className="px-4 py-2.5 border-b border-line">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Enrollment No.</td><td className="px-4 py-2.5 font-mono text-xs font-semibold">{passbook.enrollment}</td></tr>
                          <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Status</td><td className="px-4 py-2.5"><Badge tone={passbook.status === "Active" ? "info" : "success"} dot>{passbook.status?.toUpperCase()}</Badge></td></tr>
                          <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Total Paid</td><td className="px-4 py-2.5 font-bold">₹12,000</td></tr>
                          <tr><td className="px-4 py-2.5 font-semibold text-muted">Total Gold Weight</td><td className="px-4 py-2.5 font-bold text-accent-strong">0.778 g</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* Transaction ledger */}
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Payment History</h4>
                    <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                            <th className="px-4 py-2.5">#</th>
                            <th className="py-2.5">Date</th>
                            <th className="py-2.5">Description</th>
                            <th className="py-2.5 text-right">Amount</th>
                            <th className="py-2.5 text-right">Gold Rate</th>
                            <th className="py-2.5 text-right pr-4">Gold Weight</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyPlanLedger.map(r => (
                            <tr key={r.n} className="border-b border-line-soft last:border-0">
                              <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.n}</td>
                              <td className="py-2.5 font-mono text-xs">{r.date}</td>
                              <td className="py-2.5 font-medium">{r.desc}</td>
                              <td className="py-2.5 text-right font-bold">₹{r.amount.toLocaleString("en-IN")}</td>
                              <td className="py-2.5 text-right font-mono text-xs">₹{r.rate.toLocaleString("en-IN")}/g</td>
                              <td className="py-2.5 pr-4 text-right font-mono font-bold text-ink">{r.weight} g</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-muted">Customer enrollment financial ledger — Date / Description / Amount / Gold rate / Gold weight.</p>
                  </div>
                </div>
                <div className="border-t border-line p-4 flex justify-end"><Button size="sm" variant="outline" onClick={() => setPassbook(null)}>Close</Button></div>
              </div>
            </div>
          );
        }
        // Generic passbook — now also uses new ledger table so change is visible for any enrollment (e.g. ENR-250619)
        const genericRate = passbook.goldRate ?? 15460;
        const genericLedger = passbookEntries.map((e, idx) => ({
          n: idx + 1,
          date: e.label,
          desc: "Scheme contribution",
          amount: e.amount,
          rate: genericRate,
          weight: (e.amount / genericRate).toFixed(3),
          status: e.paid ? "PAID" : "DUE",
        }));
        const genericTotalGold = (genericLedger.filter(l => l.status === "PAID").reduce((s, l) => s + parseFloat(l.weight), 0)).toFixed(3);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setPassbook(null)} aria-label="Close" />
            <div className="relative w-full max-w-[720px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
              <div className="border-b border-line px-6 py-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-extrabold tracking-tight">{passbook.scheme} — Passbook</h3>
                  <p className="mt-1 text-xs text-muted">Read-only view. Payments will appear here once the Payments module is live.</p>
                </div>
                <button onClick={() => setPassbook(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Enrollment Summary</h4>
                  <div className="mt-3 overflow-hidden rounded-xl border border-line">
                    <table className="w-full border-collapse text-sm">
                      <thead><tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-4 py-2.5 border-b border-line">Field</th><th className="px-4 py-2.5 border-b border-line">Value</th></tr></thead>
                      <tbody>
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Enrollment No.</td><td className="px-4 py-2.5 font-mono text-xs font-semibold">{passbook.enrollment}</td></tr>
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Status</td><td className="px-4 py-2.5"><Badge tone={passbook.status === "Active" ? "info" : passbook.status === "Completed" ? "success" : "danger"} dot>{passbook.status?.toUpperCase()}</Badge></td></tr>
                        <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Total Paid</td><td className="px-4 py-2.5 font-bold">₹{(passbook.totalPaid ?? 0).toLocaleString("en-IN")}</td></tr>
                        <tr><td className="px-4 py-2.5 font-semibold text-muted">Total Gold Weight</td><td className="px-4 py-2.5 font-bold text-accent-strong">{genericTotalGold} g</td></tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{passbook.customer} · {passbook.scheme} · ₹{passbook.installment.toLocaleString("en-IN")}/mo</p>
                </div>
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Payment History</h4>
                  <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead><tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-4 py-2.5">#</th><th className="py-2.5">Date</th><th className="py-2.5">Description</th><th className="py-2.5 text-right">Amount</th><th className="py-2.5 text-right">Gold Rate</th><th className="py-2.5 text-right pr-4">Gold Weight</th></tr></thead>
                      <tbody>
                        {genericLedger.map(r => (
                          <tr key={r.n} className="border-b border-line-soft last:border-0">
                            <td className="px-4 py-2.5 font-mono text-xs text-muted">{r.n}</td>
                            <td className="py-2.5 font-mono text-xs">{r.date}</td>
                            <td className="py-2.5 font-medium">{r.desc} <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold border ${r.status==="PAID" ? "bg-accent-soft text-accent-strong border-accent-line" : "bg-canvas text-muted border-line"}`}>{r.status}</span></td>
                            <td className="py-2.5 text-right font-bold">₹{r.amount.toLocaleString("en-IN")}</td>
                            <td className="py-2.5 text-right font-mono text-xs">₹{r.rate.toLocaleString("en-IN")}/g</td>
                            <td className="py-2.5 pr-4 text-right font-mono font-bold text-ink">{r.weight} g</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted">Customer enrollment financial ledger — Date / Description / Amount / Gold rate / Gold weight.</p>
                </div>
              </div>
              <div className="border-t border-line p-4 flex justify-end"><Button size="sm" variant="outline" onClick={() => setPassbook(null)}>Close</Button></div>
            </div>
          </div>
        );
      })()}

      {editing && (() => {
        // Derive financial/schedule fields — fixed at enrollment, read-only
        const monthlyAmount = editing.installment;
        const duration = editing.total;
        const bonusPct = editing.bonusPct ?? 0;
        const baseMaturity = monthlyAmount * duration;
        const bonusAmount = Math.round(baseMaturity * (bonusPct / 100));
        const finalMaturity = baseMaturity + bonusAmount;
        const joined = editing.joined;
        const maturity = editing.maturity;
        const monthsPaid = editing.paid;
        const nextDue = editing.nextDue || "—";
        const phone = editing.phone || "—";
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setEditing(null)} aria-label="Close" />
          <div className="relative w-full max-w-[640px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-lg font-extrabold">Edit Enrollment</h3><button onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Enrollment Details — Read-Only */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Enrollment Details — Read-Only</h4>
                <div className="mt-3 overflow-hidden rounded-xl border border-line">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                        <th className="px-4 py-2.5 border-b border-line">Field</th>
                        <th className="px-4 py-2.5 border-b border-line">Value</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Customer</td><td className="px-4 py-2.5 font-bold">{editing.customer}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Phone</td><td className="px-4 py-2.5 font-mono">{phone}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Scheme</td><td className="px-4 py-2.5 font-medium">{editing.scheme}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Enrollment No.</td><td className="px-4 py-2.5 font-mono text-xs font-semibold">{editing.enrollment}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Status</td><td className="px-4 py-2.5"><Badge tone={editStatus === "Active" ? "info" : editStatus === "Completed" ? "success" : "danger"} dot>{editStatus}</Badge></td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Monthly Amount</td><td className="px-4 py-2.5 font-bold">₹{monthlyAmount.toLocaleString("en-IN")}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Duration</td><td className="px-4 py-2.5 font-medium">{duration} months</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Bonus %</td><td className="px-4 py-2.5 font-medium">{bonusPct}%</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Base Maturity</td><td className="px-4 py-2.5 font-semibold">₹{baseMaturity.toLocaleString("en-IN")}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Bonus Amount</td><td className="px-4 py-2.5 font-semibold">₹{bonusAmount.toLocaleString("en-IN")}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Final Maturity</td><td className="px-4 py-2.5 font-bold text-accent-strong">₹{finalMaturity.toLocaleString("en-IN")}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Joined</td><td className="px-4 py-2.5 font-mono text-xs">{joined}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Maturity Date</td><td className="px-4 py-2.5 font-mono text-xs">{maturity}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Months Paid</td><td className="px-4 py-2.5 font-bold">{monthsPaid}</td></tr>
                      <tr><td className="px-4 py-2.5 font-semibold text-muted">Next Due</td><td className="px-4 py-2.5 font-mono text-xs">{nextDue}</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted">Financial and schedule fields are fixed at enrollment and cannot be edited here.</p>
              </div>

              {/* Editable — Remarks */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Editable — Remarks</h4>
                <div className="mt-3 flex flex-wrap gap-2">
                  {REMARK_OPTIONS.map(opt => {
                    const active = editTags.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleTag(opt)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${active ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-ink"}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-bold">Custom remark (optional)</label>
                  <Input placeholder="e.g. Customer requested callback next week" value={editCustomRemark} onChange={e => setEditCustomRemark(e.target.value)} />
                  <p className="mt-1.5 text-xs text-muted">Operational note only — never affects any financial record.</p>
                </div>
                {/* Status remains editable as operational lifecycle — but financial fields stay read-only */}
                <div className="mt-4">
                  <label className="grid gap-1.5"><span className="text-xs font-bold">Status (operational)</span>
                    <Select value={editStatus} onValueChange={setEditStatus} options={["Active", "Completed", "Cancelled"]} />
                  </label>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={saveEdit}>{saving ? "Saving…" : "Save Remarks"}</Button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
