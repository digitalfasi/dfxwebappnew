import { useState, useRef } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { promotionService } from "@/modules/marketing/promotionService";

/**
 * Create / edit an IMAGE-ONLY promotion banner. Standard banners were removed —
 * the uploaded image is the whole banner (no title/copy/button/colors). Lean
 * form: image + active window + priority + active, matching the old DFX app.
 *
 * Save is two-phase because the backend needs a promotion id before the image
 * upload, and refuses to ACTIVATE an image-only banner that has no image yet:
 *   1) create/update the record staged inactive
 *   2) upload the image (mandatory)
 *   3) activate only if the user chose Active and an image is present.
 */
export default function PromotionCreate({ onNavigate, editingPromo, setEditingPromo }) {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const isEdit = !!editingPromo;
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(() => ({
    image: editingPromo?.imageUrl || null, // preview: stored URL (edit) or object URL (new)
    imageName: "",
    imageFile: null,
    startDate: editingPromo?.startDate ?? "",
    endDate: editingPromo?.endDate ?? "",
    priority: editingPromo?.priority ?? 1,
    active: isEdit ? !!editingPromo.isActive : true,
  }));

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm({ ...form, image: URL.createObjectURL(file), imageName: file.name, imageFile: file });
  };

  const handleCancel = () => {
    setEditingPromo(null);
    onNavigate("marketing");
  };

  const handleSave = async () => {
    if (!form.imageFile && !form.image) { toast("A banner image is required"); return; }
    if (!form.startDate || !form.endDate) { toast("Select start and end date"); return; }
    if (form.endDate < form.startDate) { toast("End date must be on or after start date"); return; }
    if (saving) return;
    setSaving(true);

    // Stage inactive first — image-only banners cannot be activated without an
    // image, and the image needs an existing promotion id to upload against.
    const base = {
      bannerType: "IMAGE_ONLY",
      priority: Number(form.priority) || 1,
      startDate: form.startDate,
      endDate: form.endDate,
      isActive: false,
    };
    try {
      const saved = isEdit
        ? await promotionService.updatePromotion(editingPromo.id, base)
        : await promotionService.createPromotion(base);

      // Existing image (edit) counts; a newly picked file replaces it.
      let imageOk = !!editingPromo?.imageUrl;
      if (form.imageFile && saved?.id) {
        try { await promotionService.uploadPromotionImage(saved.id, form.imageFile); imageOk = true; }
        catch { toast("Saved as draft — image upload failed"); imageOk = false; }
      }

      if (form.active && imageOk && saved?.id) {
        await promotionService.updatePromotion(saved.id, { isActive: true });
      } else if (form.active && !imageOk) {
        toast("Add a banner image to activate the banner");
      }

      toast(isEdit ? "Banner updated" : "Banner created");
      setEditingPromo(null);
      onNavigate("marketing");
    } catch (err) {
      toast(err?.message || (isEdit ? "Could not update banner" : "Could not create banner"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={scope} className="mx-auto max-w-[720px]">
      <div data-motion="page-head" className="mb-6 flex items-center gap-3">
        <button onClick={handleCancel} className="flex items-center gap-2 text-sm font-bold hover:text-accent"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back</button>
        <h2 className="text-lg font-extrabold">{isEdit ? "Update Image Banner" : "Create Image Banner"}</h2>
      </div>

      <Card data-motion="reveal" className="p-6">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-extrabold">Image-Only Banner</h3>
          <span className="rounded-full border border-accent-line bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent-strong">Uploaded image is the whole banner</span>
        </div>
        <p className="mt-1 text-xs text-muted">The image is shown to customers in full — no text, button or colors are added over it.</p>

        <div className="mt-5 grid gap-5">
          <div>
            <div className="text-xs font-bold">Banner image *</div>
            <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas/40 px-4 py-10 text-center hover:border-accent hover:bg-canvas/60">
              <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
              {form.image ? (
                <img src={form.image} alt="banner" className="max-h-64 w-auto rounded-lg object-cover" />
              ) : (
                <>
                  <div className="rounded-full bg-white p-3 shadow-sm border border-line"><svg viewBox="0 0 24 24" className="h-5 w-5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V3M8 7l4-4 4 4" /><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" /></svg></div>
                  <span className="mt-2 text-sm font-bold">Upload Image</span>
                  <span className="text-xs text-muted">{form.imageName || "Click to select"}</span>
                </>
              )}
            </label>
            <p className="mt-1.5 text-xs text-muted">Uploaded on save · shown to customers in full — nothing is cropped or overlaid.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">Start date *</span><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">End date *</span><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Priority</span><Input type="number" min={1} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></label>
              <p className="mt-1.5 text-xs text-muted">Higher priority banners are shown first when multiple are active.</p>
            </div>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Active status</span>
              <Select value={form.active ? "Active" : "Inactive"} onValueChange={v => setForm({ ...form, active: v === "Active" })} options={["Active", "Inactive"]} />
            </label>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>Cancel</Button>
            <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Banner" : "Create Banner"}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
