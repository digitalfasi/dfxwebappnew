import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, SearchInput } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { billingService } from "../services/billingService";

// Vendor purchasing/accounting module. Every financial figure shown here comes
// from the backend (GET /billing/vendors, /vendor-purchases, /vendor-summary).
// The Record Purchase form shows a live PREVIEW of base/charge/purchase amount,
// but the backend recomputes and returns the authoritative values on save — the
// preview is never persisted or trusted.

const PERIODS = ["Today", "This Week", "This Month", "Last Month"];
const UI_PERIOD_TO_BACKEND = { Today: "today", "This Week": "this_week", "This Month": "this_month", "Last Month": "last_month" };
// Payment MODE is the vendor-facing choice for an actual payment: Offline vs
// Online. It is separate from Payment TYPE (CASH/CREDIT/PARTIAL). The backend
// ledger stores a concrete payment_method enum, so each mode maps onto it and
// the backend's Offline=CASH / Online=UPI+CARD+BANK_TRANSFER classification then
// drives the Offline/Online KPIs. Cash is always Offline.
const PAY_MODES = [
  { value: "OFFLINE", label: "Offline" },
  { value: "ONLINE", label: "Online" },
];
const MODE_TO_METHOD = { OFFLINE: "CASH", ONLINE: "UPI" };
const methodToMode = (m) => (String(m || "").toUpperCase() === "CASH" ? "OFFLINE" : "ONLINE");
const STATUS_TONE = { PAID: "success", PARTIAL: "warning", CREDIT: "danger" };
const STATUS_LABEL = { PAID: "Paid", PARTIAL: "Partial", CREDIT: "Credit" };

const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const grams = (n) => `${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })} g`;
const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};
const todayISO = () => new Date().toISOString().slice(0, 10);

/** Sum backend-authoritative per-purchase figures into per-vendor display totals.
 *  Each figure summed is itself backend-computed; this is a display rollup, not a
 *  re-derivation of financial truth. */
function rollupByVendor(purchases) {
  const m = new Map();
  for (const p of purchases) {
    const r = m.get(p.vendorId) || { count: 0, purchases: 0, paid: 0, outstanding: 0 };
    r.count += 1;
    r.purchases += p.purchaseAmount;
    r.paid += p.amountPaid;
    r.outstanding += p.amountOutstanding;
    m.set(p.vendorId, r);
  }
  return m;
}

