import { useState, useRef } from "react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";

export default function PromotionCreate({ onNavigate, promotions, setPromotions, editingPromo, setEditingPromo }) {
  const scope = useRef(null);
  usePageMotion(scope);
  usePressFeedback(scope);

  const isEdit = !!editingPromo;

  const [form, setForm] = useState(() => ({
    title: editingPromo?.title ?? "",
    subtitle: editingPromo?.subtitle ?? "",
    description: editingPromo?.description ?? "",
    bannerType: editingPromo?.bannerType ?? "Standard Banner",
    image: editingPromo?.image ?? null,
    imageName: editingPromo?.imageName ?? "",
    buttonText: editingPromo?.buttonText ?? "",
    buttonLink: editingPromo?.buttonLink ?? "",
    bgColor: editingPromo?.bgColor ?? "#fffbf0",
    textColor: editingPromo?.textColor ?? "#1e293b",
    startDate: editingPromo?.start ?? "",
    endDate: editingPromo?.end ?? "",
    priority: editingPromo?.priority ?? 1,
    active: editingPromo ? !!editingPromo.enabled : true,
  }));

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm({ ...form, image: URL.createObjectURL(file), imageName: file.name });
  };

  const handleCancel = () => {
    setEditingPromo(null);
    onNavigate("marketing");
  };

  const handleCreate = () => {
    if (!form.title.trim()) { toast("Promotion title is required"); return; }
    if (!form.startDate || !form.endDate) { toast("Select start and end date"); return; }
    if (isEdit) {
      setPromotions(prev => prev.map(p => p.id === editingPromo.id ? { ...p, title: form.title, subtitle: form.subtitle, description: form.description, bannerType: form.bannerType, image: form.image, imageName: form.imageName, buttonText: form.buttonText, buttonLink: form.buttonLink, bgColor: form.bgColor, textColor: form.textColor, priority: Number(form.priority), start: form.startDate, end: form.endDate, status: form.active ? "Active" : "Disabled", enabled: form.active } : p));
      toast("Promotion updated");
    } else {
      setPromotions(prev => [{ id: Date.now(), title: form.title, subtitle: form.subtitle, description: form.description, bannerType: form.bannerType, image: form.image, imageName: form.imageName, buttonText: form.buttonText, buttonLink: form.buttonLink, bgColor: form.bgColor, textColor: form.textColor, priority: Number(form.priority), start: form.startDate, end: form.endDate, status: form.active ? "Active" : "Disabled", enabled: form.active }, ...prev]);
      toast("Promotion created");
    }
    setEditingPromo(null);
    onNavigate("marketing");
  };

  return (
    <div ref={scope} className="mx-auto max-w-[900px]">
      <div data-motion="page-head" className="mb-6 flex items-center gap-3">
        <button onClick={handleCancel} className="flex items-center gap-2 text-sm font-bold hover:text-accent"><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back</button>
        <h2 className="text-lg font-extrabold">{isEdit ? "Update Promotion" : "Create Promotion"}</h2>
      </div>

      <Card data-motion="reveal" className="p-6">
        <h3 className="text-base font-extrabold">{isEdit ? "Update Promotion" : "Create Promotion"}</h3>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5"><span className="text-xs font-bold">Promotion title</span><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Diwali Gold Offer" /></label>
          <label className="grid gap-1.5"><span className="text-xs font-bold">Promotion subtitle</span><Input value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} placeholder="e.g. Flat 20% off on making charges" /></label>
          <label className="grid gap-1.5"><span className="text-xs font-bold">Promotion description</span><textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} placeholder="Short description shown under banner title" className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-soft)]" /></label>

          <div>
            <div className="text-xs font-bold">Banner type</div>
            <div className="mt-1.5 flex gap-2">
              {["Standard Banner", "Image-Only Banner"].map(t => (
                <button key={t} type="button" onClick={() => setForm({ ...form, bannerType: t })} className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-colors ${form.bannerType === t ? "border-accent bg-accent text-white" : "border-line bg-white text-muted hover:border-accent-line"}`}>{t}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold">Banner image</div>
            <label className="mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-canvas/40 px-4 py-8 text-center hover:border-accent hover:bg-canvas/60">
              <input type="file" accept="image/*" className="hidden" onChange={handleImage} />
              {form.image ? (
                <img src={form.image} alt="banner" className="max-h-48 w-auto rounded-lg object-cover" />
              ) : (
                <>
                  <div className="rounded-full bg-white p-3 shadow-sm border border-line"><svg viewBox="0 0 24 24" className="h-5 w-5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V3M8 7l4-4 4 4" /><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" /></svg></div>
                  <span className="mt-2 text-sm font-bold">Upload Image</span>
                  <span className="text-xs text-muted">{form.imageName || "Click to select"}</span>
                </>
              )}
            </label>
            <p className="mt-1.5 text-xs text-muted">Uploaded on save • Shown to customers at 16:9 • Keep key content centered</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">Button text</span><Input value={form.buttonText} onChange={e => setForm({ ...form, buttonText: e.target.value })} placeholder="e.g. Shop Now" /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Button link</span><Input value={form.buttonLink} onChange={e => setForm({ ...form, buttonLink: e.target.value })} placeholder="e.g. /catalogue or https://..." /></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">Background color</span><div className="flex items-center gap-2"><input type="color" value={form.bgColor} onChange={e => setForm({ ...form, bgColor: e.target.value })} className="h-10 w-10 rounded-lg border border-line p-1" /><Input value={form.bgColor} onChange={e => setForm({ ...form, bgColor: e.target.value })} className="flex-1" /></div></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Text color</span><div className="flex items-center gap-2"><input type="color" value={form.textColor} onChange={e => setForm({ ...form, textColor: e.target.value })} className="h-10 w-10 rounded-lg border border-line p-1" /><Input value={form.textColor} onChange={e => setForm({ ...form, textColor: e.target.value })} className="flex-1" /></div></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5"><span className="text-xs font-bold">Start date</span><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="grid gap-1.5"><span className="text-xs font-bold">End date</span><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="grid gap-1.5"><span className="text-xs font-bold">Priority</span><Input type="number" min={1} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} /></label>
              <p className="mt-1.5 text-xs text-muted">Higher priority banners are shown first when multiple are active</p>
            </div>
            <label className="grid gap-1.5"><span className="text-xs font-bold">Active status</span>
              <Select value={form.active ? "Active" : "Inactive"} onValueChange={v => setForm({ ...form, active: v === "Active" })} options={["Active", "Inactive"]} />
            </label>
          </div>

          <div className="flex justify-end gap-2.5 border-t border-line pt-4">
            <Button variant="outline" size="sm" onClick={handleCancel}>Cancel</Button>
            <Button size="sm" className="bg-accent hover:bg-accent-strong" onClick={handleCreate}>{isEdit ? "Update Promotion" : "Create Promotion"}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
