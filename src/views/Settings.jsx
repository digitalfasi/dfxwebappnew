import { useState, useRef } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";

export default function Settings() {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const [form, setForm] = useState({
    storeName: "",
    storeIdentifier: "",
    contactEmail: "",
    contactPhone: "",
    gstNumber: "",
    logoUrl: "",
    brandColor: "#c9a84c",
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.contactEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail) || !form.contactEmail.includes("@")) {
      e.contactEmail = "Must be a valid email address — Must contain @";
    }
    if (!form.contactPhone.trim() || form.contactPhone.trim().length < 10) {
      e.contactPhone = "Minimum 10 characters";
    }
    if (!form.gstNumber.trim()) e.gstNumber = "Required value";
    if (!form.brandColor.trim()) e.brandColor = "Required value";
    if (!form.storeName.trim()) e.storeName = "Required value";
    return e;
  };

  const handleSave = () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) { toast("Please fix the highlighted fields"); return; }
    toast("Store and brand information updated");
  };

  return (
    <div ref={scope} className="mx-auto max-w-[900px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Jeweller Store Configuration</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">Manage your store and brand information — displayed to customers and on receipts.</p>
        </div>
        <Button size="sm" className="bg-accent hover:bg-accent-strong shrink-0" onClick={handleSave}>
          Save Changes
        </Button>
      </div>

      <div className="grid gap-6">
        <Card data-motion="reveal" className="p-6">
          <h3 className="text-sm font-extrabold">Business Details</h3>
          <p className="mt-1 text-xs text-muted">Store information is displayed under Business Details.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Store name</span>
              <Input value={form.storeName} onChange={e => setForm({ ...form, storeName: e.target.value })} placeholder="e.g. Aurum Jewellers" className={errors.storeName ? "border-danger" : ""} />
              {errors.storeName && <span className="text-xs font-semibold text-danger">{errors.storeName}</span>}
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Store identifier</span>
              <Input value={form.storeIdentifier} onChange={e => setForm({ ...form, storeIdentifier: e.target.value })} placeholder="e.g. AURUM-001" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Contact Email</span>
              <Input type="email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} placeholder="e.g. contact@store.com" className={errors.contactEmail ? "border-danger" : ""} />
              {errors.contactEmail ? <span className="text-xs font-semibold text-danger">{errors.contactEmail}</span> : <span className="text-xs text-muted">Must be a valid email address — Must contain @</span>}
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Contact Phone</span>
              <Input value={form.contactPhone} onChange={e => setForm({ ...form, contactPhone: e.target.value })} placeholder="e.g. 9876543210" className={errors.contactPhone ? "border-danger" : ""} />
              {errors.contactPhone ? <span className="text-xs font-semibold text-danger">{errors.contactPhone}</span> : <span className="text-xs text-muted">Minimum 10 characters</span>}
            </label>
            <label className="grid gap-1.5 sm:col-span-2">
              <span className="text-xs font-bold">GST Number</span>
              <Input value={form.gstNumber} onChange={e => setForm({ ...form, gstNumber: e.target.value })} placeholder="e.g. 29ABCDE1234F1Z5" className={errors.gstNumber ? "border-danger" : ""} />
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
              <Input value={form.logoUrl} onChange={e => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." />
              {form.logoUrl && <div className="mt-1 flex items-center gap-3"><img src={form.logoUrl} alt="logo" className="h-10 w-10 rounded-lg border border-line object-contain bg-white" onError={e => e.currentTarget.style.display = 'none'} /><span className="text-xs text-muted truncate">{form.logoUrl}</span></div>}
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold">Brand Color</span>
              <div className="flex items-center gap-2">
                <input type="color" value={form.brandColor} onChange={e => setForm({ ...form, brandColor: e.target.value })} className="h-10 w-10 rounded-lg border border-line p-1 shrink-0" />
                <Input value={form.brandColor} onChange={e => setForm({ ...form, brandColor: e.target.value })} placeholder="#c9a84c" className={`flex-1 ${errors.brandColor ? "border-danger" : ""}`} />
              </div>
              {errors.brandColor ? <span className="text-xs font-semibold text-danger">{errors.brandColor}</span> : <span className="text-xs text-muted">Required value</span>}
            </label>
          </div>
        </Card>

        <div className="flex justify-end gap-2.5">
          <Button variant="outline" size="sm" onClick={() => toast("Changes discarded")}>Cancel</Button>
          <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleSave}>Save Changes</Button>
        </div>
        <p className="text-xs text-muted">Save Changes updates the configured store and brand information.</p>
      </div>
    </div>
  );
}
