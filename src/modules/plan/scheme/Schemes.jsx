import { useRef, useState, useEffect, useCallback } from "react";
import { Card } from "@/_shared/ui/card";
import { Badge } from "@/_shared/ui/badge";
import { Button } from "@/_shared/ui/button";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { Select } from "@/_shared/ui/select";
import { formatINR, money } from "@/_shared/utils";
import { schemeService, SCHEME_TYPES } from "@/modules/plan/scheme/schemeService";

// Business limits, mirrored from app/modules/plan/scheme/schema.py. An
// instalment plan (MONTHLY / FIXED_GOLD_RATE) runs at most 11 months at
// Rs 1,000-15,000; a Flexible Digi Gold wallet takes Rs 500-1,00,000 per
// deposit with no month coverage.
const MAX_DURATION_MONTHS = 11;
const MONTHLY_MIN = 1000;
const MONTHLY_MAX = 15000;
const DIGI_MIN = 500;
const DIGI_MAX = 100000;

// bonus_description stays a string in the contract; the UI captures the
// percentage and composes the sentence, so the stored value is predictable
// instead of whatever free text was typed.
const bonusPctToText = (pct) => (pct === "" || pct == null ? "" : `${Number(pct)}% bonus on maturity`);
const bonusTextToPct = (text) => {
  const m = /(\d{1,2})\s*%/.exec(text || "");
  return m ? m[1] : "";
};

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
  // Scheme pending deactivation, shown in the app's own confirm modal. A
  // browser confirm() leaks the host name into a customer-facing console and
  // cannot carry the consequence text a destructive action needs.
  const [confirming, setConfirming] = useState(null);
  // Scheme pending PERMANENT deletion. Separate state from `confirming` because
  // the two actions are not interchangeable: deactivating is reversible and
  // keeps every record, deleting removes the row and is refused by the backend
  // the moment anything references it.
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null); // scheme id mid deactivate/reactivate
  const [form, setForm] = useState({ title: "", description: "", type: "MONTHLY", duration: "11", amount: "1000", bonusPct: "" });
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
    setForm({ title: "", description: "", type: "MONTHLY", duration: "11", amount: "1000", bonusPct: "" });
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
      bonusPct: bonusTextToPct(s.bonusDescription),
    });
    // Prefill the tiers the admin already selected (active tiers), so editing a
    // MONTHLY scheme shows them instead of an empty list.
    setTiers((s.tiers ?? [])
      .filter((t) => t.isActive)
      .map((t) => ({ monthlyAmount: String(t.monthlyAmount ?? ""), durationMonths: String(t.durationMonths ?? "") })));
    setErrors({});
    setShow(true);
  }

  async function handleSave() {
    const e = {};
    if (!form.title.trim()) e.title = "Title is required";
    // Limits mirror the server rules in plan/scheme/schema.py — an instalment
    // plan runs at most 11 months at Rs 1,000-15,000; a Digi Gold wallet takes
    // Rs 500-1,00,000 per deposit and has no coverage cap.
    const isWallet = form.type === "FLEXIBLE_DIGI_GOLD";
    const dur = Number(form.duration);
    const amt = Number(form.amount);
    if (!form.duration || dur <= 0) e.duration = "Enter valid months";
    else if (!isWallet && dur > MAX_DURATION_MONTHS) e.duration = `Duration cannot exceed ${MAX_DURATION_MONTHS} months`;
    // A wallet's amount is never typed (the field is read-only), so it cannot
    // be wrong. The contract still needs a figure: keep whatever the scheme
    // already has when editing, else the minimum deposit.
    const walletAmount = amt >= DIGI_MIN && amt <= DIGI_MAX ? amt : DIGI_MIN;
    const amountToSave = isWallet ? walletAmount : amt;
    if (!isWallet && (!form.amount || amt <= 0)) e.amount = "Enter valid amount";
    else if (!isWallet && (amt < MONTHLY_MIN || amt > MONTHLY_MAX)) e.amount = `Monthly amount must be ${money(MONTHLY_MIN)}–${money(MONTHLY_MAX)}`;
    if (form.bonusPct !== "" && (Number(form.bonusPct) < 0 || Number(form.bonusPct) > 99)) e.bonusPct = "Bonus must be 0–99%";
    // Tiers apply to MONTHLY schemes on both create and edit.
    const cleanTiers = [];
    if (form.type === "MONTHLY") {
      // Seed with the scheme's own base plan so a tier can't silently duplicate
      // it — that would show the customer the same option twice.
      const seen = new Set([`${Number(form.amount)}-${Number(form.duration)}`]);
      for (const t of tiers) {
        const ma = Number(t.monthlyAmount);
        const dm = Number(t.durationMonths);
        if (!ma || ma <= 0 || !dm || dm <= 0) { e.tiers = "Each tier needs a valid amount and duration"; break; }
        const key = `${ma}-${dm}`;
        if (seen.has(key)) { e.tiers = "Tier duplicates the base plan or another tier (same amount and duration)"; break; }
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
          monthlyAmount: amountToSave,
          durationMonths: Number(form.duration),
          bonusDescription: bonusPctToText(form.bonusPct),
          // Always send the tier set. Omitting it leaves tiers untouched, so a
          // scheme switched away from MONTHLY would keep stale selectable tiers;
          // an empty array makes the backend deactivate them.
          tiers: form.type === "MONTHLY" ? cleanTiers : [],
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
          monthlyAmount: amountToSave,
          durationMonths: Number(form.duration),
          bonusDescription: bonusPctToText(form.bonusPct) || undefined,
          tiers: cleanTiers,
        });
        setShow(false);
        setForm({ title: "", description: "", type: "MONTHLY", duration: "11", amount: "1000", bonusPct: "" });
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
    setConfirming(null);
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

  const confirmDeactivate = () => { if (confirming) handleDeactivate(confirming); };

  // Permanent delete. Only ever offered for a scheme created by mistake — the
  // backend returns 409 with the dependent counts when anything references it,
  // and that message is surfaced verbatim rather than reworded here.
  async function handleDelete(s) {
    setBusyId(s.id);
    try {
      await schemeService.deleteSchemePermanently(s.id);
      setDeleting(null);
      await loadSchemes();
      toast(`Scheme deleted — ${s.name}`);
    } catch (err) {
      toast(err?.message || "Delete failed");
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
              {s.enrolled !== null && (
                <div className="mt-1 font-semibold">
                  {s.enrolled === 0
                    ? "No enrollments — can be deleted"
                    : `${s.enrolled} enrollment${s.enrolled === 1 ? "" : "s"} — delete blocked`}
                </div>
              )}
            </div>
            {/* Edit and the lifecycle toggle share the row; Delete sits apart
                as an icon so it can never be hit while reaching for
                Deactivate — they look similar but only one is reversible. */}
            <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
              <Button variant="outline" size="sm" className="flex-1" disabled={busyId === s.id} onClick={() => openEdit(s)}>Edit</Button>
              {s.status === "Active" ? (
                <Button variant="outline" size="sm" className="flex-1 text-danger hover:border-danger" disabled={busyId === s.id} onClick={() => setConfirming(s)}>
                  {busyId === s.id ? "…" : "Deactivate"}
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="flex-1" disabled={busyId === s.id} onClick={() => handleReactivate(s)}>
                  {busyId === s.id ? "…" : "Reactivate"}
                </Button>
              )}
              <button
                type="button"
                title={
                  s.enrolled > 0
                    ? `Cannot delete — ${s.enrolled} enrollment${s.enrolled === 1 ? "" : "s"} reference this scheme. Deactivate it instead.`
                    : "Delete permanently"
                }
                aria-label={`Delete ${s.name} permanently`}
                disabled={busyId === s.id || s.enrolled > 0}
                onClick={() => setDeleting(s)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line text-muted transition-colors hover:border-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:bg-transparent disabled:hover:text-muted"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" />
                </svg>
              </button>
            </div>
          </Card>
        ))}
      </div>

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setShow(false)} aria-label="Close" />
          <div className="relative w-full max-w-[520px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4"><h3 className="text-lg font-extrabold">{editingId ? "Edit Gold Savings Scheme" : "Create New Gold Savings Scheme"}</h3><button onClick={() => setShow(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button></div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <label className="grid gap-1.5"><span className="text-xs font-bold">Scheme Title<span className="text-danger">*</span> — e.g. Festival Special Plan</span><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Festival Special Plan" className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.title ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.title && <span className="text-xs font-semibold text-danger">{errors.title}</span>}</label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Description — Short description shown to customers</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description..." rows={2} className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Scheme Type<span className="text-danger">*</span> — how contributions convert to gold</span><Select value={form.type} onValueChange={(t) => setForm(f => ({ ...f, type: t }))} options={SCHEME_TYPES.map(t => ({ value: t.value, label: t.label }))} /><span className="text-[11px] text-muted">{form.type === "FIXED_GOLD_RATE" ? "Gold rate is locked at enrollment; contributions convert at that locked rate." : form.type === "FLEXIBLE_DIGI_GOLD" ? "Contributions convert to gold at the rate on the contribution date." : "Standard monthly savings plan."}</span></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Duration (Months)<span className="text-danger">*</span> <span className="font-normal text-muted">— max {MAX_DURATION_MONTHS}</span></span><input type="number" min={1} max={MAX_DURATION_MONTHS} step={1} value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.duration ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />{errors.duration && <span className="text-xs font-semibold text-danger">{errors.duration}</span>}</label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Monthly Amount (₹)<span className="text-danger">*</span> <span className="font-normal text-muted">— {form.type === "FLEXIBLE_DIGI_GOLD" ? `${money(DIGI_MIN)} to ${money(DIGI_MAX)}` : `${money(MONTHLY_MIN)} to ${money(MONTHLY_MAX)}`}</span></span>{/* FDG-004. A Digi Gold wallet has no monthly amount to set: the
                    customer deposits what he likes, whenever he likes, within a
                    fixed range. The control states that range and is read-only
                    (not disabled - it stays reachable by keyboard and readable
                    by a screen reader). Switching to any other scheme type
                    restores the normal editable field. */}
                {form.type === "FLEXIBLE_DIGI_GOLD" ? (
                  <input type="text" readOnly aria-readonly="true" value={`${money(DIGI_MIN)} to ${money(DIGI_MAX)}`} className="h-10 cursor-default rounded-xl border border-line bg-canvas/60 px-3.5 text-sm font-semibold text-muted outline-none" />
                ) : (
                  <input type="number" step={1} value={form.amount} min={MONTHLY_MIN} max={MONTHLY_MAX} onChange={e => setForm({ ...form, amount: e.target.value })} className={`h-10 rounded-xl border bg-surface px-3.5 text-sm outline-none transition ${errors.amount ? "border-danger" : "border-line focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`} />
                )}{!errors.amount && <span className="text-[11px] text-muted">{form.type === "FLEXIBLE_DIGI_GOLD" ? `A wallet deposit may be ${money(DIGI_MIN)} to ${money(DIGI_MAX)}, any number of times.` : `An instalment must be ${money(MONTHLY_MIN)} to ${money(MONTHLY_MAX)}.`}</span>}{errors.amount && <span className="text-xs font-semibold text-danger">{errors.amount}</span>}</label>
              {/* The bonus is a PERCENTAGE, so it is captured as a bounded number
                  (0-99) rather than free text that accepted any digits at all.
                  The stored description is composed from it, keeping the existing
                  bonus_description contract unchanged. */}
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Bonus on maturity (%) <span className="font-normal text-muted">— optional, 0–99</span></span>
                <div className={`flex h-10 items-stretch overflow-hidden rounded-xl border bg-surface transition ${errors.bonusPct ? "border-danger" : "border-line focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--color-accent-soft)]"}`}>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    step={1}
                    value={form.bonusPct}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                      setForm({ ...form, bonusPct: digits });
                    }}
                    placeholder="8"
                    className="num min-w-0 flex-1 bg-transparent px-3.5 text-sm outline-none"
                  />
                  <span className="grid w-10 shrink-0 place-items-center border-l border-line-soft bg-canvas/60 text-sm font-bold text-muted" aria-hidden="true">%</span>
                </div>
                {errors.bonusPct
                  ? <span className="text-xs font-semibold text-danger">{errors.bonusPct}</span>
                  : <span className="text-[11px] text-muted">{form.bonusPct ? `Saved as "${form.bonusPct}% bonus on maturity".` : "Leave empty for no bonus."}</span>}
              </label>
              {form.type === "MONTHLY" && <div className="grid gap-2">

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

      {/* Deactivation confirm — the app's own dialog, replacing window.confirm.
          A native confirm shows the host name ("localhost says…"), cannot state
          the consequence, and looks nothing like the product. */}
      {deleting && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="px-6 pt-5">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-danger">Delete permanently</div>
              <h4 id="delete-title" className="mt-1 text-base font-extrabold">{deleting.name}</h4>
              <p className="mt-2 text-sm text-muted">
                The scheme and its tiers are removed for good. This cannot be undone.
              </p>
              <p className="mt-2 rounded-xl border border-line bg-canvas/50 p-3 text-xs text-muted">
                Only possible while nothing references the scheme. If any customer is enrolled — or ever was — the
                server refuses the delete and tells you how many records hold it. Deactivate such a scheme instead.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-danger text-white hover:bg-danger/90"
                disabled={busyId === deleting.id}
                onClick={() => handleDelete(deleting)}
              >
                {busyId === deleting.id ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="deactivate-title">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="px-6 pt-5">
              <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-danger">Deactivate scheme</div>
              <h4 id="deactivate-title" className="mt-1 text-base font-extrabold">{confirming.name}</h4>
              <p className="mt-2 text-sm text-muted">
                It stops being offered to new customers. Existing enrollments, passbooks and payment history are kept
                exactly as they are, and the scheme can be reactivated later.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setConfirming(null)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-danger text-white hover:bg-danger/90"
                disabled={busyId === confirming.id}
                onClick={confirmDeactivate}
              >
                {busyId === confirming.id ? "Deactivating…" : "Deactivate"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
