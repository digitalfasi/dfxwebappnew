import { useState, useRef } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";

export default function Branches() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [branches, setBranches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", address: "", phone: "", latitude: "", longitude: "" });
  const [errors, setErrors] = useState({});

  const openCreate = () => {
    setForm({ name: "", address: "", phone: "", latitude: "", longitude: "" });
    setErrors({});
    setShowForm(true);
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Branch Name is required";
    if (!form.address.trim()) e.address = "Address is required";
    if (!/^\d{10}$/.test(form.phone.trim())) e.phone = "Phone must be 10 digits";
    if (!form.latitude.trim() || isNaN(Number(form.latitude)) || Number(form.latitude) < -90 || Number(form.latitude) > 90) e.latitude = "Latitude is required (e.g. 12.9716)";
    if (!form.longitude.trim() || isNaN(Number(form.longitude)) || Number(form.longitude) < -180 || Number(form.longitude) > 180) e.longitude = "Longitude is required (e.g. 77.5946)";
    return e;
  };

  const handleCreate = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Please fix the highlighted fields"); return; }
    setBranches(prev => [{ id: Date.now(), name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), latitude: form.latitude.trim(), longitude: form.longitude.trim() }, ...prev]);
    toast("Branch created");
    setShowForm(false);
  };

  const handleDelete = (id) => {
    setBranches(prev => prev.filter(b => b.id !== id));
    toast("Branch removed");
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

      {/* Branch list / details */}
      {branches.length === 0 ? (
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
                  <th className="px-6 py-3">Branch name</th><th className="py-3">Address</th><th className="py-3">Phone</th><th className="py-3">Location coordinates</th><th className="py-3 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {branches.map(b => (
                  <tr key={b.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                    <td className="px-6 py-3.5 font-bold">{b.name}</td>
                    <td className="py-3.5 text-muted max-w-[280px]">{b.address}</td>
                    <td className="py-3.5 font-mono text-xs">{b.phone}</td>
                    <td className="py-3.5 font-mono text-xs">{b.latitude}, {b.longitude}</td>
                    <td className="py-3.5 pr-6 text-right">
                      <Button size="sm" variant="outline" onClick={() => handleDelete(b.id)} className="text-danger hover:bg-danger-soft">Delete</Button>
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
              <h3 className="text-base font-extrabold">Register New Branch</h3>
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

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Latitude *</span>
                  <Input value={form.latitude} onChange={e => setForm({ ...form, latitude: e.target.value })} placeholder="12.9716" className={errors.latitude ? "border-danger" : ""} />
                  {errors.latitude ? <span className="text-xs font-semibold text-danger">{errors.latitude}</span> : <span className="text-xs text-muted">e.g. 12.9716</span>}
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-bold">Longitude *</span>
                  <Input value={form.longitude} onChange={e => setForm({ ...form, longitude: e.target.value })} placeholder="77.5946" className={errors.longitude ? "border-danger" : ""} />
                  {errors.longitude ? <span className="text-xs font-semibold text-danger">{errors.longitude}</span> : <span className="text-xs text-muted">e.g. 77.5946</span>}
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleCreate}>Create Branch</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
