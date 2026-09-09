import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { Badge } from "@/_shared/ui/badge";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { settingsService } from "@/modules/settings/settingsService";

// Store configuration — reads and writes the real tenant profile
// (GET/PUT /admin/tenant/profile).
//
// Store name, identifier and subscription status are shown but NOT editable:
// the update endpoint accepts contact and branding columns only, by design, so
// a tenant admin cannot rename their own store or change its status. Offering
// those as inputs would have been a form that silently dropped them.

export default function Settings() {
  const scope = useRef(null);
  usePressFeedback(scope);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ contactEmail: "", contactPhone: "", gstNumber: "", brandColor: "", logoUrl: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  usePageMotion(scope, [loading]);

  const seed = (p) => setForm({
    contactEmail: p.contactEmail || "",
    contactPhone: p.contactPhone || "",
    gstNumber: p.gstNumber || "",
    brandColor: p.brandColor || "#c9a84c",
    logoUrl: p.logoUrl || "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const p = await settingsService.getTenantProfile();
      setProfile(p);
      seed(p);
      setErrors({});
    } catch (err) {
      setLoadError(err?.message || "Could not load the store profile.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const validate = () => {
    const e = {};
    // Mirrors the backend: EmailStr, a 10-digit Indian mobile, and non-empty
    // strings (the API rejects "" on gst_number / brand_color / logo_url).
    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      e.contactEmail = "Must be a valid email address";
    }
    if (form.contactPhone.trim() && !/^[6-9]\d{9}$/.test(form.contactPhone.trim())) {
      e.contactPhone = "Enter a valid 10-digit mobile number";
    }
    if (form.gstNumber.trim() && form.gstNumber.trim().length > 20) e.gstNumber = "GST number cannot exceed 20 characters";
    if (form.logoUrl.trim() && form.logoUrl.trim().length > 500) e.logoUrl = "URL cannot exceed 500 characters";
    return e;
  };

  const dirty = !!profile && (
    form.contactEmail.trim() !== (profile.contactEmail || "")
    || form.contactPhone.trim() !== (profile.contactPhone || "")
    || form.gstNumber.trim() !== (profile.gstNumber || "")
    || form.brandColor.trim() !== (profile.brandColor || "#c9a84c")
    || form.logoUrl.trim() !== (profile.logoUrl || "")
  );

  const handleSave = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Please fix the highlighted fields"); return; }
    if (!dirty) { toast("Nothing has changed"); return; }
    setSaving(true);
    try {
      const updated = await settingsService.updateTenantProfile(form);
      setProfile(updated);
      seed(updated);
      toast("Store and brand information updated");
    } catch (err) {
      toast(err?.message || "Could not save the store profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[900px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Jeweller Store Configuration</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Manage your store and brand information — displayed to customers and on receipts.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0" onClick={handleSave} disabled={saving || loading || !dirty}>
          {saving ? "Saving…" : "Save Changes"}
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
        <Card data-motion="reveal" className="p-10 text-center text-sm text-muted">Loading store profile…</Card>
      ) : (
        <div className="grid gap-6">
          <Card data-motion="reveal" className="p-6">
            <h3 className="text-sm font-extrabold">Business Details</h3>
            <p className="mt-1 text-xs text-muted">Store information is displayed under Business Details.</p>

            {/* Identity — set when the store was onboarded, not editable here. */}
            <div className="mt-5 grid gap-4 rounded-xl border border-line bg-canvas/40 p-4 sm:grid-cols-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Store name</div>
                <div className="mt-0.5 text-sm font-bold">{profile?.name || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Store identifier</div>
                <div className="mt-0.5 font-mono text-sm">{profile?.slug || "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Subscription</div>
                <div className="mt-0.5"><Badge tone={profile?.status === "ACTIVE" ? "success" : "warning"} dot>{profile?.status || "—"}</Badge></div>
              </div>
              <p className="text-[11px] text-muted sm:col-span-3">The store name, identifier and subscription status are managed by DFX and cannot be changed from here — contact support to have them updated.</p>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Contact Email</span>
                <Input type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="e.g. contact@store.com" className={errors.contactEmail ? "border-danger" : ""} />
                {errors.contactEmail ? <span className="text-xs font-semibold text-danger">{errors.contactEmail}</span> : <span className="text-xs text-muted">Shown to customers in the app.</span>}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Contact Phone</span>
                <Input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="e.g. 9876543210" maxLength={10} className={errors.contactPhone ? "border-danger" : ""} />
                {errors.contactPhone ? <span className="text-xs font-semibold text-danger">{errors.contactPhone}</span> : <span className="text-xs text-muted">A 10-digit Indian mobile number.</span>}
              </label>
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-xs font-bold">GST Number</span>
                <Input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} placeholder="e.g. 29ABCDE1234F1Z5" maxLength={20} className={errors.gstNumber ? "border-danger" : ""} />
                {errors.gstNumber && <span className="text-xs font-semibold text-danger">{errors.gstNumber}</span>}
              </label>
            </div>
          </Card>

          <Card data-motion="reveal" className="p-6">
            <h3 className="text-sm font-extrabold">Brand Identity</h3>
            <p className="mt-1 text-xs text-muted">Brand identity is shown to customers in the app and on receipts.</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-xs font-bold">Logo URL</span>
                <Input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." maxLength={500} className={errors.logoUrl ? "border-danger" : ""} />
                {errors.logoUrl && <span className="text-xs font-semibold text-danger">{errors.logoUrl}</span>}
                {form.logoUrl && (
                  <div className="mt-1 flex items-center gap-3">
                    <img src={form.logoUrl} alt="logo" className="h-10 w-10 rounded-lg border border-line object-contain bg-white" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    <span className="truncate text-xs text-muted">{form.logoUrl}</span>
                  </div>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Brand Color</span>
                <div className="flex items-center gap-2">
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.brandColor) ? form.brandColor : "#c9a84c"} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} className="h-10 w-10 shrink-0 rounded-lg border border-line p-1" />
                  <Input value={form.brandColor} onChange={(e) => setForm({ ...form, brandColor: e.target.value })} placeholder="#c9a84c" maxLength={20} className="flex-1" />
                </div>
                <span className="text-xs text-muted">Used for the customer app's accent colour.</span>
              </label>
            </div>
          </Card>

          <div className="flex items-center justify-end gap-2.5">
            {dirty && <span className="mr-auto text-xs font-semibold text-accent">Unsaved changes</span>}
            <Button variant="outline" size="sm" onClick={() => { if (profile) { seed(profile); setErrors({}); toast("Changes discarded"); } }} disabled={!dirty || saving}>Cancel</Button>
            <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleSave} disabled={saving || !dirty}>{saving ? "Saving…" : "Save Changes"}</Button>
          </div>
          <p className="text-xs text-muted">Only contact and branding fields are editable; an empty field is left unchanged rather than cleared, because the API does not accept blank values.</p>
        </div>
      )}
    </div>
  );
}
