import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { DigitsInput, Input, PhoneInput, SearchInput } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { money, grams, istToday } from "@/_shared/utils";
import { billingService } from "@/modules/billing/billingService";

// Vendor purchasing/accounting module. Every financial figure shown here comes
// from the backend (GET /billing/vendors, /vendor-purchases, /vendor-summary).
// The Record Purchase form shows a live PREVIEW of base/charge/purchase amount,
// but the backend recomputes and returns the authoritative values on save — the
// preview is never persisted or trusted.

const PERIODS = ["Today", "This Week", "This Month", "Last Month", "This Year", "Custom"];
// "Custom" carries no backend period keyword — it sends date_from/date_to instead.
const UI_PERIOD_TO_BACKEND = { Today: "today", "This Week": "this_week", "This Month": "this_month", "Last Month": "last_month", "This Year": "this_year" };
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

// Vendor identity rules, enforced here and again by the API.
//   phone : ten local digits behind a fixed +91 - the PhoneInput cannot hold
//           anything else, so this only has to catch a short number.
//   email : the store's vendor records are Gmail accounts by policy, so a
//           different domain is a data-entry mistake worth blocking.
//   GST   : uppercase alphanumeric, 15 characters. Typed lowercase or pasted
//           with spaces or punctuation, it is normalised rather than rejected -
//           the admin should not have to retype a number that is already right.
const onlyTenDigits = (v) => String(v).replace(/\D/g, "").slice(0, 10);
const GSTIN_LEN = 15;
const normalizeGst = (v) => String(v).replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, GSTIN_LEN);
const VENDOR_EMAIL_RE = /^[A-Za-z0-9._%+-]+@gmail\.com$/;

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};
const todayISO = () => istToday();

/** Sum backend-authoritative per-purchase figures into per-vendor display totals.
 *  Each figure summed is itself backend-computed; this is a display rollup, not a
 *  re-derivation of financial truth. */
// Local date window for a selected period, mirroring the backend keywords the
// KPI summary uses (Monday-start week, calendar month/last-month/year). Returns
// null = no filter (all-time). Custom needs both dates or it stays null.
function periodWindow(period, customFrom, customTo) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const at = (yy, mm, dd) => { const x = new Date(yy, mm, dd); x.setHours(0, 0, 0, 0); return x; };
  switch (period) {
    case "Today": return { from: at(y, m, d), to: now };
    case "This Week": { const dow = (now.getDay() + 6) % 7; return { from: at(y, m, d - dow), to: now }; }
    case "This Month": return { from: at(y, m, 1), to: now };
    case "Last Month": { const lastPrev = at(y, m, 0); return { from: at(lastPrev.getFullYear(), lastPrev.getMonth(), 1), to: lastPrev }; }
    case "This Year": return { from: at(y, 0, 1), to: now };
    case "Custom": return (customFrom && customTo) ? { from: at(...customFrom.split("-").map((n, i) => i === 1 ? Number(n) - 1 : Number(n))), to: at(...customTo.split("-").map((n, i) => i === 1 ? Number(n) - 1 : Number(n))) } : null;
    default: return null;
  }
}
function inWindow(dateStr, win) {
  if (!win) return true;
  if (!dateStr) return false;
  const s = String(dateStr).slice(0, 10).split("-");
  if (s.length !== 3) return false;
  const dt = new Date(Number(s[0]), Number(s[1]) - 1, Number(s[2]));
  dt.setHours(0, 0, 0, 0);
  return dt >= win.from && dt <= win.to;
}

// A METAL purchase owes grams, not rupees (its rupee figures are the stock's
// reference cost only).
const isMetal = (p) => p.settleIn === "METAL";
const metalOwed = (p) => (isMetal(p) ? Math.max(0, Math.round(((p.metalDueGrams || 0) - (p.metalPaidGrams || 0)) * 1000) / 1000) : 0);
const metalName = (t) => (t === "SILVER" ? "silver" : "gold");
const g3 = (v) => `${(Number(v) || 0).toFixed(3)} g`;
// Days to settle (money) / return the metal, from the reminder set at purchase.
function dueInfo(p) {
  const open = isMetal(p) ? metalOwed(p) > 0 : p.amountOutstanding > 0.005;
  if (!open || !p.reminderAt) return null;
  const day = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(p.reminderAt); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / day);
  const verb = isMetal(p) ? "Return" : "Pay";
  if (days > 0) return { text: `${verb} in ${days} day${days === 1 ? "" : "s"}`, tone: days <= 3 ? "text-warn" : "text-muted", date: due };
  if (days === 0) return { text: `${verb} today`, tone: "text-danger", date: due };
  return { text: `${-days} day${days === -1 ? "" : "s"} overdue`, tone: "text-danger", date: due };
}

