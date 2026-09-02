import { useState, useRef } from "react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";

const PERMISSIONS = [
  "Customers",
  "KYC",
  "Gold Rate",
  "Schemes",
  "Enrollments",
  "Payments",
  "Catalogue",
  "Marketing",
  "Reports",
  "Analytics",
  "Branches",
  "Support",
  "Inventory",
  "New Sale",
  "Sales History",
];

export default function StaffUsers() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", access: [], active: true });
  const [errors, setErrors] = useState({});

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", password: "", access: [], active: true });
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, phone: u.phone, password: "", access: [...u.access], active: u.active });
    setErrors({});
    setShowForm(true);
  };

  const toggleAccess = (perm) => {
    setForm(prev => ({
      ...prev,
      access: prev.access.includes(perm) ? prev.access.filter(p => p !== perm) : [...prev.access, perm],
    }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!editing && (!form.password || form.password.length < 6)) e.password = "Password must be at least 6 characters";
    if (editing && form.password && form.password.length > 0 && form.password.length < 6) e.password = "Password must be at least 6 characters";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    if (form.phone && !/^\d{10}$/.test(form.phone)) e.phone = "Phone must be 10 digits";
    return e;
  };

  const handleCreate = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Please fix the highlighted fields"); return; }
    if (editing) {
      setUsers(prev => prev.map(u => u.id === editing.id ? { ...u, name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), access: form.access, active: form.active, ...(form.password ? { password: form.password } : {}) } : u));
      toast("Staff member updated");
    } else {
      setUsers(prev => [{ id: Date.now(), name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password, access: form.access, active: true }, ...prev]);
      toast("Staff member created");
    }
    setShowForm(false);
    setEditing(null);
  };

  const toggleActive = (id) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, active: !u.active } : u));
  };

  return (
    <div ref={scope} className="mx-auto max-w-[1100px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Staff User Management</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Create and manage staff accounts, assign module access and control active status.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0" onClick={openAdd}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Add Staff
        </Button>
      </div>

      {users.length === 0 ? (
        <Card data-motion="reveal" className="p-10 text-center">
          <div className="mx-auto max-w-[420px]">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-canvas border border-line text-muted">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11a3 3 0 0 0-3 3 3 3 0 0 0-3-3 3 3 0 0 1 3-3 3 3 0 0 1 3 3z" /></svg>
            </div>
            <h3 className="mt-3 text-base font-extrabold">No staff members yet</h3>
            <p className="mt-1 text-sm text-muted">Add your first staff member to get started</p>
            <Button size="sm" className="mt-4 bg-accent hover:bg-accent-strong" onClick={openAdd}>Add Staff</Button>
          </div>
        </Card>
      ) : (
        <Card data-motion="reveal" className="overflow-hidden">
          <div className="border-b border-line px-6 py-4"><h3 className="text-sm font-extrabold">Staff list</h3></div>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  <th className="px-6 py-3">Name</th><th className="py-3">Contact</th><th className="py-3">Access</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                    <td className="px-6 py-3.5 font-bold">{u.name}</td>
                    <td className="py-3.5">
                      <div className="text-xs">{u.email || <span className="text-muted">—</span>}</div>
                      <div className="font-mono text-xs text-muted">{u.phone || "—"}</div>
                    </td>
                    <td className="py-3.5 max-w-[320px]">
                      {u.access.length === 0 ? <span className="text-xs text-muted">No access</span> : (
                        <div className="flex flex-wrap gap-1">{u.access.map(a => <Badge key={a} tone="neutral" className="text-[10px]">{a}</Badge>)}</div>
                      )}
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-2">
                        <Badge tone={u.active ? "success" : "neutral"} dot>{u.active ? "Active" : "Inactive"}</Badge>
                        <button onClick={() => toggleActive(u.id)} className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${u.active ? "bg-accent border-accent" : "bg-canvas border-line"}`} aria-label="Toggle active">
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${u.active ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 pr-6 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(u)}>Edit</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={() => setShowForm(false)} aria-label="Close" />
          <div className="relative w-full max-w-[620px] max-h-[90vh] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h3 className="text-base font-extrabold">{editing ? "Edit staff member" : "Add Staff"}</h3>
              <button onClick={() => setShowForm(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Staff member name *</span>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Sharma" className={errors.name ? "border-danger" : ""} />
                {errors.name && <span className="text-xs font-semibold text-danger">{errors.name}</span>}
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Email <span className="font-normal text-muted">(optional)</span></span>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="e.g. priya@store.com" className={errors.email ? "border-danger" : ""} />
                {errors.email && <span className="text-xs font-semibold text-danger">{errors.email}</span>}
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Phone <span className="font-normal text-muted">(optional)</span></span>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 9876543210" maxLength={10} className={errors.phone ? "border-danger" : ""} />
                {errors.phone && <span className="text-xs font-semibold text-danger">{errors.phone}</span>}
              </label>

              <label className="grid gap-1.5">
                <span className="text-xs font-bold">{editing ? "Password" : "Password *"} <span className="font-normal text-muted">(min 6 characters)</span></span>
                <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={editing ? "Leave blank to keep unchanged" : "••••••"} className={errors.password ? "border-danger" : ""} />
                {errors.password && <span className="text-xs font-semibold text-danger">{errors.password}</span>}
                {!errors.password && <span className="text-xs text-muted">Password field indicates minimum 6 characters.</span>}
              </label>

              <div>
                <div className="text-xs font-bold">Staff Access</div>
                <p className="text-xs text-muted">Access permissions:</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PERMISSIONS.map(p => {
                    const active = form.access.includes(p);
                    return (
                      <button key={p} type="button" onClick={() => toggleAccess(p)} className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${active ? "border-accent bg-accent text-white" : "border-line bg-white text-muted hover:border-accent-line hover:text-ink"}`}>{p}</button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/40 px-4 py-3">
                <div>
                  <div className="text-xs font-bold">Active</div>
                  <div className="text-xs text-muted">Staff status</div>
                </div>
                <button onClick={() => setForm({ ...form, active: !form.active })} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${form.active ? "bg-accent border-accent" : "bg-canvas border-line"}`} aria-label="Toggle active">
                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${form.active ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleCreate}>{editing ? "Update Staff" : "Create Staff"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
