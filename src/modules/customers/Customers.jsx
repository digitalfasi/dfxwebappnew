import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/_shared/ui/card";
import { Badge } from "@/_shared/ui/badge";
import { Button } from "@/_shared/ui/button";
import { SearchInput } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { customerService } from "@/modules/customers/customerService";
import { schemeService } from "@/modules/plan/scheme/schemeService";
import { enrollmentService } from "@/modules/plan/enrollment/enrollmentService";
import { useAuth } from "@/_shared/AuthContext";

// UAT-only test-customer deletion is exposed only for the designated UAT tenant
// (NEXT_PUBLIC_UAT_TENANT_ID matched against the signed-in user's tenant). This
// is a convenience gate ONLY — the backend independently enforces the same
// restriction (UAT_TENANT_SLUG) and 403s every other tenant regardless of the UI.
const UAT_TENANT_ID = (process.env.NEXT_PUBLIC_UAT_TENANT_ID || "").trim();

// Real customer data is loaded from the DFX backend via customerService.
// No mock/demo records remain as an active source or fallback.

const FILTERS = ["All Types", "Walk-in", "Scheme Customer", "Hybrid", "New"];
// The chip label the admin sees, mapped to the value the API filters on. Search,
// type and KYC all filter on the SERVER so the row count and the pager describe
// the whole matching set, not just the page that happened to be loaded.
const TYPE_PARAM = {
  "Walk-in": "WALK-IN",
  "Scheme Customer": "SCHEME CUSTOMER",
  Hybrid: "HYBRID",
  New: "NEW",
};
const KYC_FILTERS = ["All", "Verified", "Pending", "Not Submitted"];
const KYC_PARAM = { Verified: "Verified", Pending: "Pending", "Not Submitted": "Not Submitted" };
const ROWS_PER_PAGE = 20;
const TYPE_TONE = { "Walk-in": "neutral", "Scheme Customer": "info", "Hybrid": "accent", "New": "neutral" };
// Backend-derived KYC states (from kyc_state): Not Submitted | Pending Review | Verified | Rejected.
const KYC_TONE = { Verified: "success", "Pending Review": "warning", Rejected: "danger", "Not Submitted": "neutral" };
function fmtKycTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

