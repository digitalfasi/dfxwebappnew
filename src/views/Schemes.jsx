import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { formatINR } from "../lib/utils";
import { schemeService, SCHEME_TYPES } from "../services/schemeService";

// Real schemes are loaded from the DFX backend via schemeService.
// No mock/demo schemes remain as an active source or fallback.

export default function Schemes() {
  const scope = useRef(null);
  usePressFeedback(scope);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [show, setShow] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create, id = edit
  const [busyId, setBusyId] = useState(null); // scheme id mid deactivate/reactivate
  const [form, setForm] = useState({ title: "", description: "", type: "MONTHLY", duration: "11", amount: "1000", bonus: "" });
  const [tiers, setTiers] = useState([]);
  const [errors, setErrors] = useState({});

  // Multi-tier support — matches the old DFX scheme form (each tier has its own
  // monthly amount + duration; bonus_percentage defaults to 0 per contract).
  const addTier = () => setTiers((t) => [...t, { monthlyAmount: "1000", durationMonths: "11" }]);
  const removeTier = (i) => setTiers((t) => t.filter((_, x) => x !== i));
  const updateTier = (i, patch) => setTiers((t) => t.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const loadSchemes = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setSchemes(await schemeService.getSchemes());
    } catch (err) {
      setLoadError(err?.message || "Could not load schemes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchemes();
  }, [loadSchemes]);

  function openCreate() {
    setEditingId(null);
    setForm({ title: "", description: "", type: "MONTHLY", duration: "11", amount: "1000", bonus: "" });
    setTiers([]);
    setErrors({});
    setShow(true);
  }

  function openEdit(s) {
    // Prefill from the raw backend fields carried on the card (schemeService.mapCard).
    setEditingId(s.id);
    setForm({
      title: s.name || "",
      description: s.description || "",
      type: s.schemeType || "MONTHLY",
      duration: String(s.durationMonths ?? ""),
      amount: String(s.monthlyAmount ?? ""),
      bonus: s.bonusDescription || "",
    });
    setTiers([]); // Tier editing is out of scope for this task; scalar fields only.
    setErrors({});
    setShow(true);
  }

  async function handleSave() {
    const e = {};
    if (!form.title.trim()) e.title = "Title is required";
    if (!form.duration || Number(form.duration) <= 0) e.duration = "Enter valid months";
    if (!form.amount || Number(form.amount) <= 0) e.amount = "Enter valid amount";
    // Tiers are only collected on create; edit updates scalar fields only.
    const cleanTiers = [];
    if (!editingId) {
      const seen = new Set();
      for (const t of tiers) {
        const ma = Number(t.monthlyAmount);
        const dm = Number(t.durationMonths);
        if (!ma || ma <= 0 || !dm || dm <= 0) { e.tiers = "Each tier needs a valid amount and duration"; break; }
        const key = `${ma}-${dm}`;
        if (seen.has(key)) { e.tiers = "Duplicate tier (same amount and duration)"; break; }
        seen.add(key);
        cleanTiers.push({ monthlyAmount: ma, durationMonths: dm });
      }
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      if (editingId) {
        const updated = await schemeService.updateScheme(editingId, {
          name: form.title.trim(),
          description: form.description.trim(),
          schemeType: form.type,
          monthlyAmount: Number(form.amount),
          durationMonths: Number(form.duration),
          bonusDescription: form.bonus.trim(),
        });
        setShow(false);
        setEditingId(null);
        setErrors({});
        await loadSchemes();
        toast(`Scheme updated — ${updated?.name ?? form.title.trim()}`);
      } else {
        const created = await schemeService.createScheme({
          name: form.title.trim(),
          description: form.description.trim() || undefined,
          schemeType: form.type,
          monthlyAmount: Number(form.amount),
          durationMonths: Number(form.duration),
          bonusDescription: form.bonus.trim() || undefined,
          tiers: cleanTiers,
        });
        setShow(false);
        setForm({ title: "", description: "", duration: "11", amount: "1000", bonus: "" });
        setTiers([]);
        setErrors({});
        await loadSchemes();
        toast(`Scheme created — ${created?.name ?? form.title.trim()}`);
      }
    } catch (err) {
      const fe = {};
      if (err?.errors?.length) for (const f of err.errors) if (f.field) fe[f.field] = f.message;
      if (Object.keys(fe).length) setErrors((prev) => ({ ...prev, ...fe }));
      toast(err?.message || (editingId ? "Update failed" : "Create failed"));
    } finally {
      setSaving(false);
    }
  }

  // Deactivate = backend soft-delete (DELETE /schemes/{id} sets is_active=false).
  // History-safe: enrollments/payments referencing the scheme are preserved.
  async function handleDeactivate(s) {
    if (!window.confirm(`Deactivate "${s.name}"? It will stop being offered to new customers. Existing enrollments and history are kept.`)) return;
    setBusyId(s.id);
    try {
      await schemeService.deactivateScheme(s.id);
      await loadSchemes();
      toast(`Scheme deactivated — ${s.name}`);
    } catch (err) {
      toast(err?.message || "Deactivate failed");
    } finally {
      setBusyId(null);
    }
  }

  // Reactivate via the real update endpoint (PUT is_active=true).
  async function handleReactivate(s) {
    setBusyId(s.id);
    try {
      await schemeService.updateScheme(s.id, { isActive: true });
      await loadSchemes();
      toast(`Scheme reactivated — ${s.name}`);
    } catch (err) {
      toast(err?.message || "Reactivate failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Schemes</h2>
          <p className="mt-1 max-w-[55ch] text-sm text-muted">
            Installment plans, maturity benefits, and enrollment tiers for your store.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New scheme
        </Button>
      </div>

      {loading && <div className="mb-6 py-14 text-center text-sm font-bold text-muted">Loading…</div>}
      {!loading && loadError && (
        <div className="mb-6 py-14 text-center">
          <div className="font-bold text-danger">Couldn’t load schemes</div>
          <p className="mt-1 text-sm text-muted">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadSchemes}>Retry</Button>
        </div>
      )}
      {!loading && !loadError && schemes.length === 0 && (
        <div className="mb-6 py-14 text-center"><div className="font-bold">No schemes yet</div><p className="mt-1 text-sm text-muted">Create your first gold savings scheme.</p></div>
      )}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {schemes.map((s) => (
          <Card key={s.id} data-motion="stat" className="flex flex-col p-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-accent-strong">{s.tier}</span>
              <Badge tone={s.status === "Active" ? "success" : "warning"} dot={s.status === "Active"}>{s.status}</Badge>
            </div>
            <h3 className="mt-1 text-[15px] font-bold tracking-tight">{s.name}</h3>
            <div className="num mt-3 text-2xl font-extrabold tracking-tight">
              {formatINR(s.amount)}
              <span className="ml-1 text-xs font-semibold text-muted">/ mo</span>
            </div>
            <div className="mt-auto border-t border-dashed border-line pt-3 text-xs text-muted">
              <div>{s.perk} · {s.tenure}</div>
              <div className="mt-1 font-bold text-ink-soft">
                {s.enrolled ? `${s.enrolled} enrolled` : "Not yet published"}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <Button variant="outline" size="sm" className="flex-1" disabled={busyId === s.id} onClick={() => openEdit(s)}>Edit</Button>
              {s.status === "Active" ? (
                <Button variant="outline" size="sm" className="flex-1 text-danger hover:border-danger" disabled={busyId === s.id} onClick={() => handleDeactivate(s)}>
                  {busyId === s.id ? "…" : "Deactivate"}
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="flex-1" disabled={busyId === s.id} onClick={() => handleReactivate(s)}>
                  {busyId === s.id ? "…" : "Reactivate"}
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card data-motion="reveal" className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Recent enrollments</CardTitle>
            <CardDescription>Customers who joined a scheme recently</CardDescription>
          </div>
          <Badge tone="neutral">—</Badge>
        </CardHeader>
        <CardContent className="px-6 py-10 text-center">
          {/* Enrollment data belongs to Scheme Management (a later task). No mock
              rows are shown here — this stays an honest neutral state until the
              real enrollments feed is wired in. */}
          <div className="font-bold">Enrollments appear in Scheme Management</div>
          <p className="mt-1 text-sm text-muted">Recent enrollment activity will be shown here once available.</p>
        </CardContent>
      </Card>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setShow(false)} aria-label="Close" />
          <div className="relative w-full max-w-[520px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-lg font-extrabold">{editingId ? "Edit Gold Savings Scheme" : "Create New Gold Savings Scheme"}</h3><button onClick={() => setShow(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <label className="grid gap-1.5"><span className="text-xs font-bold">Scheme Title<span className="text-danger">*</span> — e.g. Festival Special Plan</span><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Festival Special Plan" className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.title ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.title && <span className="text-xs font-semibold text-danger">{errors.title}</span>}</label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Description — Short description shown to customers</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description..." rows={2} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Scheme Type<span className="text-danger">*</span> — how contributions convert to gold</span><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]">{SCHEME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select><span className="text-[11px] text-muted">{form.type === "FIXED_GOLD_RATE" ? "Gold rate is locked at enrollment; contributions convert at that locked rate." : form.type === "FLEXIBLE_DIGI_GOLD" ? "Contributions convert to gold at the rate on the contribution date." : "Standard monthly savings plan."}</span></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Duration (Months)<span className="text-danger">*</span> — 11</span><input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.duration ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.duration && <span className="text-xs font-semibold text-danger">{errors.duration}</span>}</label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Monthly Amount (₹)<span className="text-danger">*</span> — 1000</span><input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.amount ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.amount && <span className="text-xs font-semibold text-danger">{errors.amount}</span>}</label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Bonus Description — e.g. 8% bonus on maturity</span><input value={form.bonus} onChange={e => setForm({ ...form, bonus: e.target.value })} placeholder="8% bonus on maturity" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>
              {!editingId && <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Tiers — additional monthly amount / duration options</span>
                  <Button variant="outline" size="sm" onClick={addTier}>Add tier</Button>
                </div>
                {errors.tiers && <span className="text-xs font-semibold text-danger">{errors.tiers}</span>}
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <label className="grid flex-1 gap-1.5"><span className="text-[11px] font-bold text-muted">Monthly (₹)</span><input type="number" value={t.monthlyAmount} onChange={e => updateTier(i, { monthlyAmount: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>
                    <label className="grid flex-1 gap-1.5"><span className="text-[11px] font-bold text-muted">Duration (months)</span><input type="number" value={t.durationMonths} onChange={e => updateTier(i, { durationMonths: e.target.value })} className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>
                    <button type="button" onClick={() => removeTier(i)} aria-label="Remove tier" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-muted hover:border-danger hover:text-danger">✕</button>
                  </div>
                ))}
              </div>}
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setShow(false)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={handleSave}>{saving ? (editingId ? "Saving…" : "Creating…") : (editingId ? "Save Changes" : "Create Scheme")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