function rollupByVendor(purchases) {
  const m = new Map();
  for (const p of purchases) {
    const r = m.get(p.vendorId) || { count: 0, purchases: 0, paid: 0, outstanding: 0, goldOwed: 0, silverOwed: 0, last: null };
    r.count += 1;
    // The store staff shown for a supplier is whoever entered its latest purchase.
    const at = p.purchaseAt || p.createdAt || p.purchaseDate || "";
    if (!r.last || at > r.last.at) r.last = { at, name: p.enteredByName, phone: p.enteredByPhone, deliveredBy: p.deliveredBy };
    r.purchases += p.purchaseAmount;
    r.paid += p.amountPaid;
    r.outstanding += p.amountOutstanding;
    if (isMetal(p)) r[p.metalType === "SILVER" ? "silverOwed" : "goldOwed"] += metalOwed(p);
    m.set(p.vendorId, r);
  }
  return m;
}

export default function Vendors({ intent, clearIntent } = {}) {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [vendors, setVendors] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [period, setPeriod] = useState("This Month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
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
      setLoadError(err?.message || "Could not load suppliers.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    // Custom needs both dates before it can query; until then, leave the last
    // summary in place rather than firing an incomplete request.
    if (period === "Custom" && (!customFrom || !customTo)) return;
    setSummaryLoading(true);
    try {
      const s = period === "Custom"
        ? await billingService.getVendorSummary({ dateFrom: customFrom, dateTo: customTo })
        : await billingService.getVendorSummary({ period: UI_PERIOD_TO_BACKEND[period] });
      setSummary(s);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [period, customFrom, customTo]);

  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  // A "supplier payment due" notification opens that supplier on Purchases.
  useEffect(() => {
    if (!intent?.purchase || loading) return;
    const p = purchases.find((x) => x.id === intent.purchase);
    const v = p && vendors.find((x) => x.id === p.vendorId);
    clearIntent?.();
    if (v) { setDetailTab("purchases"); setDetailVendor(v); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, loading, purchases, vendors]);

  const refreshAll = useCallback(async () => { await Promise.all([loadCore(), loadSummary()]); }, [loadCore, loadSummary]);

  // Vendor-list totals honour the SAME period the KPI cards use, so the table
  // and the cards move together. Filter each vendor's purchases to the period
  // window (by purchase date), then roll up.
  const rollup = useMemo(() => {
    const win = periodWindow(period, customFrom, customTo);
    return rollupByVendor(purchases.filter((p) => inWindow(p.purchaseDate, win)));
  }, [purchases, period, customFrom, customTo]);

  const filteredVendors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vendors.filter((v) => {
      const matchesQ = !q || v.name.toLowerCase().includes(q) || v.phone.toLowerCase().includes(q) || (v.code || "").toLowerCase().includes(q) || (v.contactPerson || "").toLowerCase().includes(q) || (v.gstNumber || "").toLowerCase().includes(q);
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
          <p className="mt-1 text-sm text-muted">What was bought from each supplier, what is paid and what is outstanding — clear balances here.</p>
        </div>
        {/* Suppliers are added and edited in the Supplier Directory now. */}
      </div>

      {/* KPI cards — backend-authoritative vendor summary */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2" data-motion="toolbar">
        <div className="text-xs font-bold text-muted">Purchase &amp; payment summary</div>
        <div className="flex flex-wrap items-center gap-2">
          {period === "Custom" && (
            <>
              <Input type="date" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} className="w-[150px]" aria-label="From date" />
              <span className="text-xs text-muted">to</span>
              <Input type="date" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} className="w-[150px]" aria-label="To date" />
            </>
          )}
          <Select value={period} onValueChange={setPeriod} options={PERIODS} className="w-[150px]" />
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5" data-motion="stat">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3.5 kpi-corner">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">{k.label}</div>
            <div className={`num mt-1 text-lg font-extrabold ${k.tone || ""}`}>
              {summaryLoading && !summary ? "…" : k.value}
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-motion="toolbar">
        <SearchInput placeholder="Search supplier code, name, staff or GST" value={query} onChange={(e) => setQuery(e.target.value)} className="flex-1 min-w-[220px]" />
        <Select value={statusFilter} onValueChange={setStatusFilter} options={["All", "Active", "Inactive"]} className="w-[140px]" />
      </div>

      {/* Vendor list */}
      <Card data-motion="reveal" className="overflow-hidden">
        <div className="border-b border-line px-6 py-3"><h3 className="text-sm font-extrabold">Purchases by supplier</h3></div>
        <CardContent className="overflow-x-auto px-0 pb-0">
          {/* 1180px is the sum of the column minimums below plus their padding.
              Leaving it at 900 would have let the browser start squeezing again
              before the wrapper scrolled.
              This comment sits ABOVE the tag, not after it: trailing it on the
              same line left two spaces between <table> and the comment, and a
              whitespace text node is not a legal child of <table> — React
              reported it as a hydration error on every render of this page. */}
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="whitespace-nowrap border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                {/* PH-UI-001. Every column but the first and last carried
                    vertical padding only, so adjacent cells sat flush against
                    each other and whitespace-nowrap then guaranteed a status
                    badge, a percentage and a currency amount would touch. The
                    widths below are minimums, not fixed sizes: the table keeps
                    growing with the viewport, and when it can no longer fit it
                    scrolls (see overflow-x on the wrapper) rather than crushing
                    the columns into each other. */}
                <th className="px-6 py-3 min-w-[10rem]">Supplier Code</th><th className="px-4 py-3 min-w-[10rem]">Supplier Staff</th><th className="px-4 py-3 min-w-[10rem]">Store Staff</th>
                <th className="px-4 py-3 text-right min-w-[8rem]">Total Purchases</th><th className="px-4 py-3 text-right min-w-[7rem]">Paid</th><th className="px-4 py-3 text-right min-w-[8rem]">Outstanding</th><th className="px-4 py-3 text-right pr-6 min-w-[10.5rem]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !loadError && filteredVendors.map((v) => {
                const r = rollup.get(v.id) || { purchases: 0, paid: 0, outstanding: 0, last: null };
                const staffName = v.contactPerson || r.last?.deliveredBy || "";
                return (
                  <tr key={v.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                    <td className="min-w-[250px] px-6 py-3.5">
                      <button className="flex items-center gap-2 text-left" onClick={() => { setDetailTab("overview"); setDetailVendor(v); }}>
                        <span className="shrink-0 whitespace-nowrap rounded-md border border-accent-line bg-accent-soft px-2 py-0.5 font-mono text-xs font-extrabold tracking-wide text-accent-strong">{v.code || "—"}</span>
                        <span className="line-clamp-2 font-bold text-ink hover:text-accent hover:underline" title={v.name}>{v.name}</span>
                      </button>
                      {!v.isActive && <div className="mt-1"><Badge tone="neutral" dot>Inactive</Badge></div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-semibold">{staffName || "—"}</div>
                      <div className="num text-xs text-muted">{v.phone ? `+91 ${v.phone}` : ""}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-xs font-semibold">{r.last?.name || "—"}</div>
                      <div className="num text-xs text-muted">{r.last?.phone ? `+91 ${String(r.last.phone).replace(/\D/g, "").slice(-10)}` : ""}</div>
                    </td>
                    <td className="px-4 py-3.5 text-right num font-semibold whitespace-nowrap">{money(r.purchases)}</td>
                    <td className="px-4 py-3.5 text-right num text-emerald-700 whitespace-nowrap">{money(r.paid)}</td>
                    <td className="px-4 py-3.5 text-right num font-bold text-accent whitespace-nowrap">
                      {money(r.outstanding)}
                      {r.goldOwed > 0.0005 && <div className="text-[11px] font-bold text-accent-strong">+ {g3(r.goldOwed)} gold</div>}
                      {r.silverOwed > 0.0005 && <div className="text-[11px] font-bold text-muted">+ {g3(r.silverOwed)} silver</div>}
                    </td>
                    <td className="px-4 py-3.5 pr-6">
                      <div className="flex justify-end">
                        {r.outstanding > 0 || r.goldOwed > 0.0005 || r.silverOwed > 0.0005 ? (
                          <Button size="sm" variant="outline" onClick={() => { setDetailTab("purchases"); setDetailVendor(v); }}>Clear Outstanding</Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled title="Nothing outstanding">Clear Outstanding</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {loading && (<tr><td colSpan={7} className="px-6 py-14 text-center text-sm font-bold text-muted">Loading…</td></tr>)}
              {!loading && loadError && (
                <tr><td colSpan={7} className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load suppliers</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={loadCore}>Retry</Button></td></tr>
              )}
              {!loading && !loadError && filteredVendors.length === 0 && (
                <tr><td colSpan={7} className="px-6 py-14 text-center"><div className="font-bold">No suppliers found</div><p className="mt-1 text-sm text-muted">Adjust the filters to see purchase history.</p></td></tr>
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
  const [ledgerIncomplete, setLedgerIncomplete] = useState(0);

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
  // NOTE: ledgerLoading must NOT be a dependency — setting it re-ran the effect,
  // whose cleanup flipped `alive` to false, so the in-flight resolve then skipped
  // both setLedger and setLedgerLoading(false) → stuck on "Loading ledger…".
  useEffect(() => {
    if (tab !== "payments" || ledger || loading) return;
    if (!rows.length) { setLedger([]); return; }
    let alive = true;
    setLedgerLoading(true);
    // A failed fetch used to become an empty payments list, so a vendor's
    // ledger could quietly show fewer payments than they were actually paid -
    // and a short ledger reads as "we still owe them", which is a conversation
    // with a vendor nobody wants to have from the wrong number. Failures are
    // counted and stated instead.
    Promise.all(
      rows.map((r) =>
        billingService
          .getVendorPurchasePayments(r.id)
          .then((res) => ({ ok: true, payments: res.payments || [] }))
          .catch(() => ({ ok: false, payments: [] })),
      ),
    )
      .then((res) => {
        if (!alive) return;
        const flat = res.flatMap((r, i) => r.payments.map((pm) => ({ ...pm, invoiceRef: rows[i].invoiceRef, purchaseDate: rows[i].purchaseDate, deliveredBy: rows[i].deliveredBy })));
        flat.sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || "")));
        setLedger(flat);
        setLedgerIncomplete(res.filter((r) => !r.ok).length);
      })
      .finally(() => { if (alive) setLedgerLoading(false); });
    return () => { alive = false; };
  }, [tab, rows, ledger, loading]);

  const totals = useMemo(() => rows.reduce((a, p) => ({
    purchases: a.purchases + p.purchaseAmount, paid: a.paid + p.amountPaid, outstanding: a.outstanding + p.amountOutstanding,
  }), { purchases: 0, paid: 0, outstanding: 0 }), [rows]);
  // The Purchases tab already carries the Outstanding column + Record Payment,
  // so a separate Outstanding tab was a duplicate view — removed. Purchases is
  // the single, complete list.
  const TABS = [["overview", "Overview"], ["purchases", `Purchases (${rows.length})`], ["payments", "Payments"]];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[1180px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold">{vendor.name}</h3>
              <Badge tone={vendor.isActive ? "success" : "neutral"} dot>{vendor.isActive ? "Active" : "Inactive"}</Badge>
            </div>
            {/* Tunch is per piece now (from its Tunch Number), so the
                supplier has no default worth showing here. */}
            <p className="mt-0.5 text-xs text-muted">
              {[vendor.code && `Supplier code ${vendor.code}`, vendor.contactPerson && `Staff ${vendor.contactPerson}${vendor.phone ? ` · +91 ${vendor.phone}` : ""}`].filter(Boolean).join("  ·  ") || "Supplier"}
            </p>
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
                <Field label="Supplier code" value={vendor.code || "Not provided"} />
                <Field label="Owner" value={vendor.ownerName ? `${vendor.ownerName}${vendor.ownerPhone ? `  ·  +91 ${vendor.ownerPhone}` : ""}` : "Not provided"} />
                <Field label="Supplier staff" value={vendor.contactPerson ? `${vendor.contactPerson}${vendor.phone ? `  ·  +91 ${vendor.phone}` : ""}` : vendor.phone ? `+91 ${vendor.phone}` : "Not provided"} />
                <Field label="Email" value={vendor.email || "Not provided"} />
                <Field label="GST number" value={vendor.gstNumber || "Not provided"} />
              </div>
            </div>
          )}

          {tab === "purchases" && (
            <PurchaseTable rows={rows} loading={loading} onRecordPayment={onRecordPayment} emptyHint="No purchases recorded for this supplier yet." />
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
                      <td className="py-2.5 text-xs">{p.invoiceRef || "Not provided"}{p.deliveredBy && <div className="text-[11px] text-muted">By {p.deliveredBy}</div>}</td>
                      <td className="py-2.5">{methodToMode(p.paymentMethod) === "OFFLINE" ? "Offline" : "Online"}</td>
                      <td className="py-2.5 text-xs text-muted">{p.referenceNo || "Not provided"}</td>
                      <td className="py-2.5 text-right num font-semibold pr-4">{money(p.amount)}</td>
                    </tr>
                  ))}
                  {!ledgerLoading && ledger && ledger.length === 0 && ledgerIncomplete === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">No payments recorded yet.</td></tr>}
                  {!ledgerLoading && ledgerIncomplete > 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-center text-xs font-bold text-danger">
                        {ledgerIncomplete} purchase{ledgerIncomplete === 1 ? "'s" : "s'"} payments could not be loaded — this ledger is incomplete. Reopen the supplier to try again.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// hideOutstanding drops the Outstanding column in the Outstanding tab (the whole
// tab is outstanding — the column is redundant there) and frees that width for
// the remaining columns, so Outstanding/Status no longer collide.
function PurchaseTable({ rows, loading, onRecordPayment, emptyHint, hideOutstanding }) {
  const cols = hideOutstanding ? 6 : 7;
  // Fixed columns: every figure has its own lane, long text wraps inside its
  // cell instead of running into the next one, and a narrow screen scrolls
  // sideways rather than squeezing the columns together.
  const th = "px-3 py-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted";
  const action = (p) => (isMetal(p)
    ? metalOwed(p) > 0 && <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => onRecordPayment(p)}>Give Metal</Button>
    : p.amountOutstanding > 0 && <Button size="sm" variant="outline" className="whitespace-nowrap" onClick={() => onRecordPayment(p)}>Record Payment</Button>);
  return (
    <>
    {/* Phones: one card per purchase, every figure labelled - no sideways scroll. */}
    <div className="grid gap-3 md:hidden">
      {loading && <div className="rounded-xl border border-line px-4 py-8 text-center font-bold text-muted">Loading…</div>}
      {!loading && rows.length === 0 && <div className="rounded-xl border border-line px-4 py-8 text-center text-muted">{emptyHint}</div>}
      {!loading && rows.map((p) => {
        const metal = isMetal(p);
        const unit = metalName(p.metalType);
        const due = dueInfo(p);
        const cell = (label, value, tone = "", sub = "") => (
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">{label}</div>
            <div className={`num mt-0.5 font-bold ${tone}`}>{value}</div>
            {sub && <div className="text-[11px] text-muted">{sub}</div>}
          </div>
        );
        return (
          <div key={p.id} className="rounded-xl border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold">{fmtDate(p.purchaseDate)}</div>
                <div className={`break-words text-xs ${p.invoiceRef ? "font-semibold" : "text-muted"}`}>{p.invoiceRef || "No invoice no."}</div>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                <Badge tone={STATUS_TONE[p.paymentStatus] || "neutral"}>{STATUS_LABEL[p.paymentStatus] || p.paymentStatus}</Badge>
                {metal && <span className="rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-accent-strong">{unit}</span>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft pt-3 text-sm">
              {cell("Weight", p.netWeightGrams != null ? `${grams(p.netWeightGrams)}${p.purity ? ` ${p.purity}` : ""}` : `${grams(p.weightGrams)} @ 24K`, "", p.netWeightGrams != null ? `${grams(p.weightGrams)} @ 24K` : "")}
              {cell("Purchase", money(p.purchaseAmount), "", [p.gstApplied ? `incl. GST ${money(p.gstAmount)}` : "", metal ? `Owed ${g3(p.metalDueGrams)} ${unit}` : ""].filter(Boolean).join(" · "))}
              {cell("Paid", metal ? `${g3(p.metalPaidGrams)}` : money(p.amountPaid), "text-emerald-700", metal ? `${unit} given` : "")}
              {!hideOutstanding && cell("Outstanding", metal ? `${g3(metalOwed(p))}` : money(p.amountOutstanding), "text-accent", metal ? `${unit} to give` : "")}
            </div>
            {(p.deliveredBy || p.enteredByName) && (
              <div className="mt-3 text-[11px] leading-snug text-muted">
                {p.deliveredBy && <div>Delivered by <span className="font-semibold text-ink-soft">{p.deliveredBy}</span>{p.deliveredByPhone ? ` · +91 ${p.deliveredByPhone}` : ""}</div>}
                {p.enteredByName && <div>Entered by {p.enteredByName}</div>}
              </div>
            )}
            {(due || action(p)) && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
                {due ? <span className={`text-xs font-bold ${due.tone}`}>{due.text}</span> : <span />}
                {action(p)}
              </div>
            )}
          </div>
        );
      })}
    </div>
    <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
      <table className={`w-full table-fixed border-collapse text-sm ${hideOutstanding ? "min-w-[880px]" : "min-w-[1000px]"}`}>
        <colgroup>
          <col className="w-[110px]" /><col className="w-[190px]" /><col className="w-[112px]" />
          <col className="w-[190px]" /><col className="w-[112px]" />{!hideOutstanding && <col className="w-[122px]" />}
          <col className="w-[164px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-canvas/60 text-left">
            <th className={`${th} pl-4`}>Date</th>
            <th className={th}>Invoice</th>
            <th className={`${th} text-right`} title="The metal received, and beneath it the pure gold the payment was calculated on (net x purity/24)">Weight</th>
            <th className={`${th} text-right`}>Purchase</th>
            <th className={`${th} text-right`}>Paid</th>
            {!hideOutstanding && <th className={`${th} text-right`}>Outstanding</th>}
            <th className={`${th} pr-4`}>Status</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={cols} className="px-4 py-10 text-center text-muted font-bold">Loading…</td></tr>}
          {!loading && rows.map((p) => {
            const metal = isMetal(p);
            const unit = metalName(p.metalType);
            const due = dueInfo(p);
            return (
              <tr key={p.id} className="border-t border-line-soft align-top transition-colors hover:bg-canvas/40">
                <td className="py-3.5 pl-4 pr-3 font-semibold whitespace-nowrap">{fmtDate(p.purchaseDate)}</td>
                <td className="px-3 py-3.5">
                  <div className={`break-words text-[13px] font-semibold ${p.invoiceRef ? "" : "text-muted"}`}>{p.invoiceRef || "No invoice no."}</div>
                  {p.deliveredBy && (
                    <div className="mt-1 break-words text-[11px] leading-snug text-muted">
                      Delivered by <span className="font-semibold text-ink-soft">{p.deliveredBy}</span>
                      {p.deliveredByPhone && <span className="whitespace-nowrap"> · +91 {p.deliveredByPhone}</span>}
                    </div>
                  )}
                  {p.enteredByName && <div className="mt-0.5 break-words text-[11px] leading-snug text-muted">Entered by {p.enteredByName}</div>}
                </td>
                {/* Both figures, because they answer different questions: what
                    came into the safe, and what the vendor was paid for. A row
                    written before net weight was recorded shows the equivalent
                    alone rather than implying the two are the same. */}
                <td className="px-3 py-3.5 text-right">
                  {p.netWeightGrams != null ? (
                    <>
                      <div className="num font-semibold whitespace-nowrap" title="Metal received">
                        {grams(p.netWeightGrams)}{p.purity ? <span className="ml-1 text-[11px] font-normal text-muted">{p.purity}</span> : null}
                      </div>
                      <div className="num mt-0.5 text-[11px] text-muted whitespace-nowrap" title="Pure gold the payment was calculated on">{grams(p.weightGrams)} @ 24K</div>
                    </>
                  ) : (
                    <div className="num whitespace-nowrap" title="Pure gold the payment was calculated on — this purchase predates the received-weight column">{grams(p.weightGrams)} @ 24K</div>
                  )}
                </td>
                <td className="px-3 py-3.5 text-right">
                  <div className="num font-bold whitespace-nowrap">{money(p.purchaseAmount)}</div>
                  {p.gstApplied && <div className="num mt-0.5 text-[11px] text-muted whitespace-nowrap">incl. GST {p.gstPercent}% · {money(p.gstAmount)}</div>}
                  {metal && (
                    <div className="num mt-1 text-[11px] font-bold leading-snug text-accent-strong">
                      <span className="whitespace-nowrap">Owed: {g3(p.metalDueGrams)} {unit}</span>
                      {p.metalType === "SILVER" && p.metalRatePerGram ? <span className="block whitespace-nowrap font-semibold text-muted">at {money(p.metalRatePerGram)}/g</span> : null}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3.5 text-right text-emerald-700">
                  {metal ? (
                    <><div className="num font-semibold whitespace-nowrap">{g3(p.metalPaidGrams)}</div><div className="text-[11px] text-muted">{unit} given</div></>
                  ) : <div className="num font-semibold whitespace-nowrap">{money(p.amountPaid)}</div>}
                </td>
                {!hideOutstanding && (
                  <td className="px-3 py-3.5 text-right text-accent">
                    {metal ? (
                      <><div className="num font-bold whitespace-nowrap">{g3(metalOwed(p))}</div><div className="text-[11px] text-muted">{unit} to give</div></>
                    ) : <div className="num font-bold whitespace-nowrap">{money(p.amountOutstanding)}</div>}
                  </td>
                )}
                <td className="py-3.5 pl-3 pr-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={STATUS_TONE[p.paymentStatus] || "neutral"}>{STATUS_LABEL[p.paymentStatus] || p.paymentStatus}</Badge>
                    {metal && <span className="whitespace-nowrap rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.06em] text-accent-strong">{unit}</span>}
                  </div>
                  {due && <div className={`mt-1.5 text-[11px] font-bold leading-snug ${due.tone}`} title={`Reminder date ${due.date.toLocaleDateString("en-IN")}`}>{due.text}</div>}
                  {action(p) && <div className="mt-2">{action(p)}</div>}
                </td>
              </tr>
            );
          })}
          {!loading && rows.length === 0 && <tr><td colSpan={cols} className="px-4 py-10 text-center text-muted">{emptyHint}</td></tr>}
        </tbody>
      </table>
    </div>
    </>
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
// The ONE supplier (store) form - Purchase History and the "+ Add new vendor"
// link in Add / Bulk Purchase both open this, so a store is never created
// through a second, thinner form.
// Section wrapper for the supplier form. Declared at module level so the inputs
// inside keep focus while typing (a component defined inside the form would be
// a new type on every keystroke and remount its children).
function FormSection({ title, hint, children }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="mb-3">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent-strong">{title}</div>
        {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
const FieldError = ({ msg }) => (msg ? <span className="text-[11px] font-semibold text-danger">{msg}</span> : null);

export function VendorForm({ vendor, onClose, onSaved }) {
  const editing = !!vendor;
  // Supplier = the store the gold comes from. Mandatory: store name, code,
  // owner + phone, and the supplier's staff (the person who brings the goods)
  // + phone. Email and GST are optional. Address and default Tunch are no
  // longer asked (Tunch is set per purchase; the backend default stays 4%).
  const [f, setF] = useState({
    name: vendor?.name || "",
    code: vendor?.code || "",
    ownerName: vendor?.ownerName || "", ownerPhone: onlyTenDigits(vendor?.ownerPhone || ""),
    // Delivery staff: any number, name + phone each. Older suppliers carry
    // their one staff contact into the list.
    staff: vendor?.staff?.length
      ? vendor.staff.map((s) => ({ id: s.id, name: s.name, phone: onlyTenDigits(s.phone || "") }))
      : [{ name: vendor?.contactPerson || "", phone: onlyTenDigits(vendor?.phone || "") }],
    address: vendor?.address || "",
    email: vendor?.email || "", gstNumber: normalizeGst(vendor?.gstNumber || ""),
    isActive: vendor ? vendor.isActive : true,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  // Clearing the field's own error as it is corrected keeps the message tied to
  // the input the admin is looking at, rather than to the last submit.
  const setField = (k, v) => { setF((p) => ({ ...p, [k]: v })); setErrors((p) => (p[k] ? { ...p, [k]: undefined } : p)); };

  const validate = () => {
    const e = {};
    if (f.name.trim().length < 2) e.name = "Store name needs at least 2 characters";
    if (!f.code.trim()) e.code = "Enter the supplier code";
    if (f.ownerName.trim().length < 2) e.ownerName = "Enter the owner's name";
    if (f.ownerPhone.length !== 10) e.ownerPhone = "Enter the owner's 10-digit mobile number";
    const filled = f.staff.filter((s) => s.name.trim() || s.phone);
    if (!filled.length) e.staff = "Add at least one delivery staff member";
    else if (filled.some((s) => s.name.trim().length < 2 || s.phone.length !== 10)) e.staff = "Every staff member needs a name and a 10-digit phone";
    if (f.email.trim() && !VENDOR_EMAIL_RE.test(f.email.trim())) e.email = "Use a valid @gmail.com address";
    if (f.gstNumber && f.gstNumber.length !== GSTIN_LEN) e.gstNumber = `A GSTIN is ${GSTIN_LEN} characters`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) { toast("Check the highlighted fields"); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(), code: f.code.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
        ownerName: f.ownerName.trim(), ownerPhone: f.ownerPhone,
        staff: f.staff.filter((s) => s.name.trim() || s.phone),
        address: f.address.trim(),
        email: f.email.trim(), gstNumber: normalizeGst(f.gstNumber),
        ...(editing ? { isActive: f.isActive } : {}),
      };
      const saved = editing ? await billingService.updateVendor(vendor.id, payload) : await billingService.createVendor(payload);
      toast(editing ? "Supplier updated" : "Supplier added");
      await onSaved(saved);
    } catch (err) { toast(err?.message || "Save failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-[600px] max-h-[92vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div><h3 className="text-base font-extrabold">{editing ? "Edit Supplier" : "Add Supplier"}</h3><p className="text-[11px] text-muted">Fields marked * are required</p></div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas" aria-label="Close">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4">
          <FormSection title="Store">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Store Full Name *</span>
              <Input value={f.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Mahalaxmi Jewellers" error={errors.name} />
              <FieldError msg={errors.name} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Supplier Code *</span>
              <Input value={f.code} onChange={(e) => setField("code", e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 20))} placeholder="e.g. MJ" error={errors.code} className="font-mono uppercase" />
              <FieldError msg={errors.code} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Owner Name *</span>
              <Input value={f.ownerName} onChange={(e) => setField("ownerName", e.target.value)} placeholder="Store owner" error={errors.ownerName} />
              <FieldError msg={errors.ownerName} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Owner Phone *</span>
              <PhoneInput value={f.ownerPhone} onValueChange={(v) => setField("ownerPhone", v)} error={!!errors.ownerPhone} />
              <FieldError msg={errors.ownerPhone} />
            </label>
          </FormSection>
          <div className="rounded-xl border border-line p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent-strong">Delivery staff *</div>
                <p className="mt-0.5 text-[11px] text-muted">The people this store sends with the jewellery. New ones are also added from a purchase.</p>
              </div>
              <button type="button" onClick={() => setField("staff", [...f.staff, { name: "", phone: "" }])}
                className="shrink-0 rounded-lg border border-accent-line bg-accent-soft px-2.5 py-1.5 text-xs font-bold text-accent-strong hover:bg-accent-line">+ Add staff</button>
            </div>
            <div className="grid gap-2.5">
              {f.staff.map((s, i) => (
                <div key={s.id || i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px] items-center gap-2">
                  <Input value={s.name} onChange={(e) => setField("staff", f.staff.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Staff name" aria-label={`Staff ${i + 1} name`} />
                  <PhoneInput value={s.phone} onValueChange={(v) => setField("staff", f.staff.map((x, j) => (j === i ? { ...x, phone: v } : x)))} />
                  <button type="button" disabled={f.staff.length === 1} onClick={() => setField("staff", f.staff.filter((_, j) => j !== i))}
                    className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:border-danger-line hover:text-danger disabled:opacity-30" aria-label={`Remove staff ${i + 1}`}>✕</button>
                </div>
              ))}
            </div>
            <FieldError msg={errors.staff} />
          </div>
          <FormSection title="Optional">
            <label className="grid gap-1.5 sm:col-span-2">
              <span className="text-xs font-bold">Address</span>
              <Input value={f.address} onChange={(e) => setField("address", e.target.value)} placeholder="Shop address" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Email <span className="font-normal text-muted">— @gmail.com</span></span>
              <Input type="email" inputMode="email" autoComplete="email" placeholder="supplier@gmail.com" value={f.email} onChange={(e) => setField("email", e.target.value)} error={errors.email} />
              <FieldError msg={errors.email} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">GST Number <span className="font-normal text-muted">— 15 characters</span></span>
              {/* Normalised on every keystroke and on paste, so a number copied
                  out of an invoice with spaces or in lowercase is accepted. */}
              <Input
                value={f.gstNumber}
                onChange={(e) => setField("gstNumber", normalizeGst(e.target.value))}
                onPaste={(e) => { e.preventDefault(); setField("gstNumber", normalizeGst(f.gstNumber + e.clipboardData.getData("text"))); }}
                placeholder="29ABCDE1234F1Z5"
                className="num uppercase tracking-[0.04em]"
                maxLength={GSTIN_LEN}
                error={errors.gstNumber}
              />
              {errors.gstNumber ? <FieldError msg={errors.gstNumber} /> : <span className="text-[11px] text-muted">{f.gstNumber.length}/{GSTIN_LEN}</span>}
            </label>
            {editing && (
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Status</span>
                <Select value={f.isActive ? "Active" : "Inactive"} onValueChange={(v) => setF({ ...f, isActive: v === "Active" })} options={["Active", "Inactive"]} />
              </label>
            )}
          </FormSection>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} className="bg-accent hover:bg-accent-strong" onClick={submit}>{saving ? "Saving…" : editing ? "Save Changes" : "Add Supplier"}</Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Record payment against an outstanding purchase                     */
/* ------------------------------------------------------------------ */
function RecordPayment(props) {
  return isMetal(props.purchase) ? <RecordMetal {...props} /> : <RecordMoney {...props} />;
}

// Metal handed back to the supplier against a METAL purchase, in grams.
function RecordMetal({ purchase, onClose, onSaved }) {
  const owed = metalOwed(purchase);
  const [f, setF] = useState({ grams: owed.toFixed(3), paymentDate: todayISO(), remarks: "" });
  const [saving, setSaving] = useState(false);
  const gramsNum = Number(f.grams) || 0;
  const over = gramsNum > owed + 0.0005;
  const valid = gramsNum > 0 && !over;
  const name = metalName(purchase.metalType);
  const submit = async () => {
    if (!valid) { toast(over ? `Only ${g3(owed)} is owed` : "Enter the grams given"); return; }
    setSaving(true);
    try {
      await billingService.recordVendorMetalPayment(purchase.id, { grams: gramsNum, paymentDate: f.paymentDate, remarks: f.remarks });
      toast(`${g3(gramsNum)} ${name} recorded`);
      await onSaved();
    } catch (err) { toast(err?.message || "Could not record the metal"); }
    finally { setSaving(false); }
  };
  const due = dueInfo(purchase);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative flex max-h-[92vh] w-full max-w-[520px] flex-col rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Give {name === "gold" ? "Gold" : "Silver"} to Supplier</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-line bg-canvas/40 p-3.5">
            <div className="flex items-center justify-between text-xs"><span className="font-bold text-muted">{purchase.vendorName}{purchase.invoiceRef ? ` · ${purchase.invoiceRef}` : ""}</span>{due && <span className={`font-bold ${due.tone}`}>{due.text}</span>}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <MiniStat label={`Owed (${name})`} value={g3(purchase.metalDueGrams)} />
              <MiniStat label="Given" value={g3(purchase.metalPaidGrams)} tone="text-emerald-700" />
              <MiniStat label="To return" value={g3(owed)} tone="text-accent" />
            </div>
            <div className="mt-2 text-[11px] text-muted">{money(purchase.purchaseAmount)} at {money(purchase.metalRatePerGram)}/g - the rupee figure is reference only.</div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">{name === "gold" ? "Gold" : "Silver"} given (g) *</span>
              <Input inputMode="decimal" value={f.grams} onChange={(e) => setF({ ...f, grams: e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1") })} error={over ? "More than owed" : undefined} className="text-right font-mono" />
              {over && <span className="text-[11px] font-semibold text-danger">Cannot exceed {g3(owed)}</span>}
            </label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Date *</span><Input type="date" value={f.paymentDate} onChange={(e) => setF({ ...f, paymentDate: e.target.value })} /></label>
            <label className="grid gap-1.5 sm:col-span-2"><span className="text-xs font-bold">Remarks</span><Input value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="e.g. 24K bar, 2 pieces" /></label>
          </div>
          <div className="rounded-lg border border-dashed border-line bg-canvas/40 p-3">
            <PreviewRow label="Still to return after this" value={g3(Math.max(0, owed - gramsNum))} strong />
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving || !valid} className="bg-accent hover:bg-accent-strong" onClick={submit}>{saving ? "Recording…" : `Record ${name === "gold" ? "Gold" : "Silver"} Given`}</Button>
        </div>
      </div>
    </div>
  );
}

function RecordMoney({ purchase, onClose, onSaved }) {
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
      toast("Supplier payment recorded");
      await onSaved();
    } catch (err) { toast(err?.message || "Could not record payment"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div className="relative flex max-h-[92vh] w-full max-w-[520px] flex-col rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-base font-extrabold">Record Supplier Payment</h3><button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
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