export default function Vendors() {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [vendors, setVendors] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [period, setPeriod] = useState("This Month");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const [detailVendor, setDetailVendor] = useState(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [paymentCtx, setPaymentCtx] = useState(null); // a purchase row to record payment against

  usePageMotion(scope, [loading]);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [v, p] = await Promise.all([
        billingService.listVendors(),
        billingService.listVendorPurchases(),
      ]);
      setVendors(v);
      setPurchases(p);
    } catch (err) {
      setLoadError(err?.message || "Could not load vendors.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const s = await billingService.getVendorSummary({ period: UI_PERIOD_TO_BACKEND[period] });
      setSummary(s);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [period]);

  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  const refreshAll = useCallback(async () => { await Promise.all([loadCore(), loadSummary()]); }, [loadCore, loadSummary]);

  const rollup = useMemo(() => rollupByVendor(purchases), [purchases]);

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter((v) => {
      const matchesQ = !q || v.name.toLowerCase().includes(q) || v.contactPerson.toLowerCase().includes(q) || v.phone.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "All" || (statusFilter === "Active" ? v.isActive : !v.isActive);
      return matchesQ && matchesStatus;
    });
  }, [vendors, query, statusFilter]);

  // The five KPI labels are always shown; values come from the backend-
  // authoritative summary (₹0 until it resolves). No frontend re-derivation.
  const kpis = [
    { label: "Total Purchases", value: money(summary?.totalPurchases) },
    { label: "Total Paid", value: money(summary?.totalPaid), tone: "text-emerald-700" },
    { label: "Outstanding", value: money(summary?.outstanding), tone: "text-accent" },
    { label: "Offline", value: money(summary?.offline) },
    { label: "Online", value: money(summary?.online), tone: "text-emerald-700" },
  ];

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Purchase History</h2>
          <p className="mt-1 text-sm text-muted">Vendor purchase payables and the vendor payment ledger — clear outstanding balances here.</p>
        </div>
      </div>

      {/* KPI cards — backend-authoritative vendor summary */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2" data-motion="toolbar">
        <div className="text-xs font-bold text-muted">Purchase &amp; payment summary</div>
        <Select value={period} onValueChange={setPeriod} options={PERIODS} className="w-[150px]" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" data-motion="stat">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{k.label}</div>
            <div className={`num mt-1 text-lg font-extrabold ${k.tone || ""}`}>
              {summaryLoading && !summary ? "…" : k.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder="Search vendor, contact, phone" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 min-w-[220px]" />
        <Select value={statusFilter} onValueChange={setStatusFilter} options={["All", "Active", "Inactive"]} className="w-[140px]" />
      </div>

      {/* Vendor list */}
      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3"><h3 className="text-sm font-extrabold">Vendor list</h3></div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Vendor</th><th className="py-3">Contact</th><th className="py-3">Status</th><th className="py-3">Charge %</th>
                <th className="py-3 text-right">Total Purchases</th><th className="py-3 text-right">Paid</th><th className="py-3 text-right">Outstanding</th><th className="py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !loadError && filteredVendors.map((v) => {
                const r = rollup.get(v.id) || { purchases: 0, paid: 0, outstanding: 0 };
                return (
                  <tr key={v.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <button className="font-bold text-ink hover:text-accent hover:underline" onClick={() => { setDetailTab("overview"); setDetailVendor(v); }}>{v.name}</button>
                    </td>
                    <td className="py-3.5">
                      <div className="text-xs font-semibold">{v.contactPerson || "Not provided"}</div>
                      <div className="text-xs text-muted">{v.phone || "Not provided"}</div>
                    </td>
                    <td className="py-3.5"><Badge tone={v.isActive ? "success" : "neutral"} dot>{v.isActive ? "Active" : "Inactive"}</Badge></td>
                    <td className="py-3.5 font-mono text-xs">{Number(v.vendorChargePercent).toFixed(2)}%</td>
                    <td className="py-3.5 text-right num font-semibold">{money(r.purchases)}</td>
                    <td className="py-3.5 text-right num text-emerald-700">{money(r.paid)}</td>
                    <td className="py-3.5 text-right num font-bold text-accent">{money(r.outstanding)}</td>
                    <td className="py-3.5 pr-6">
                      <div className="flex justify-end">
                        {r.outstanding > 0 ? (
                          <Button size="sm" variant="outline" onClick={() => { setDetailTab("outstanding"); setDetailVendor(v); }}>Clear Outstanding</Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled title="Nothing outstanding">Clear Outstanding</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {loading && (<tr><td colSpan={8} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>)}
              {!loading && loadError && (
                <tr><td colSpan={8} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load vendors</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={loadCore}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && filteredVendors.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-14 text-center"><div className="font-bold">No vendors found</div><p className="mt-1 text-sm text-muted">Adjust the filters to see purchase history.</p></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {detailVendor && (
        <VendorDetail
          vendor={detailVendor}
          initialTab={detailTab}
          onClose={() => setDetailVendor(null)}
          onEdit={() => { setEditVendor(detailVendor); setShowVendorForm(true); }}
          onRecordPayment={(purchase) => setPaymentCtx(purchase)}
          reloadTick={purchases}
        />
      )}

      {showVendorForm && (
        <VendorForm
          vendor={editVendor}
          onClose={() => setShowVendorForm(false)}
          onSaved={async (v) => { setShowVendorForm(false); await loadCore(); if (detailVendor && v?.id === detailVendor.id) setDetailVendor(v); }}
        />
      )}

      {paymentCtx && (
        <RecordPayment
          purchase={paymentCtx}
          onClose={() => setPaymentCtx(null)}
          onSaved={async () => { setPaymentCtx(null); await refreshAll(); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Vendor detail — Overview / Purchases / Payments / Outstanding      */
/* ------------------------------------------------------------------ */
function VendorDetail({ vendor, initialTab = "overview", onClose, onEdit, onRecordPayment, reloadTick }) {
  const [tab, setTab] = useState(initialTab);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ledger, setLedger] = useState(null); // combined payments (lazy)
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const p = await billingService.listVendorPurchases({ vendorId: vendor.id });
      setRows(p);
    } catch (err) { setError(err?.message || "Could not load purchases."); }
    finally { setLoading(false); }
  }, [vendor.id]);

  useEffect(() => { load(); }, [load, reloadTick]);

  // Lazy-load the combined payment ledger only when the Payments tab opens.
  useEffect(() => {
    if (tab !== "payments" || ledger || ledgerLoading || !rows.length) return;
    let alive = true;
    setLedgerLoading(true);
    Promise.all(rows.map((r) => billingService.getVendorPurchasePayments(r.id).catch(() => ({ payments: [] }))))
      .then((res) => {
        if (!alive) return;
        const flat = res.flatMap((r, i) => (r.payments || []).map((pm) => ({ ...pm, invoiceRef: rows[i].invoiceRef, purchaseDate: rows[i].purchaseDate })));
        flat.sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || "")));
        setLedger(flat);
      })
      .finally(() => { if (alive) setLedgerLoading(false); });
    return () => { alive = false; };
  }, [tab, rows, ledger, ledgerLoading]);

  const totals = useMemo(() => rows.reduce((a, p) => ({
    purchases: a.purchases + p.purchaseAmount, paid: a.paid + p.amountPaid, outstanding: a.outstanding + p.amountOutstanding,
  }), { purchases: 0, paid: 0, outstanding: 0 }), [rows]);
  const outstandingRows = useMemo(() => rows.filter((p) => p.amountOutstanding > 0), [rows]);

  const TABS = [["overview", "Overview"], ["purchases", `Purchases (${rows.length})`], ["payments", "Payments"], ["outstanding", `Outstanding (${outstandingRows.length})`]];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[900px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold">{vendor.name}</h3>
              <Badge tone={vendor.isActive ? "success" : "neutral"} dot>{vendor.isActive ? "Active" : "Inactive"}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">Default vendor charge {Number(vendor.vendorChargePercent).toFixed(2)}% · applied to base gold amount</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
          </div>
        </div>

        <div className="flex gap-1 border-b border-line px-4">
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`relative px-3 py-2.5 text-xs font-bold transition-colors ${tab === id ? "text-accent" : "text-muted hover:text-ink"}`}>
              {label}
              {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && <div className="rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error} <button className="underline" onClick={load}>Retry</button></div>}

          {tab === "overview" && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Total Purchases" value={money(totals.purchases)} />
                <MiniStat label="Paid" value={money(totals.paid)} tone="text-emerald-700" />
                <MiniStat label="Outstanding" value={money(totals.outstanding)} tone="text-accent" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Contact person" value={vendor.contactPerson || "Not provided"} />
                <Field label="Phone" value={vendor.phone || "Not provided"} />
                <Field label="Email" value={vendor.email || "Not provided"} />
                <Field label="GST number" value={vendor.gstNumber || "Not provided"} />
                <Field label="Address" value={vendor.address || "Not provided"} className="sm:col-span-2" />
              </div>
            </div>
          )}

          {tab === "purchases" && (
            <PurchaseTable rows={rows} loading={loading} onRecordPayment={onRecordPayment} emptyHint="No purchases recorded for this vendor yet." />
          )}

          {tab === "outstanding" && (
            <PurchaseTable rows={outstandingRows} loading={loading} onRecordPayment={onRecordPayment} emptyHint="No outstanding purchases — all settled." />
          )}

          {tab === "payments" && (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead><tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted"><th className="px-4 py-2.5">Date</th><th className="py-2.5">Invoice</th><th className="py-2.5">Mode</th><th className="py-2.5">Reference</th><th className="py-2.5 text-right pr-4">Amount</th></tr></thead>
                <tbody>
                  {ledgerLoading && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted font-bold">Loading ledger…</td></tr>}
                  {!ledgerLoading && (ledger || []).map((p) => (
                    <tr key={p.id} className="border-t border-line-soft">
                      <td className="px-4 py-2.5">{fmtDate(p.paymentDate)}</td>
                      <td className="py-2.5 text-xs">{p.invoiceRef || "Not provided"}</td>
                      <td className="py-2.5">{methodToMode(p.paymentMethod) === "OFFLINE" ? "Offline" : "Online"}</td>
                      <td className="py-2.5 text-xs text-muted">{p.referenceNo || "Not provided"}</td>
                      <td className="py-2.5 text-right num font-semibold pr-4">{money(p.amount)}</td>
                    </tr>
                  ))}
                  {!ledgerLoading && ledger && ledger.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No payments recorded yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PurchaseTable({ rows, loading, onRecordPayment, emptyHint }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[780px] border-collapse text-sm">
        <thead>
          <tr className="bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            <th className="px-4 py-2.5">Date</th><th className="py-2.5">Invoice</th><th className="py-2.5 text-right">Weight</th><th className="py-2.5 text-right">Purchase</th><th className="py-2.5 text-right">Paid</th><th className="py-2.5 text-right">Outstanding</th><th className="py-2.5">Status</th><th className="py-2.5 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted font-bold">Loading…</td></tr>}
          {!loading && rows.map((p) => (
            <tr key={p.id} className="border-t border-line-soft align-middle">
              <td className="px-4 py-2.5">{fmtDate(p.purchaseDate)}</td>
              <td className="py-2.5 text-xs">{p.invoiceRef || "Not provided"}</td>
              <td className="py-2.5 text-right num">{grams(p.weightGrams)}</td>
              <td className="py-2.5 text-right num font-semibold">{money(p.purchaseAmount)}</td>
              <td className="py-2.5 text-right num text-emerald-700">{money(p.amountPaid)}</td>
              <td className="py-2.5 text-right num font-bold text-accent">{money(p.amountOutstanding)}</td>
              <td className="py-2.5"><Badge tone={STATUS_TONE[p.paymentStatus] || "neutral"}>{STATUS_LABEL[p.paymentStatus] || p.paymentStatus}</Badge></td>
              <td className="py-2.5 pr-4 text-right">{p.amountOutstanding > 0 && <Button size="sm" variant="outline" onClick={() => onRecordPayment(p)}>Record Payment</Button>}</td>
            </tr>
          ))}
          {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">{emptyHint}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const MiniStat = ({ label, value, tone }) => (
  <div className="rounded-xl border border-line bg-canvas/40 p-3">
    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
    <div className={`num mt-1 text-base font-extrabold ${tone || ""}`}>{value}</div>
  </div>
);
const Field = ({ label, value, className }) => (
  <div className={className}>
    <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
    <div className="mt-0.5 text-sm font-semibold">{value}</div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Add / Edit vendor                                                  */
/* ------------------------------------------------------------------ */
function VendorForm({ vendor, onClose, onSaved }) {
  const editing = !!vendor;
  const [f, setF] = useState({
    name: vendor?.name || "", contactPerson: vendor?.contactPerson || "", phone: vendor?.phone || "",
    email: vendor?.email || "", gstNumber: vendor?.gstNumber || "", address: vendor?.address || "",
    vendorChargePercent: vendor ? String(vendor.vendorChargePercent) : "4", isActive: vendor ? vendor.isActive : true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    if (f.name.trim().length < 2) { toast("Vendor name is required (min 2 characters)"); return; }
    setSaving(true);
    try {
      const payload = { ...f, name: f.name.trim() };
      const saved = editing ? await billingService.updateVendor(vendor.id, payload) : await billingService.createVendor(payload);
      toast(editing ? "Vendor updated" : "Vendor created");
      await onSaved(saved);
    } catch (err) { toast(err?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[560px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">{editing ? "Edit Vendor" : "Add Vendor"}</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
        <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4">
          <label className="grid gap-1.5"><span className="text-xs font-bold">Vendor Name *</span><Input value={f.name} onChange={set("name")} placeholder="e.g. Malabar Gold" /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">Contact Person</span><Input value={f.contactPerson} onChange={set("contactPerson")} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Phone</span><Input value={f.phone} onChange={set("phone")} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Email</span><Input type="email" value={f.email} onChange={set("email")} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">GST Number</span><Input value={f.gstNumber} onChange={set("gstNumber")} /></label>
          </div>
          <label className="grid gap-1.5"><span className="text-xs font-bold">Address</span><Input value={f.address} onChange={set("address")} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">Default Vendor Charge %</span><Input type="number" step="0.01" value={f.vendorChargePercent} onChange={set("vendorChargePercent")} /><span className="text-[11px] text-muted">Applied to base gold amount, not the rate/g. Default 4%.</span></label>
            {editing && (
              <label className="grid gap-1.5"><span className="text-xs font-bold">Status</span><Select value={f.isActive ? "Active" : "Inactive"} onValueChange={(v) => setF({ ...f, isActive: v === "Active" })} options={["Active", "Inactive"]} /></label>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} className="bg-accent hover:bg-accent-strong" onClick={submit}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Vendor"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record payment against an outstanding purchase                     */
/* ------------------------------------------------------------------ */
function RecordPayment({ purchase, onClose, onSaved }) {
  const [f, setF] = useState({ amount: String(purchase.amountOutstanding || ""), payMode: "OFFLINE", paymentDate: todayISO(), referenceNo: "", remarks: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const amount = Number(f.amount) || 0;
  const remaining = Math.max(0, purchase.amountOutstanding - amount);
  const overpay = amount > purchase.amountOutstanding + 1e-6;
  const valid = amount > 0 && !overpay;

  const submit = async () => {
    if (!valid) { toast(overpay ? "Amount exceeds outstanding" : "Enter a valid amount"); return; }
    setSaving(true);
    try {
      await billingService.recordVendorPayment(purchase.id, { amount, paymentDate: f.paymentDate, paymentMethod: MODE_TO_METHOD[f.payMode], referenceNo: f.referenceNo, remarks: f.remarks });
      toast("Vendor payment recorded");
      await onSaved();
    } catch (err) { toast(err?.message || "Could not record payment"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[520px] rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Record Vendor Payment</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
            <div className="flex items-center justify-between text-xs"><span className="font-bold text-muted">{purchase.vendorName}{purchase.invoiceRef ? ` · ${purchase.invoiceRef}` : ""}</span><Badge tone={STATUS_TONE[purchase.paymentStatus] || "neutral"}>{STATUS_LABEL[purchase.paymentStatus] || purchase.paymentStatus}</Badge></div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MiniStat label="Purchase" value={money(purchase.purchaseAmount)} />
              <MiniStat label="Paid" value={money(purchase.amountPaid)} tone="text-emerald-700" />
              <MiniStat label="Outstanding" value={money(purchase.amountOutstanding)} tone="text-accent" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">Payment Amount (₹) *</span><Input type="number" step="0.01" value={f.amount} onChange={set("amount")} error={overpay ? "Exceeds outstanding" : undefined} />{overpay && <span className="text-[11px] font-semibold text-danger">Cannot exceed {money(purchase.amountOutstanding)}</span>}</label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Payment Mode *</span><Select value={f.payMode} onValueChange={(v) => setF({ ...f, payMode: v })} options={PAY_MODES} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Payment Date *</span><Input type="date" value={f.paymentDate} onChange={set("paymentDate")} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Reference No.</span><Input value={f.referenceNo} onChange={set("referenceNo")} /></label>
            <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-bold">Remarks</span><Input value={f.remarks} onChange={set("remarks")} /></label>
          </div>
          <div className="rounded-lg border border-dashed border-line bg-canvas/40 p-3">
            <PreviewRow label="Remaining after this payment" value={money(remaining)} strong />
            <div className="mt-0.5 text-[11px] text-muted">Backend re-derives the authoritative outstanding and status on save.</div>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving || !valid} className="bg-accent hover:bg-accent-strong" onClick={submit}>{saving ? "Recording…" : "Record Payment"}</Button>
        </div>
      </div>
    </div>
  );
}

const PreviewRow = ({ label, value, strong }) => (
  <div className={`flex items-center justify-between py-0.5 ${strong ? "mt-1 border-t border-line pt-1.5" : ""}`}>
    <span className={`text-xs ${strong ? "font-bold text-ink" : "text-muted"}`}>{label}</span>
    <span className={`num text-sm ${strong ? "font-extrabold" : "font-semibold"}`}>{value}</span>
  </div>
);
