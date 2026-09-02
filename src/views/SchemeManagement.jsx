import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { enrollmentService } from "../services/enrollmentService";
import { passbookService } from "../services/passbookService";
import { paymentService } from "../services/paymentService";

// Scheme Management — operational customer/enrollment module. Consolidates the
// former Enrollments + Collections screens. All figures (paid, outstanding,
// gold rate, gold weight, payment history) are backend-authoritative and read
// through the existing services. No mock data. No frontend gold valuation.

const FILTERS = ["All", "Active", "Completed", "Cancelled"];
const TABS = ["Overview", "Passbook", "Enrollment Details", "Payment / Collection History", "Remarks"];

function statusTone(s) {
  return s === "Active" ? "info" : s === "Completed" ? "success" : "danger";
}
function money(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `₹${Number(v).toLocaleString("en-IN")}`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
function grams(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(3)} g`;
}
function rate(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
  return `₹${Number(v).toLocaleString("en-IN")}/g`;
}

export default function SchemeManagement() {
  const scope = useRef(null);
  usePressFeedback(scope);
  const [filter, setFilter] = useState("All");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");

  // Manage Scheme drawer state
  const [manage, setManage] = useState(null);      // selected enrollment row
  const [tab, setTab] = useState(TABS[0]);
  const [balance, setBalance] = useState(null);     // /enrollments/{id}/balance
  const [passbook, setPassbook] = useState(null);   // /passbooks/{id}
  const [payments, setPayments] = useState([]);     // /payments filtered to enrollment
  const [detailLoading, setDetailLoading] = useState(false);
  const [remark, setRemark] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);

  const loadRows = useCallback(async () => {
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

  useEffect(() => { loadRows(); }, [loadRows]);

  const filtered = useMemo(
    () => (filter === "All" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  );

  // Outstanding is backend-authoritative (enrollment.outstanding_amount). The
  // frontend never computes it — `—` when the live backend hasn't sent it yet.
  function outstanding(r) {
    return r?.outstanding ?? null;
  }

  async function openManage(r) {
    setManage(r);
    setTab(TABS[0]);
    setBalance(null);
    setPassbook(null);
    setPayments([]);
    setRemark(r.remarks || "");
    setDetailLoading(true);
    try {
      const [bal, pb, pays] = await Promise.all([
        enrollmentService.getBalance(r.id).catch(() => null),
        passbookService.getAdminPassbook(r.id).catch(() => null),
        paymentService.getSchemePayments().catch(() => []),
      ]);
      setBalance(bal);
      setPassbook(pb);
      setPayments((pays || []).filter((p) => p.enrollment === r.enrollment));
    } finally {
      setDetailLoading(false);
    }
  }
  function closeManage() {
    setManage(null);
  }

  // Passbook rows — every gold figure is backend-authoritative. Gold Credited is
  // the ledger gold_weight; Gold Balance is the backend running_gold_weight. No
  // gold is valued or summed in the frontend.
  const passbookRows = useMemo(() => {
    const entries = (passbook?.entries ?? []).slice().sort(
      (a, b) => (a.entryNumber ?? 0) - (b.entryNumber ?? 0)
    );
    return entries.map((e) => ({
      id: e.id,
      date: fmtDate(e.entryDate),
      amount: e.amount,
      goldRate: e.goldRate,
      goldWeight: e.goldWeight,
      goldBalance: e.goldBalance,
    }));
  }, [passbook]);

  const totalPaid = balance?.total_paid ?? manage?.totalPaid ?? null;
  // Authoritative total gold balance from the passbook summary (backend).
  const goldBalance = passbook?.summary?.total_gold_weight ?? null;

  async function saveRemark() {
    if (!manage) return;
    setSavingRemark(true);
    try {
      await enrollmentService.updateRemarks(manage.id, remark.trim() || null);
      setRows((prev) => prev.map((x) => (x.id === manage.id ? { ...x, remarks: remark.trim() } : x)));
      setManage((prev) => (prev ? { ...prev, remarks: remark.trim() } : prev));
      toast(`Remarks saved — ${manage.enrollment}`);
    } catch (err) {
      toast(err?.message || "Could not save remarks");
    } finally {
      setSavingRemark(false);
    }
  }

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Scheme Management</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">Which customers are enrolled in which schemes, and the current state of each enrollment — passbook, payments and remarks in one place.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadRows}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>
          Refresh
        </Button>
      </div>

      <div data-motion="toolbar" className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{f}</button>
        ))}
        {filter !== "All" && <button onClick={() => setFilter("All")} className="ml-1 text-xs font-bold text-accent underline">Clear</button>}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Customer</th><th className="py-3">Scheme</th><th className="py-3">Enrollment #</th><th className="py-3">Joined</th><th className="py-3">Maturity</th><th className="py-3">Installment</th><th className="py-3">Paid</th><th className="py-3">Outstanding</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.enrollment} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5"><div className="font-bold leading-tight">{r.customer}</div></td>
                  <td className="py-3.5 font-medium">{r.scheme}</td>
                  <td className="py-3.5 font-mono text-xs font-semibold">{r.enrollment}</td>
                  <td className="py-3.5 text-muted">{fmtDate(r.joined)}</td>
                  <td className="py-3.5 text-muted">{fmtDate(r.maturity)}</td>
                  <td className="num py-3.5 font-semibold">{money(r.installment)}</td>
                  <td className="num py-3.5"><span className="font-bold">{r.paid}/{r.total}</span></td>
                  <td className="num py-3.5 font-bold">{money(outstanding(r))}</td>
                  <td className="py-3.5"><Badge tone={statusTone(r.status)} dot>{r.status}</Badge></td>
                  <td className="py-3.5 pr-6 text-right">
                    <Button size="sm" variant="outline" onClick={() => openManage(r)}>Manage Scheme</Button>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr><td colSpan={10} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>
              )}
              {!loading && loadError && (
                <tr><td colSpan={10} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load enrollments</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={loadRows}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && filtered.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-14 text-center"><div className="font-bold">No enrollments found</div><p className="mt-1 text-sm text-muted">Nothing matches this filter.</p></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="mt-3 text-xs font-semibold text-muted">Showing {filtered.length} of {rows.length} enrollments</div>

      {manage && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={closeManage} aria-label="Close" />
          <div className="relative h-full w-full max-w-[720px] overflow-hidden border-l border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
              <div>
                <h3 className="text-lg font-extrabold tracking-tight">Manage Scheme</h3>
                <p className="mt-0.5 text-xs text-muted">{manage.customer} · {manage.scheme} · <span className="font-mono">{manage.enrollment}</span></p>
              </div>
              <button onClick={closeManage} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>

            <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2">
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${tab === t ? "bg-ink text-white" : "text-muted hover:bg-canvas hover:text-ink"}`}>{t}</button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
              {detailLoading && <div className="py-10 text-center text-sm font-bold text-muted">Loading enrollment…</div>}

              {!detailLoading && tab === "Overview" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Customer</div><div className="font-bold">{manage.customer}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Scheme</div><div className="font-bold">{manage.scheme}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Enrollment #</div><div className="font-mono text-xs font-semibold">{manage.enrollment}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Joined</div><div className="font-bold">{fmtDate(manage.joined)}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Status</div><div className="mt-1"><Badge tone={statusTone(manage.status)} dot>{manage.status}</Badge></div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Installment</div><div className="font-bold">{money(manage.installment)}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Paid</div><div className="font-bold">{money(totalPaid)}</div></div>
                  <div className="rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Outstanding</div><div className="font-bold">{money(outstanding(manage))}</div></div>
                  <div className="col-span-2 rounded-xl border border-line bg-canvas/40 p-3"><div className="text-xs text-muted">Current Gold Balance</div><div className="font-bold text-accent-strong">{grams(goldBalance)}</div></div>
                </div>
              )}

              {!detailLoading && tab === "Passbook" && (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                        <th className="px-4 py-2.5">Date</th><th className="py-2.5 text-right">Payment</th><th className="py-2.5 text-right">Applicable Rate</th><th className="py-2.5 text-right">Gold Credited</th><th className="py-2.5 text-right pr-4">Gold Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passbookRows.map((e) => (
                        <tr key={e.id} className="border-b border-line-soft last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs">{e.date}</td>
                          <td className="py-2.5 text-right font-bold">{money(e.amount)}</td>
                          <td className="py-2.5 text-right font-mono text-xs">{rate(e.goldRate)}</td>
                          <td className="py-2.5 text-right font-mono">{grams(e.goldWeight)}</td>
                          <td className="py-2.5 pr-4 text-right font-mono font-bold text-ink">{grams(e.goldBalance)}</td>
                        </tr>
                      ))}
                      {passbookRows.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No passbook entries yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {!detailLoading && tab === "Enrollment Details" && (
                <div className="overflow-hidden rounded-xl border border-line">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Customer</td><td className="px-4 py-2.5 font-bold">{manage.customer}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Scheme</td><td className="px-4 py-2.5 font-medium">{manage.scheme}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Enrollment No.</td><td className="px-4 py-2.5 font-mono text-xs font-semibold">{manage.enrollment}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Status</td><td className="px-4 py-2.5"><Badge tone={statusTone(manage.status)} dot>{manage.status}</Badge></td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Installment</td><td className="px-4 py-2.5 font-bold">{money(manage.installment)}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Planned Duration</td><td className="px-4 py-2.5 font-medium">{manage.total} months</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Successful Payments</td><td className="px-4 py-2.5 font-bold">{manage.paid} / {manage.total}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Total Paid</td><td className="px-4 py-2.5 font-bold">{money(totalPaid)}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Joined</td><td className="px-4 py-2.5 font-mono text-xs">{fmtDate(manage.joined)}</td></tr>
                      <tr className="border-b border-line-soft"><td className="px-4 py-2.5 font-semibold text-muted">Maturity</td><td className="px-4 py-2.5 font-mono text-xs">{fmtDate(manage.maturity)}</td></tr>
                      <tr><td className="px-4 py-2.5 font-semibold text-muted">Next Due</td><td className="px-4 py-2.5 font-mono text-xs">{fmtDate(manage.nextDue)}</td></tr>
                    </tbody>
                  </table>
                  <p className="px-4 py-2 text-xs text-muted">Financial and schedule fields are fixed at enrollment and backend-authoritative.</p>
                </div>
              )}

              {!detailLoading && tab === "Payment / Collection History" && (
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                        <th className="px-4 py-2.5">Date</th><th className="py-2.5">Reference</th><th className="py-2.5">Method</th><th className="py-2.5 text-right">Amount</th><th className="py-2.5 text-right pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b border-line-soft last:border-0">
                          <td className="px-4 py-2.5 font-mono text-xs">{p.date}</td>
                          <td className="py-2.5 font-mono text-xs">{p.id}</td>
                          <td className="py-2.5 font-medium">{p.method || "—"}</td>
                          <td className="py-2.5 text-right font-bold">{money(p.amount)}</td>
                          <td className="py-2.5 pr-4 text-right"><Badge tone={p.status === "COMPLETED" || p.status === "SUCCESS" ? "success" : "info"} dot>{p.status || "—"}</Badge></td>
                        </tr>
                      ))}
                      {payments.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No payments recorded for this enrollment yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {!detailLoading && tab === "Remarks" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold">Operational remark</label>
                  <textarea
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    rows={5}
                    placeholder="e.g. Customer requested callback next week"
                    className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent-line"
                  />
                  <p className="mt-1.5 text-xs text-muted">Operational note only — persisted on the enrollment. Never affects any financial record.</p>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" disabled={savingRemark} onClick={saveRemark}>{savingRemark ? "Saving…" : "Save Remarks"}</Button>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-line p-4 flex justify-end">
              <Button size="sm" variant="outline" onClick={closeManage}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