// Indian mobile, same expression the backend enforces.
const PHONE_RE = /^[6-9]\d{9}$/;
// Stricter than "has an @": no spaces, a dot-separated TLD of 2+ letters.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
// A customer cannot be born before 1900 or in the future. The picker is bounded
// to the same window as the validator, so the two can never disagree.
const DOB_MIN = "1900-01-01";
const DOB_MAX = new Date().toISOString().slice(0, 10);
// Digits only, hard-capped at 10 — the +91 prefix is displayed, never typed.
const onlyTenDigits = (v) => v.replace(/\D/g, "").slice(0, 10);

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}
function fmtDob(dob) {
  if (!dob) return "—";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const SCHEME_OPTIONS = ["No scheme", "Gold Saver 11+1", "Silver Flexi", "Diamond Plus"];

// Meaningful empty states in place of bare "-" / "—".
const isBlank = (v) => v == null || v === "" || v === "—" || v === "-";
const orNP = (v) => (isBlank(v) ? "Not provided" : v);
const orNS = (v) => (isBlank(v) ? "Not submitted" : v);

export default function Customers() {
  const scope = useRef(null);
  usePressFeedback(scope);
  const [query, setQuery] = useState("");
  // Debounced copy of `query` — what actually goes to the API, so typing does
  // not fire a request per keystroke.
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState({ totalItems: 0, totalPages: 1 });
  const [filter, setFilter] = useState("All Types");
  const [kycFilter, setKycFilter] = useState("All");
  const [selected, setSelected] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  // Replay the original GSAP entrance once real data has loaded, so async
  // [data-motion] rows/cards/counts animate the same as the static originals.
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", dob: "", scheme: "No scheme" });
  const [errors, setErrors] = useState({});
  // Password visibility toggle — an admin typing a password FOR a customer needs
  // to be able to read back what they are about to hand over.
  const [showPwd, setShowPwd] = useState(false);
  // Counters come from the backend, NOT from customers.length: the list is
  // paginated (limit 100), so counting fetched rows froze "Total customers"
  // at exactly 100 once a tenant passed that.
  const [summary, setSummary] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", password: "" });
  const [editErrors, setEditErrors] = useState({});
  // KYC review (integrated — replaces the standalone KYC Review module).
  const [kycReview, setKycReview] = useState(null); // customer under review
  const [kycRecord, setKycRecord] = useState(null); // matched backend KYC record
  const [kycLoading, setKycLoading] = useState(false);
  const [kycError, setKycError] = useState("");
  const [kycBusy, setKycBusy] = useState(false);
  // UAT-only test-customer deletion.
  const { tenantId } = useAuth();
  const uatDeleteEnabled = !!UAT_TENANT_ID && tenantId === UAT_TENANT_ID;
  const [deleting, setDeleting] = useState(null); // customer pending permanent delete
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Admin enroll-a-customer-into-a-scheme (Customer 360 → Add scheme). One
  // customer can hold several schemes; the backend blocks only a duplicate
  // active enrollment in the SAME scheme.
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [schemeList, setSchemeList] = useState([]);
  const [schemeListLoading, setSchemeListLoading] = useState(false);
  const [chosenSchemeId, setChosenSchemeId] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);

  useEffect(() => {
    if (!selected) return;
    const onEsc = (e) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [selected]);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [res, sum] = await Promise.all([
        customerService.getCustomerPage({
          search: searchTerm,
          page,
          limit: ROWS_PER_PAGE,
          customerType: TYPE_PARAM[filter],
          kycState: KYC_PARAM[kycFilter],
        }),
        // A counter failure must not blank the table, so it degrades to the
        // page-derived figures instead of throwing.
        customerService.getSummary().catch(() => null),
      ]);
      setCustomers(res.rows);
      setPageInfo({ totalItems: res.totalItems, totalPages: res.totalPages });
      if (sum) setSummary(sum);
    } catch (err) {
      setLoadError(err?.message || "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, page, filter, kycFilter]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Debounce the search box, and send any filter change back to page 1 —
  // staying on page 4 of a now 2-page result renders an empty table.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => { setPage(1); }, [searchTerm, filter, kycFilter]);

  // Open the 360° drawer, then enrich it with real schemes/history from the
  // backend overview endpoint.
  async function openCustomer(c) {
    setSelected(c);
    try {
      const ov = await customerService.getOverview(c.id);
      if (ov) {
        setSelected((prev) =>
          prev && prev.id === c.id
            ? { ...prev, schemes: ov.schemes, history: ov.history, ...ov.profile }
            : prev
        );
      }
    } catch {
      /* drawer still shows base fields if overview fails */
    }
  }

  // Open the enroll modal for the customer in the 360 drawer; lazy-load the
  // tenant's active schemes once.
  async function openEnroll() {
    setChosenSchemeId("");
    setEnrollOpen(true);
    if (schemeList.length) return;
    setSchemeListLoading(true);
    try {
      const all = await schemeService.getSchemes();
      setSchemeList(all.filter((s) => s.isActive));
    } catch (err) {
      toast(err?.message || "Could not load schemes");
    } finally {
      setSchemeListLoading(false);
    }
  }
  async function submitEnroll() {
    if (!selected || !chosenSchemeId) { toast("Pick a scheme"); return; }
    setEnrollBusy(true);
    try {
      await enrollmentService.adminEnrollCustomer(selected.id, { schemeId: chosenSchemeId });
      const nm = selected.name;
      setEnrollOpen(false);
      await openCustomer(selected); // refresh drawer schemes/history
      await loadCustomers();        // refresh list + KPI counts
      toast(`${nm} enrolled in scheme`);
    } catch (err) {
      toast(err?.message || "Enroll failed");
    } finally {
      setEnrollBusy(false);
    }
  }

  // The API applied search, type and KYC, so the page is rendered as returned.
  // Re-filtering it here would only ever hide rows the server already matched.
  const rows = customers;

  function validate() {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.dob) e.dob = "Date of birth is required";
    else if (form.dob < DOB_MIN || form.dob > DOB_MAX) e.dob = `Date of birth must be between ${fmtDob(DOB_MIN)} and today`;
    if (!form.password || form.password.length < 8) e.password = "Min. 8 characters";
    if (form.email && !EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email, e.g. name@example.com";
    if (!form.phone.trim()) e.phone = "Phone is required";
    // Mirrors the server rule (^[6-9]\d{9}$) so a number the form accepts can
    // never be rejected by the API a second later.
    else if (!PHONE_RE.test(form.phone.replace(/\D/g, ""))) e.phone = "Enter a 10-digit Indian mobile number starting 6-9";
    return e;
  }

  async function handleCreate() {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      // scheme_id is a real backend id, unavailable until the Schemes phase, so
      // enrollment-on-create is not wired here; the customer is created as
      // walk-in/manual and can be enrolled later.
      const created = await customerService.createCustomer({
        name: form.name.trim(),
        password: form.password,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        dateOfBirth: form.dob,
      });
      setShowAdd(false);
      setForm({ name: "", phone: "", email: "", password: "", dob: "", scheme: "No scheme" });
      setErrors({});
      await loadCustomers();
      toast(`Customer created — ${created?.customer_code ?? created?.name ?? "OK"}`);
    } catch (err) {
      const msg = err?.message || "Create failed";
      if (err?.errors?.length) {
        const fe = {};
        for (const fld of err.errors) if (fld.field) fe[fld.field] = fld.message;
        if (Object.keys(fe).length) setErrors((prev) => ({ ...prev, ...fe }));
      }
      toast(msg);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(c) {
    setEditing(c);
    setEditForm({ name: c.name, phone: c.phone === "—" ? "" : c.phone, email: c.email === "—" ? "" : c.email, password: "" });
    setEditErrors({});
  }
  async function handleSaveEdit() {
    const e = {};
    if (!editForm.name.trim()) e.name = "Name is required";
    if (editForm.email && !EMAIL_RE.test(editForm.email.trim())) e.email = "Enter a valid email, e.g. name@example.com";
    if (editForm.phone && !PHONE_RE.test(editForm.phone.replace(/\D/g, ""))) e.phone = "Enter a 10-digit Indian mobile number starting 6-9";
    if (editForm.password && editForm.password.length < 8) e.password = "Min. 8 characters";
    setEditErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      await customerService.updateCustomer(editing.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
      });
      const code = editing.code;
      setEditing(null);
      await loadCustomers();
      if (selected && selected.id === editing.id) setSelected(null);
      toast(`Customer updated — ${code}`);
    } catch (err) {
      toast(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTest() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await customerService.deleteTestCustomer(deleting.id);
      const label = deleting.code || deleting.name;
      setDeleting(null);
      if (selected && selected.id === deleting.id) setSelected(null);
      await loadCustomers();
      toast(`Test customer deleted — ${label}. Mobile & email freed for reuse.`);
    } catch (err) {
      toast(err?.message || "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  // Open the integrated KYC review: pull the tenant's real KYC records and pick
  // the one for this customer (customer.id === kyc user_id). No mock data.
  async function openReview(c) {
    setKycReview(c);
    setKycRecord(null);
    setKycError("");
    setKycLoading(true);
    try {
      const records = await customerService.getKycRecords();
      const rec = records.find((r) => r.userId === c.id) ?? null;
      setKycRecord(rec);
      if (!rec) setKycError("No KYC submission found for this customer.");
    } catch (err) {
      setKycError(err?.message || "Could not load KYC record.");
    } finally {
      setKycLoading(false);
    }
  }
  function closeReview() {
    setKycReview(null);
    setKycRecord(null);
    setKycError("");
  }
  async function approveReview() {
    if (!kycRecord) return;
    setKycBusy(true);
    try {
      await customerService.approveKyc(kycRecord.id);
      const nm = kycReview?.name ?? "Customer";
      closeReview();
      await loadCustomers();
      toast(`${nm} — KYC verified`);
    } catch (err) {
      toast(err?.message || "Approve failed");
    } finally {
      setKycBusy(false);
    }
  }
  async function rejectReview() {
    if (!kycRecord) return;
    const reason = window.prompt(`Rejection reason for ${kycReview?.name ?? "customer"}:`);
    if (reason == null || !reason.trim()) return;
    setKycBusy(true);
    try {
      await customerService.rejectKyc(kycRecord.id, reason.trim());
      const nm = kycReview?.name ?? "Customer";
      closeReview();
      await loadCustomers();
      toast(`${nm} — KYC rejected`);
    } catch (err) {
      toast(err?.message || "Reject failed");
    } finally {
      setKycBusy(false);
    }
  }

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Customer Directory</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Search, filter and open any customer to see full 360° profile, schemes and history.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Add customer
        </Button>
      </div>

      {(() => {
        // Customer Types composition (Walk-in / Scheme / Hybrid / New), mirroring
        // the Purchase "Inventory Composition" layout. Counts come from the loaded
        // list — display aggregation only, no backend recompute.
        const typeComp = [
          { label: "Walk-in", count: customers.filter(c => c.type === "Walk-in").length, color: "#c9a84c" },
          { label: "Scheme", count: customers.filter(c => c.type === "Scheme Customer").length, color: "#0f9b7a" },
          { label: "Hybrid", count: customers.filter(c => c.type === "Hybrid").length, color: "#6366f1" },
          { label: "New", count: customers.filter(c => c.type === "New").length, color: "#94a3b8" },
        ];
        // Backend counts when available; the page-derived numbers only as a
        // fallback (and then they are what they are — this page's rows).
        const kycPending = summary ? summary.kycPending : customers.filter(c => c.kyc === "Pending Review").length;
        const schemeEnrolled = summary ? summary.schemeEnrolled : customers.filter(c => c.type === "Scheme Customer" || c.type === "Hybrid").length;
        const totalCustomers = summary ? summary.totalCustomers : customers.length;
        const pct = (n) => (totalCustomers > 0 ? Math.round((n / totalCustomers) * 100) : 0);

        const StatCard = ({ label, value, note, icon, tint, ring, valueClass }) => (
          <Card className="relative overflow-hidden p-4">
            <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.12]" style={{ background: tint }} />
            <div className="relative flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border" style={{ background: `${tint}1a`, borderColor: ring, color: tint }}>
                {icon}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">{label}</div>
                <div className={`num mt-0.5 text-[26px] font-extrabold leading-none ${valueClass || ""}`}>{value}</div>
                <div className="mt-1 text-xs text-faint">{note}</div>
              </div>
            </div>
          </Card>
        );

        return (
          <div className="mb-4 grid gap-3" data-motion="stat">
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Total customers" value={totalCustomers} note="All time" tint="#c9a84c" ring="rgba(201,168,76,0.35)"
                icon={<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>}
              />
              <StatCard
                label="KYC pending" value={kycPending} note="Needs review" tint={kycPending > 0 ? "#dc2626" : "#0f9b7a"} ring={kycPending > 0 ? "rgba(220,38,38,0.3)" : "rgba(15,155,122,0.3)"}
                valueClass={kycPending > 0 ? "text-danger" : ""}
                icon={<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6" /></svg>}
              />
              <StatCard
                label="Scheme enrolled" value={schemeEnrolled} note="With live schemes" tint="#0f9b7a" ring="rgba(15,155,122,0.3)"
                icon={<svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="5" /><circle cx="16" cy="13" r="4" /><path d="M8 13c1.5 1.5 3.5 1.5 5 0" /></svg>}
              />
            </div>

            {/* Customer Types — share-of-base composition with bars. */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-[0.07em] text-muted">Customer Types</div>
                <div className="text-[11px] text-muted">Share of {totalCustomers.toLocaleString("en-IN")} customers</div>
              </div>
              {/* Single stacked bar — the whole base at a glance. */}
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-line-soft">
                {typeComp.map(({ label, count, color }) => (
                  count > 0 ? <div key={label} style={{ width: `${pct(count)}%`, background: color }} title={`${label}: ${count}`} /> : null
                ))}
              </div>
              <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
                {typeComp.map(({ label, count, color }) => (
                  <div key={label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-bold">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />{label}
                      </span>
                      <span className="num font-mono text-xs font-semibold tabular-nums text-muted">{count} · {pct(count)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line-soft">
                      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct(count)}%`, background: color }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        );
      })()}

      <div data-motion="toolbar" className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput className="w-full max-w-sm" placeholder="Search name, code, contact..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search customers" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
            {FILTERS.map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-all active:scale-95 ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-surface text-muted hover:border-accent-line hover:text-accent"}`}>{f}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-muted">KYC:</span>
          {KYC_FILTERS.map(k => (
            <button key={k} onClick={() => setKycFilter(k)} className={`rounded-full border px-3 py-1 font-semibold ${kycFilter === k ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-white text-muted hover:border-line"}`}>{k}</button>
          ))}
          {(kycFilter !== "All" || filter !== "All Types" || query) && (
            <button onClick={() => { setQuery(""); setFilter("All Types"); setKycFilter("All"); }} className="ml-2 font-bold text-accent underline">Clear</button>
          )}
        </div>
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardContent className="overflow-x-auto px-0 pb-0">
          <table className="w-full min-w-[1060px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                <th className="px-6 py-3">Customer</th><th className="px-4 py-3 whitespace-nowrap">Code</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">KYC</th><th className="px-4 py-3 whitespace-nowrap">Member Since</th><th className="px-4 py-3 text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.code} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                  <td className="px-6 py-3.5">
                    <button onClick={() => openCustomer(c)} className="flex items-center gap-3 text-left">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-extrabold text-accent-strong">{c.name[0]}</span>
                      <span>
                        <span className="font-bold hover:text-accent hover:underline">{c.name}</span>
                        <span className="block text-xs text-muted">{(() => {
                          const parts = [];
                          const age = ageFromDob(c.dob);
                          if (c.dob && fmtDob(c.dob) !== "—") parts.push(fmtDob(c.dob));
                          if (age != null) parts.push(`${age}y`);
                          if (c.city) parts.push(c.city);
                          return parts.length ? parts.join(" · ") : "Not provided";
                        })()}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold whitespace-nowrap">{c.code}</td>
                  <td className="px-4 py-3.5"><div className="max-w-[220px] truncate text-[13px] leading-tight">{orNP(c.email)}</div><div className="num text-xs text-muted">{orNP(c.phone)}</div></td>
                  <td className="px-4 py-3.5"><Badge tone={TYPE_TONE[c.type]}>{c.type}</Badge></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <Badge tone={KYC_TONE[c.kyc] ?? "neutral"} dot>{c.kyc}</Badge>
                      {(c.kyc === "Pending Review" || c.kyc === "Rejected") && (
                        <button onClick={() => openReview(c)} className="rounded-lg border border-accent-line bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-strong hover:bg-accent-line" aria-label={`Review KYC for ${c.name}`}>Review</button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-muted whitespace-nowrap">{c.since}</td>
                  <td className="py-3.5 pr-6 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => openCustomer(c)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent" aria-label={`View ${c.name}`} title="View 360">
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                      </button>
                      <button onClick={() => openEdit(c)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-accent-line hover:bg-accent-soft hover:text-accent" aria-label={`Edit ${c.name}`}>
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                      </button>
                      {uatDeleteEnabled && (
                        <button onClick={() => setDeleting(c)} className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:border-danger hover:bg-danger/10 hover:text-danger" aria-label={`Delete test customer ${c.name}`} title="Delete Test Customer (UAT)">
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="px-6 py-14 text-center"><div className="font-bold">Loading…</div></div>
          )}
          {!loading && loadError && (
            <div className="px-6 py-14 text-center"><div className="font-bold text-danger">Couldn’t load customers</div><p className="mt-1 text-sm text-muted">{loadError}</p><Button size="sm" variant="outline" className="mt-3" onClick={loadCustomers}>Retry</Button></div>
          )}
          {!loading && !loadError && rows.length === 0 && (
            <div className="px-6 py-14 text-center"><div className="font-bold">No customers found</div><p className="mt-1 text-sm text-muted">Try a different search or filter.</p></div>
          )}
        </CardContent>
      </Card>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>
          {pageInfo.totalItems === 0
            ? "No customers match"
            : `Showing ${(page - 1) * ROWS_PER_PAGE + 1}–${Math.min(page * ROWS_PER_PAGE, pageInfo.totalItems)} of ${pageInfo.totalItems}`}
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline">Click name or eye to open 360° view</span>
          {pageInfo.totalPages > 1 && (
            <span className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <span className="num px-1">Page {page} of {pageInfo.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= pageInfo.totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </span>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setShowAdd(false)} aria-label="Close modal" />
          <div className="relative w-full max-w-[520px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-lg font-extrabold">Add Customer</h3>
              <button onClick={() => setShowAdd(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Name<span className="text-danger">*</span> <span className="font-normal text-muted">— Customer&apos;s full name</span></span>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ramesh Kumar" className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.name ? "border-danger focus:border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />
                {errors.name && <span className="text-xs font-semibold text-danger">{errors.name}</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Phone<span className="text-danger">*</span> <span className="font-normal text-muted">— 10-digit mobile number</span></span>
                <div className={`flex h-10 items-stretch overflow-hidden rounded-xl border bg-surface transition ${errors.phone ? "border-danger" : "border-line focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`}>
                  <span className="num grid w-12 shrink-0 place-items-center border-r border-line-soft bg-canvas/60 text-sm font-bold text-muted" aria-hidden="true">+91</span>
                  <input
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: onlyTenDigits(e.target.value) })}
                    inputMode="numeric"
                    autoComplete="tel-national"
                    maxLength={10}
                    aria-label="10-digit mobile number, country code +91"
                    placeholder="98765 43210"
                    className="num min-w-0 flex-1 bg-transparent px-3.5 text-sm tracking-[0.02em] outline-none"
                  />
                </div>
                {errors.phone && <span className="text-xs font-semibold text-danger">{errors.phone}</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Date of Birth<span className="text-danger">*</span> <span className="font-normal text-muted">— Required</span></span>
                <input type="date" value={form.dob} min={DOB_MIN} max={DOB_MAX} onChange={e => setForm({ ...form, dob: e.target.value })} className={`num h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.dob ? "border-danger focus:border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />
                {!errors.dob && <span className="text-[11px] text-muted">Any date from 1900 up to today.</span>}
                {errors.dob && <span className="text-xs font-semibold text-danger">{errors.dob}</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Email <span className="font-normal text-muted">— Optional</span></span>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  onBlur={e => {
                    // Validate on blur, not per keystroke: flagging "invalid"
                    // while someone is still typing the domain is noise.
                    const v = e.target.value.trim();
                    setErrors(prev => ({ ...prev, email: v && !EMAIL_RE.test(v) ? "Enter a valid email, e.g. name@example.com" : undefined }));
                  }}
                  autoComplete="email"
                  placeholder="customer@example.com"
                  className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.email ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`}
                />
                {errors.email && <span className="text-xs font-semibold text-danger">{errors.email}</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Initial Password<span className="text-danger">*</span> <span className="font-normal text-muted">— Min. 8 characters</span></span>
                <div className={`flex h-10 items-stretch overflow-hidden rounded-xl border bg-surface transition ${errors.password ? "border-danger" : "border-line focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`}>
                  <input
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className="min-w-0 flex-1 bg-transparent px-3.5 text-sm outline-none"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)} aria-label={showPwd ? "Hide password" : "Show password"} className="shrink-0 border-l border-line-soft px-3 text-[11px] font-bold text-muted transition-colors hover:bg-canvas/60 hover:text-ink">
                    {showPwd ? "Hide" : "Show"}
                  </button>
                </div>
                {/* Live requirement feedback, so the rule is visible as it is met
                    rather than only after pressing Save. */}
                {errors.password ? (
                  <span className="text-xs font-semibold text-danger">{errors.password}</span>
                ) : form.password ? (
                  <span className={`text-[11px] font-semibold ${form.password.length >= 8 ? "text-emerald-700" : "text-muted"}`}>
                    {form.password.length >= 8 ? "Meets the 8-character minimum." : `${8 - form.password.length} more character${8 - form.password.length === 1 ? "" : "s"} needed.`}
                  </span>
                ) : null}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Enroll in Scheme <span className="font-normal text-muted">(Optional) — No scheme</span></span>
                <Select value={form.scheme} onValueChange={(v) => setForm({ ...form, scheme: v })} options={SCHEME_OPTIONS} />
              </label>
              <p className="rounded-xl border border-line-soft bg-canvas/60 p-3 text-xs leading-relaxed text-muted">Note: Phone is required. Leave email blank for a walk-in customer — a Customer ID is generated either way.</p>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={handleCreate}>{saving ? "Creating…" : "Create Customer"}</Button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setEditing(null)} aria-label="Close modal" />
          <div className="relative w-full max-w-[520px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-lg font-extrabold">Edit Customer</h3>
              <button onClick={() => setEditing(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="grid gap-1.5">
                <span className="text-xs font-bold">Customer ID</span>
                <div className="rounded-xl border border-line bg-canvas/60 px-3.5 py-2.5 font-mono text-sm font-semibold">{editing.code}</div>
              </div>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Name<span className="text-danger">*</span> — {editing.name}</span>
                <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${editErrors.name ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />
                {editErrors.name && <span className="text-xs font-semibold text-danger">{editErrors.name}</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Phone</span>
                <div className={`flex h-10 items-stretch overflow-hidden rounded-xl border bg-surface transition ${editErrors.phone ? "border-danger" : "border-line focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`}>
                  <span className="num grid w-12 shrink-0 place-items-center border-r border-line-soft bg-canvas/60 text-sm font-bold text-muted" aria-hidden="true">+91</span>
                  <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: onlyTenDigits(e.target.value) })} inputMode="numeric" maxLength={10} aria-label="10-digit mobile number, country code +91" placeholder="98765 43210" className="num min-w-0 flex-1 bg-transparent px-3.5 text-sm outline-none" />
                </div>
                {editErrors.phone && <span className="text-xs font-semibold text-danger">{editErrors.phone}</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Email</span>
                <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${editErrors.email ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />
                {editErrors.email && <span className="text-xs font-semibold text-danger">{editErrors.email}</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">New Password <span className="font-normal text-muted">— Leave blank to keep current password</span></span>
                <input type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="••••••••" className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${editErrors.password ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />
                {editErrors.password && <span className="text-xs font-semibold text-danger">{editErrors.password}</span>}
              </label>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={handleSaveEdit}>{saving ? "Saving…" : "Save Changes"}</Button>
            </div>
          </div>
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => !deleteBusy && setDeleting(null)} aria-label="Close modal" />
          <div className="relative w-full max-w-[460px] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-lg font-extrabold">Delete Test Customer?</h3>
              <button onClick={() => !deleteBusy && setDeleting(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-muted">
                This permanently removes this UAT customer&apos;s test data, including their mobile number and email, so they can be reused for testing.
              </p>
              <div className="grid gap-2.5 rounded-xl border border-line bg-canvas/40 p-4 text-sm">
                <div><div className="text-xs text-muted">Customer</div><div className="font-semibold">{deleting.name}</div></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted">Mobile</div><div className="num font-semibold">{orNP(deleting.phone)}</div></div>
                  <div><div className="text-xs text-muted">Email</div><div className="font-semibold break-all">{orNP(deleting.email)}</div></div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="danger" size="sm" disabled={deleteBusy} onClick={handleDeleteTest}>{deleteBusy ? "Deleting…" : "Delete Test Customer"}</Button>
            </div>
          </div>
        </div>
      )}

      {kycReview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={closeReview} aria-label="Close modal" />
          <div className="relative w-full max-w-[520px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h3 className="text-lg font-extrabold">KYC Review</h3>
                <div className="font-mono text-xs text-muted">{kycReview.name} · {kycReview.code}</div>
              </div>
              <button onClick={closeReview} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {kycLoading && <div className="py-10 text-center font-bold">Loading…</div>}
              {!kycLoading && kycError && (
                <div className="py-10 text-center">
                  <div className="font-bold text-danger">{kycError}</div>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => openReview(kycReview)}>Retry</Button>
                </div>
              )}
              {!kycLoading && !kycError && kycRecord && (
                <div className="grid gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={KYC_TONE[kycReview.kyc] ?? "neutral"} dot>{kycReview.kyc}</Badge>
                  </div>
                  <div className="grid gap-3 rounded-xl border border-line bg-canvas/40 p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-xs text-muted">Document Type</div><div className="font-semibold">{kycRecord.docType || "—"}</div></div>
                      <div><div className="text-xs text-muted">Document Number</div><div className="num font-semibold break-all">{kycRecord.docNumber || "—"}</div></div>
                    </div>
                    <div><div className="text-xs text-muted">Submitted</div><div className="font-semibold">{fmtKycTime(kycRecord.createdAt)}</div></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-xs text-muted">Email</div><div className="font-semibold break-all">{kycRecord.email || "—"}</div></div>
                      <div><div className="text-xs text-muted">Phone</div><div className="num font-semibold">{kycRecord.phone || "—"}</div></div>
                    </div>
                    <div><div className="text-xs text-muted">Verification Status</div><div className="font-semibold">{kycRecord.status}</div></div>
                    {kycRecord.rejectionReason && (
                      <div><div className="text-xs text-muted">Rejection Reason</div><div className="font-semibold text-danger">{kycRecord.rejectionReason}</div></div>
                    )}
                  </div>
                  {kycRecord.status === "Verified" && (
                    <p className="rounded-xl border border-line-soft bg-canvas/60 p-3 text-xs text-muted">This customer&apos;s identity is already verified.</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={closeReview}>Close</Button>
              <Button size="sm" variant="danger" disabled={kycBusy || !kycRecord} onClick={rejectReview}>{kycBusy ? "Working…" : "Reject"}</Button>
              <Button size="sm" disabled={kycBusy || !kycRecord || kycRecord?.status === "Verified"} onClick={approveReview}>{kycBusy ? "Working…" : "Approve"}</Button>
            </div>
          </div>
        </div>
      )}

      {enrollOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => !enrollBusy && setEnrollOpen(false)} aria-label="Close modal" />
          <div className="relative flex w-full max-w-[460px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-lg font-extrabold">Enroll in Scheme</h3>
              <button onClick={() => !enrollBusy && setEnrollOpen(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <div className="text-sm text-muted">{selected?.name} · <span className="font-mono">{selected?.code}</span></div>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Scheme<span className="text-danger">*</span></span>
                {schemeListLoading ? (
                  <div className="rounded-xl border border-line px-3.5 py-2.5 text-sm text-muted">Loading schemes…</div>
                ) : schemeList.length === 0 ? (
                  <div className="rounded-xl border border-line px-3.5 py-2.5 text-sm text-muted">No active schemes available.</div>
                ) : (
                  <Select value={chosenSchemeId} onValueChange={setChosenSchemeId} options={schemeList.map((s) => ({ value: s.id, label: s.name }))} placeholder="Select a scheme…" />
                )}
              </label>
              <p className="rounded-xl border border-line-soft bg-canvas/60 p-3 text-xs leading-relaxed text-muted">Enrolls on the scheme&apos;s base terms from today. A customer can hold several schemes; the same scheme can&apos;t be active twice.</p>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" disabled={enrollBusy} onClick={() => setEnrollOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={enrollBusy || !chosenSchemeId} onClick={submitEnroll}>{enrollBusy ? "Enrolling…" : "Enroll"}</Button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <button className="flex-1 bg-ink/40 backdrop-blur-[2px]" onClick={() => setSelected(null)} aria-label="Close drawer" />
          <div className="flex h-full w-full max-w-[520px] flex-col overflow-hidden border-l border-line bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div className="text-xs font-bold uppercase tracking-widest text-muted">Customer 360</div>
              <button onClick={() => setSelected(null)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="bg-accent-soft/60 px-6 py-6">
                <div className="flex gap-4">
                  <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-lg font-extrabold text-accent-strong shadow-sm border border-accent-line">{selected.name.split(" ").map(n => n[0]).join("").slice(0, 2)}</span>
                  <div className="min-w-0">
                    <div className="text-lg font-extrabold leading-tight">{selected.name}</div>
                    <div className="font-mono text-xs text-muted">{selected.code} · {selected.type}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={KYC_TONE[selected.kyc] ?? "neutral"} dot>{selected.kyc}</Badge>
                      {selected.city && <Badge tone="neutral">{selected.city}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl bg-white border border-accent-line p-3"><div className="text-[11px] font-bold uppercase tracking-wider text-muted">DOB</div><div className="mt-0.5 text-sm font-bold">{fmtDob(selected.dob)}</div><div className="text-xs text-muted">{ageFromDob(selected.dob) != null ? `${ageFromDob(selected.dob)} years` : "—"}</div></div>
                  <div className="rounded-xl bg-white border border-line p-3"><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Member Since</div><div className="mt-0.5 text-sm font-bold">{selected.since}</div><div className="text-xs text-muted">{selected.type}</div></div>
                  <div className="rounded-xl bg-white border border-line p-3"><div className="text-[11px] font-bold uppercase tracking-wider text-muted">Schemes</div><div className="mt-0.5 text-sm font-bold">{selected.schemes.length || 0}</div><div className="text-xs text-muted">{selected.schemes.length ? "Active" : "No active schemes"}</div></div>
                </div>
              </div>

              <div className="space-y-5 p-6">
                <section>
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Customer Information</h4>
                  <div className="mt-3 grid gap-3 rounded-xl border border-line bg-canvas/40 p-4 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-xs text-muted">Phone</div><div className="num font-semibold">{orNP(selected.phone)}</div></div>
                      <div><div className="text-xs text-muted">Gender <span className="font-normal text-faint">· optional</span></div><div className="font-semibold">{orNP(selected.gender)}</div></div>
                    </div>
                    <div><div className="text-xs text-muted">Email</div><div className="font-semibold break-all">{orNP(selected.email)}</div></div>
                    <div><div className="text-xs text-muted">Address <span className="font-normal text-faint">· optional</span></div><div className="font-semibold leading-snug">{orNP(selected.address)}</div></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><div className="text-xs text-muted">ID Proof <span className="font-normal text-faint">· optional</span></div><div className="font-semibold">{isBlank(selected.idType) && isBlank(selected.idNo) ? "Not submitted" : `${orNS(selected.idType)} · ${orNS(selected.idNo)}`}</div></div>
                      <div><div className="text-xs text-muted">Occupation <span className="font-normal text-faint">· optional</span></div><div className="font-semibold">{orNP(selected.occupation)}</div></div>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Scheme Information</h4>
                    <button onClick={openEnroll} className="rounded-lg border border-accent-line bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent-strong hover:bg-accent-line">+ Add scheme</button>
                  </div>
                  {selected.schemes.length ? (
                    <div className="mt-3 grid gap-3">
                      {selected.schemes.map(s => (
                        <div key={s.code} className="rounded-xl border border-accent-line bg-accent-soft/40 p-4">
                          <div className="flex items-start justify-between">
                            <div><div className="font-bold">{s.name}</div><div className="font-mono text-xs text-muted">{s.code} · Enrolled {new Date(s.enrolled).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div></div>
                            <Badge tone="success" dot>{s.status}</Badge>
                          </div>
                          <div className="mt-3">
                            <div className="flex justify-between text-xs font-semibold text-muted"><span>Paid {s.paid} / {s.total}</span><span>₹{s.installment.toLocaleString()}/mo</span></div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white border border-accent-line"><div className="h-full bg-accent" style={{ width: `${(s.paid / s.total) * 100}%` }} /></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-dashed border-line bg-canvas/30 p-6 text-center text-sm text-muted">
                      No active schemes yet.
                      <div className="mt-1 text-xs">Use <span className="font-bold text-ink">+ Add scheme</span> above to enroll this customer.</div>
                    </div>
                  )}
                </section>

                <section>
                  <h4 className="text-xs font-extrabold uppercase tracking-widest text-ink">Customer History</h4>
                  {!selected.history?.length ? (
                    <div className="mt-3 rounded-xl border border-dashed border-line bg-canvas/30 p-6 text-center text-sm text-muted">No customer history yet.</div>
                  ) : (
                  <div className="mt-3 relative pl-6">
                    <div className="absolute left-1.5 top-2 bottom-2 w-px bg-line" />
                    <div className="grid gap-3">
                      {selected.history.map((h, i) => (
                        <div key={i} className="relative rounded-xl border border-line bg-white p-3">
                          <span className={`absolute -left-[22px] top-4 h-2.5 w-2.5 rounded-full border-2 border-white shadow ${h.action.includes("Payment") ? "bg-accent" : h.action.includes("KYC") ? "bg-info" : "bg-ink"}`} />
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">{h.action}</span>
                            <span className="text-xs text-muted">{h.date}</span>
                          </div>
                          <div className="mt-0.5 text-sm text-muted">{h.meta} {h.amount ? `· ₹${h.amount.toLocaleString()}` : ""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  )}
                </section>
              </div>
            </div>
            <div className="border-t border-line p-4 flex gap-2">
              <Button size="sm" className="flex-1" variant="outline" onClick={() => openEdit(selected)}>Edit profile</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
