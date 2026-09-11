import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { branchService } from "@/modules/branches/branchService";
import dynamic from "next/dynamic";

// Leaflet touches `window` at module scope, so the picker is loaded in the
// browser only.
const BranchLocationPicker = dynamic(
  () => import("@/modules/branches/BranchLocationPicker"),
  { ssr: false, loading: () => <div className="h-64 rounded-xl border border-line bg-canvas" /> }
);

export default function Branches() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // null = the form is creating; an id = the form is editing that branch.
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", latitude: "", longitude: "" });
  const [errors, setErrors] = useState({});

  // Branches used to live in React state alone: everything registered here
  // vanished on refresh and never reached the database, even though the
  // /admin/branches endpoints existed the whole time.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setBranches(await branchService.getBranches());
    } catch (err) {
      setLoadError(err?.message || "Could not load branches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: "", address: "", phone: "", latitude: "", longitude: "" });
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (b) => {
    setEditId(b.id);
    setForm({
      name: b.name || "",
      address: b.address || "",
      phone: b.phone || "",
      latitude: b.latitude != null ? String(b.latitude) : "",
      longitude: b.longitude != null ? String(b.longitude) : "",
    });
    setErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Branch Name is required";
    if (!form.address.trim()) e.address = "Address is required";
    if (!/^\d{10}$/.test(form.phone.trim())) e.phone = "Phone must be 10 digits";
    // The coordinates still have to be right - the customer-facing branch
    // locator navigates people to them - but they come from the map now, so the
    // error talks about the map rather than about a number.
    const lat = Number(form.latitude), lon = Number(form.longitude);
    if (!form.latitude || !form.longitude || isNaN(lat) || isNaN(lon)
        || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      e.location = "Pick the branch location on the map";
    }
    return e;
  };

  const handleSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Please fix the highlighted fields"); return; }
    if (saving) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      latitude: form.latitude.trim(),
      longitude: form.longitude.trim(),
    };
    try {
      if (editId) await branchService.updateBranch(editId, payload);
      else await branchService.createBranch(payload);
      setShowForm(false);
      setEditId(null);
      await load();
      toast(editId ? "Branch updated" : "Branch created");
    } catch (err) {
      toast(err?.message || (editId ? "Could not update branch" : "Could not create branch"));
    } finally {
      setSaving(false);
    }
  };

  // There is no delete endpoint, by design: a branch is referenced by the
  // customer-facing branch locator, so it is deactivated rather than erased.
  // The control says what it actually does.
  const handleToggleActive = async (b) => {
    if (saving) return;
    setSaving(true);
    try {
      await branchService.setBranchStatus(b.id, !b.isActive);
      await load();
      toast(b.isActive ? "Branch deactivated" : "Branch activated");
    } catch (err) {
      toast(err?.message || "Could not change the branch status");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1100px]">
      {/* Header */}
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Multi-Branch Store Management</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Register and manage your store branches — address, contact and location coordinates.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0" onClick={openCreate}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Register New Branch
        </Button>
      </div>

      {loadError && (
        <div className="mb-3 rounded-xl border border-danger-line bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
          {loadError} <button onClick={load} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Branch list / details */}
      {loading ? (
        <Card data-motion="reveal" className="p-10 text-center text-sm font-semibold text-muted">Loading branches…</Card>
      ) : branches.length === 0 ? (
        <Card data-motion="reveal" className="p-10 text-center">
          <div className="mx-auto max-w-[420px]">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-canvas border border-line text-muted">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>
            </div>
            <h3 className="mt-3 text-base font-extrabold">No branches yet</h3>
            <p className="mt-1 text-sm text-muted">Register your first store branch to get started</p>
            <Button size="sm" className="mt-4 bg-accent hover:bg-accent-strong" onClick={openCreate}>Register New Branch</Button>
          </div>
        </Card>
      ) : (
        <Card data-motion="reveal" className="overflow-hidden">
          <div className="border-b border-line px-6 py-4"><h3 className="text-sm font-extrabold">Branch list</h3></div>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  <th className="px-6 py-3">Branch name</th><th className="py-3">Address</th><th className="py-3">Phone</th><th className="py-3">Location coordinates</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(b => (
                  <tr key={b.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                    <td className="px-6 py-3.5 font-bold">{b.name}</td>
                    <td className="py-3.5 text-muted max-w-[280px]">{b.address}</td>
                    <td className="py-3.5 font-mono text-xs">{b.phone}</td>
                    <td className="py-3.5 font-mono text-xs">{b.latitude}, {b.longitude}</td>
                    <td className="py-3.5"><Badge tone={b.isActive ? "success" : "neutral"} dot>{b.isActive ? "Active" : "Inactive"}</Badge></td>
                    <td className="py-3.5 pr-6 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(b)} disabled={saving}>Edit</Button>
                        <Button size="sm" variant="outline" disabled={saving} onClick={() => handleToggleActive(b)} className={b.isActive ? "text-danger hover:bg-danger-soft" : ""}>
                          {b.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <p className="mt-3 text-xs text-muted">Page note: Per-branch staff rosters and sales KPIs are not currently modeled in the backend.</p>

      {/* Register modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setShowForm(false)} aria-label="Close" />
          <div className="relative w-full max-w-[560px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-extrabold">{editId ? "Edit Branch" : "Register New Branch"}</h3>
              <button onClick={() => setShowForm(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Branch Name *</span>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Koramangala Branch" className={errors.name ? "border-danger" : ""} />
                {errors.name && <span className="text-xs font-semibold text-danger">{errors.name}</span>}
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Address *</span>
                <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} rows={2} placeholder="Full store address" className={`rounded-xl border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)] ${errors.address ? "border-danger" : "border-line"}`} />
                {errors.address && <span className="text-xs font-semibold text-danger">{errors.address}</span>}
                <span className="text-xs text-muted">Full store address</span>
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Phone *</span>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 9876543210" maxLength={10} className={errors.phone ? "border-danger" : ""} />
                {errors.phone ? <span className="text-xs font-semibold text-danger">{errors.phone}</span> : <span className="text-xs text-muted">10-digit store phone</span>}
              </label>

              <div className="grid gap-1.5">
                <span className="text-xs font-bold">Location *</span>
                <BranchLocationPicker
                  latitude={form.latitude}
                  longitude={form.longitude}
                  addressQuery={form.address}
                  onChange={({ latitude, longitude }) => setForm(f => ({ ...f, latitude, longitude }))}
                />
                {errors.location && <span className="text-xs font-semibold text-danger">{errors.location}</span>}
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditId(null); }} disabled={saving}>Cancel</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editId ? "Save Changes" : "Create Branch"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
