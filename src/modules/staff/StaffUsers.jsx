import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { fmtDate } from "@/_shared/utils";
import { staffService } from "@/modules/staff/staffService";

// Staff & Users. Every account and every permission shown here is real backend
// state (app/modules/staff): the module list comes from the permission catalog
// so the keys can never drift from what the API accepts, and status/permission
// changes are written immediately.
//
// The backend has no endpoint for changing an existing staff member's name,
// email, phone or password — so those are captured once at creation and shown
// read-only afterwards. What CAN be changed later is module access and active
// status, which is what the manage panel does.

export default function StaffUsers() {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [users, setUsers] = useState([]);
  const [catalog, setCatalog] = useState({ groups: [], allModules: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [managing, setManaging] = useState(null); // an existing staff row
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", access: [] });
  const [errors, setErrors] = useState({});

  usePageMotion(scope, [loading]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [staff, cat] = await Promise.all([
        staffService.listStaff(),
        staffService.getPermissionCatalog().catch(() => ({ groups: [], allModules: [] })),
      ]);
      setUsers(staff);
      setCatalog(cat);
    } catch (err) {
      setLoadError(err?.message || "Could not load staff.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // key -> label, for rendering a saved permission set as readable chips. The
  // same key can appear in both groups, so the first label found wins.
  const moduleLabel = useMemo(() => {
    const m = new Map();
    catalog.groups.forEach((g) => g.modules.forEach((mod) => { if (!m.has(mod.key)) m.set(mod.key, mod.label); }));
    return m;
  }, [catalog]);

  const openAdd = () => {
    setManaging(null);
    setForm({ name: "", email: "", phone: "", password: "", access: [] });
    setErrors({});
    setShowForm(true);
  };

  const openManage = (u) => {
    setManaging(u);
    setForm({ name: u.name, email: u.email, phone: u.phone, password: "", access: [...u.permissions] });
    setErrors({});
    setShowForm(true);
  };

  const toggleAccess = (key) => {
    setForm((prev) => ({
      ...prev,
      access: prev.access.includes(key) ? prev.access.filter((k) => k !== key) : [...prev.access, key],
    }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim() || form.name.trim().length < 2) e.name = "Name is required (min 2 characters)";
    if (!form.password || form.password.length < 6) e.password = "Password must be at least 6 characters";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email";
    // Backend accepts a 10-digit Indian mobile only (must start 6-9).
    if (form.phone && !/^[6-9]\d{9}$/.test(form.phone)) e.phone = "Enter a valid 10-digit mobile number";
    return e;
  };

  const handleCreate = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Please fix the highlighted fields"); return; }
    setSaving(true);
    try {
      const created = await staffService.createStaff({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        permissions: form.access,
      });
      setUsers((prev) => [created, ...prev]);
      setShowForm(false);
      toast(`${created.name} can now sign in`);
    } catch (err) {
      toast(err?.message || "Could not create the staff account");
    } finally {
      setSaving(false);
    }
  };

  // Saves the grant set as an exact replacement — the endpoint is not additive.
  const handleSaveAccess = async () => {
    if (!managing) return;
    setSaving(true);
    try {
      const updated = await staffService.setStaffPermissions(managing.id, form.access);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setShowForm(false);
      setManaging(null);
      toast(form.access.length ? "Module access updated" : "All module access removed");
    } catch (err) {
      toast(err?.message || "Could not update access");
    } finally {
      setSaving(false);
    }
  };

  // Optimistic, then reconciled with whatever the backend returns; on failure
  // the row goes back to what it was rather than lying about the new state.
  const toggleActive = async (u) => {
    const next = !u.isActive;
    setBusyId(u.id);
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: next } : x)));
    try {
      const updated = await staffService.setStaffStatus(u.id, next);
      setUsers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      toast(`${u.name} ${next ? "activated" : "deactivated"}`);
    } catch (err) {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: u.isActive } : x)));
      toast(err?.message || "Could not change the status");
    } finally {
      setBusyId(null);
    }
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

      {loadError && (
        <Card data-motion="reveal" className="mb-4 border-danger/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-danger">{loadError}</p>
            <Button size="sm" variant="outline" onClick={load}>Retry</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card data-motion="reveal" className="p-10 text-center text-sm text-muted">Loading staff…</Card>
      ) : users.length === 0 ? (
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
          <div className="border-b border-line px-6 py-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-extrabold">Staff list</h3>
            <span className="text-[11px] font-semibold text-muted">{users.length} account{users.length === 1 ? "" : "s"}</span>
          </div>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  <th className="px-6 py-3">Name</th><th className="py-3">Contact</th><th className="py-3">Access</th><th className="py-3">Status</th><th className="py-3 text-right pr-6">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line-soft last:border-0 hover:bg-canvas/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="font-bold">{u.name}</div>
                      {u.memberSince && <div className="text-[11px] text-muted">Since {fmtDate(u.memberSince)}</div>}
                    </td>
                    <td className="py-3.5">
                      <div className="text-xs">{u.email || <span className="text-muted">—</span>}</div>
                      <div className="font-mono text-xs text-muted">{u.phone || "—"}</div>
                    </td>
                    <td className="py-3.5 max-w-[320px]">
                      {u.permissions.length === 0 ? <span className="text-xs text-muted">No access</span> : (
                        <div className="flex flex-wrap gap-1">
                          {u.permissions.map((k) => <Badge key={k} tone="neutral" className="text-[10px]">{moduleLabel.get(k) || k}</Badge>)}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5">
                      <div className="flex items-center gap-2">
                        <Badge tone={u.isActive ? "success" : "neutral"} dot>{u.isActive ? "Active" : "Inactive"}</Badge>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={busyId === u.id}
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${u.isActive ? "bg-accent border-accent" : "bg-canvas border-line"}`}
                          aria-label={u.isActive ? "Deactivate staff member" : "Activate staff member"}
                        >
                          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${u.isActive ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 pr-6 text-right">
                      <Button size="sm" variant="outline" onClick={() => openManage(u)}>Manage access</Button>
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
              <h3 className="text-base font-extrabold">{managing ? `Manage access — ${managing.name}` : "Add Staff"}</h3>
              <button onClick={() => setShowForm(false)} className="grid h-8 w-8 place-items-center rounded-full border border-line hover:bg-canvas">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-4">
              {managing ? (
                // Identity is fixed after creation — there is no backend route to
                // change it, so it is shown rather than offered as an edit.
                <div className="rounded-xl border border-line bg-canvas/40 px-4 py-3 text-sm">
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <div><div className="text-[11px] font-bold uppercase tracking-wide text-muted">Email</div><div>{managing.email || "—"}</div></div>
                    <div><div className="text-[11px] font-bold uppercase tracking-wide text-muted">Phone</div><div className="font-mono">{managing.phone || "—"}</div></div>
                  </div>
                  <p className="mt-2 text-[11px] text-muted">Name, email, phone and password cannot be changed after the account is created. To replace a staff member's login, deactivate this account and create a new one.</p>
                </div>
              ) : (
                <>
                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold">Staff member name *</span>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Priya Sharma" className={errors.name ? "border-danger" : ""} />
                    {errors.name && <span className="text-xs font-semibold text-danger">{errors.name}</span>}
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold">Email <span className="font-normal text-muted">(optional)</span></span>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="e.g. priya@store.com" className={errors.email ? "border-danger" : ""} />
                    {errors.email && <span className="text-xs font-semibold text-danger">{errors.email}</span>}
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold">Phone <span className="font-normal text-muted">(optional)</span></span>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 9876543210" maxLength={10} className={errors.phone ? "border-danger" : ""} />
                    {errors.phone && <span className="text-xs font-semibold text-danger">{errors.phone}</span>}
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-xs font-bold">Password * <span className="font-normal text-muted">(min 6 characters)</span></span>
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••" className={errors.password ? "border-danger" : ""} />
                    {errors.password && <span className="text-xs font-semibold text-danger">{errors.password}</span>}
                    {!errors.password && <span className="text-xs text-muted">This is the password the staff member signs in with — note it down, it cannot be viewed or changed later.</span>}
                  </label>
                </>
              )}

              <div>
                <div className="text-xs font-bold">Staff Access</div>
                <p className="text-xs text-muted">Which admin modules this staff member can open. Leave everything off for an account with no panel access.</p>
                {catalog.groups.length === 0 ? (
                  <p className="mt-2 text-xs font-semibold text-danger">Could not load the permission list — reopen this form once the connection is back, otherwise access cannot be assigned.</p>
                ) : (
                  <div className="mt-2 grid gap-3">
                    {catalog.groups.map((g) => (
                      <div key={g.group}>
                        <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted">{g.label}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {g.modules.map((m) => {
                            const active = form.access.includes(m.key);
                            return (
                              <button
                                key={`${g.group}:${m.key}`}
                                type="button"
                                onClick={() => toggleAccess(m.key)}
                                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${active ? "border-accent bg-accent text-white" : "border-line bg-white text-muted hover:border-accent-line hover:text-ink"}`}
                              >
                                {m.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted">A few modules (reports, analytics, notifications) are shared and appear under both groups — granting one grants the same single permission.</p>
                  </div>
                )}
              </div>

              {managing && (
                <div className="flex items-center justify-between rounded-xl border border-line bg-canvas/40 px-4 py-3">
                  <div>
                    <div className="text-xs font-bold">Active</div>
                    <div className="text-xs text-muted">An inactive account cannot sign in. Saved immediately.</div>
                  </div>
                  <button
                    onClick={() => toggleActive(managing).then(() => setManaging((m) => (m ? { ...m, isActive: !m.isActive } : m)))}
                    disabled={busyId === managing.id}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${managing.isActive ? "bg-accent border-accent" : "bg-canvas border-line"}`}
                    aria-label="Toggle active"
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${managing.isActive ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2.5 border-t border-line bg-canvas/30 px-6 py-4">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-accent hover:bg-accent-strong"
                disabled={saving}
                onClick={managing ? handleSaveAccess : handleCreate}
              >
                {saving ? "Saving…" : managing ? "Save access" : "Create Staff"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
