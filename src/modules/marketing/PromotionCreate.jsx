import { useState, useRef, useEffect } from "react";
import { Card } from "@/_shared/ui/card";
import { Button } from "@/_shared/ui/button";
import { Input } from "@/_shared/ui/input";
import { Select } from "@/_shared/ui/select";
import { usePageMotion, usePressFeedback } from "@/_shared/usePageMotion";
import { toast } from "@/_shared/toast";
import { promotionService } from "@/modules/marketing/promotionService";

/**
 * Create / edit a promotion banner. A banner is ONE image or ONE video, shown in
 * full with nothing drawn over it; every active banner slides in the app
 * carousel in priority order.
 *
 * Save is multi-phase because the upload needs an existing promotion id, and
 * the backend refuses to ACTIVATE a banner whose file is missing:
 *   1) create/update the record staged inactive
 *   2) upload the image or the video
 *   3) activate only if the user chose Active and the file is present.
 * If the upload fails the record is kept as a draft and the form stays open in
 * edit mode with the error on the field, so saving again retries the same banner.
 */

// Mirror the backend limits; checked here only so the admin hears before a
// long upload. The server re-checks every file from its bytes.
const LIMITS = {
  IMAGE: { bytes: 10 * 1024 * 1024, accept: "image/jpeg,image/png,image/webp", hint: "JPEG, PNG or WebP · up to 10 MB" },
  VIDEO: { bytes: 20 * 1024 * 1024, accept: "video/mp4", hint: "MP4 · up to 20 MB" },
};

// The app's Home carousel is width ÷ 1.22 (height clamped 260–340 dp) and fills
// it edge to edge, cropping whatever doesn't fit. The preview uses the same
// shape and the same crop, so the admin sees exactly what customers will see.
const BANNER_RATIO = 1.22;
const BANNER_SIZE_HINT = "Best size 1220 × 1000 px";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const MEDIA_OPTIONS = [
  { value: "IMAGE", label: "Image", icon: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></> },
  { value: "VIDEO", label: "Video", icon: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 10 4-2.5v9L17 14" /></> },
];

const formatBytes = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function FieldError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-danger">
      <svg viewBox="0 0 24 24" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
      <span>{children}</span>
    </p>
  );
}

export default function PromotionCreate({ onNavigate, editingPromo, setEditingPromo }) {
  const scope = useRef(null);
  const objectUrls = useRef([]);
  usePageMotion(scope);
  usePressFeedback(scope);

  const isEdit = !!editingPromo;
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null); // null | pct 0–100
  const [errors, setErrors] = useState({});
  // A browser that can't PREVIEW a file says nothing about whether phones can
  // play it — the server checks the bytes on save. So this is a note, not an error.
  const [previewNote, setPreviewNote] = useState("");
  // Set only when the picked file's shape is far from the app banner's.
  const [shapeNote, setShapeNote] = useState("");

  const checkShape = (w, h) => {
    if (!w || !h) return setShapeNote("");
    const r = w / h;
    if (Math.abs(r - BANNER_RATIO) / BANNER_RATIO <= 0.1) return setShapeNote("");
    setShapeNote(r > BANNER_RATIO
      ? `This is ${w} × ${h} — wider than the app banner, so its left and right edges will be cut off.`
      : `This is ${w} × ${h} — taller than the app banner, so its top and bottom will be cut off.`);
  };

  const saved = (type) => (type === "VIDEO" ? editingPromo?.videoUrl : editingPromo?.imageUrl) || null;
  const [form, setForm] = useState(() => {
    const mediaType = editingPromo?.mediaType || "IMAGE";
    return {
      mediaType,
      title: editingPromo?.title || "",
      src: saved(mediaType), // preview: stored URL (edit) or object URL (new pick)
      file: null,
      startDate: editingPromo?.startDate ?? "",
      endDate: editingPromo?.endDate ?? "",
      priority: editingPromo?.priority ?? 1,
      active: isEdit ? !!editingPromo.isActive : true,
    };
  });
  const isVideo = form.mediaType === "VIDEO";
  const limit = LIMITS[form.mediaType];

  useEffect(() => () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const clearError = (key) => setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  // Switching type shows that type's saved file (if any) — never the other's.
  const chooseType = (mediaType) => {
    if (mediaType === form.mediaType) return;
    setErrors({});
    setPreviewNote("");
    setShapeNote("");
    set({ mediaType, file: null, src: saved(mediaType) });
  };

  const pickFile = (file) => {
    if (!file) return;
    let problem = "";
    if (isVideo) {
      // Some Windows browsers report no type for .mp4; the server decides from the bytes.
      const ok = file.type === "video/mp4" || (!file.type && /\.mp4$/i.test(file.name));
      if (!ok) problem = file.type === "video/quicktime" ? "This is a .mov file. Export it as MP4." : "Use an MP4 video.";
    } else if (!IMAGE_TYPES.includes(file.type)) {
      problem = "Use a JPEG, PNG or WebP image.";
    }
    if (!problem && file.size > limit.bytes) {
      problem = `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(limit.bytes)}.`;
    }
    if (problem) { setErrors((e) => ({ ...e, media: problem })); return; }
    clearError("media");
    setPreviewNote("");
    setShapeNote("");
    const url = URL.createObjectURL(file);
    objectUrls.current.push(url);
    set({ src: url, file });
  };

  const removeFile = () => {
    clearError("media");
    setPreviewNote("");
    setShapeNote("");
    set({ file: null, src: saved(form.mediaType) });
  };

  const handleCancel = () => {
    setEditingPromo(null);
    onNavigate("marketing");
  };

  const validate = () => {
    const e = {};
    if (!form.title.trim()) e.title = "Give the banner a title.";
    if (!form.src) e.media = isVideo ? "Choose a video." : "Choose an image.";
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.dates = "End date must be on or after start date.";
    setErrors(e);
    return !Object.values(e).some(Boolean);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);

    let record;
    try {
      const base = {
        bannerType: "IMAGE_ONLY",
        mediaType: form.mediaType,
        title: form.title.trim(),
        priority: Number(form.priority) || 1,
        startDate: form.startDate,
        endDate: form.endDate,
        isActive: false,
      };
      record = isEdit
        ? await promotionService.updatePromotion(editingPromo.id, base)
        : await promotionService.createPromotion(base);
    } catch (err) {
      toast(err?.message || (isEdit ? "Could not update banner" : "Could not create banner"));
      setSaving(false);
      return;
    }

    const failures = {};
    let fileOk = !form.file && !!(isVideo ? record.videoUrl : record.imageUrl);
    if (form.file) {
      setProgress(0);
      try {
        if (isVideo) {
          record = (await promotionService.uploadPromotionVideo(record.id, form.file, { onProgress: setProgress })).promotion;
        } else {
          record = await promotionService.uploadPromotionImage(record.id, form.file);
        }
        fileOk = true;
      } catch (err) {
        failures.media = err?.message || "Upload failed.";
      }
      setProgress(null);
    }

    if (form.active && fileOk) {
      try {
        record = await promotionService.updatePromotion(record.id, { isActive: true });
      } catch (err) {
        // Most often the five-active-banners cap; the banner itself is saved.
        failures.active = err?.message || "Saved, but the banner could not be activated.";
      }
    }

    setSaving(false);
    if (Object.keys(failures).length) {
      // Stay here in edit mode on the saved draft, so saving again retries it.
      setEditingPromo(record);
      if (fileOk) set({ file: null });
      setErrors(failures);
      toast("Saved as draft — fix the highlighted issue and save again");
      return;
    }
    toast(isEdit ? "Banner updated" : "Banner created");
    setEditingPromo(null);
    onNavigate("marketing");
  };

  const uploading = progress != null;

  return (
    <div ref={scope} className="mx-auto max-w-[720px]">
      <div data-motion="page-head" className="mb-6">
        <h2 className="text-lg font-extrabold">{isEdit ? "Update Banner" : "Create Banner"}</h2>
      </div>

      <Card data-motion="reveal" className="p-5 sm:p-6">
        <div className="grid gap-5">
          <div>
            <div className="text-xs font-bold">Banner type</div>
            <div role="radiogroup" aria-label="Banner type" className="mt-1.5 grid grid-cols-2 gap-2.5">
              {MEDIA_OPTIONS.map((o) => {
                const on = form.mediaType === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={saving}
                    onClick={() => chooseType(o.value)}
                    className={`flex min-h-12 items-center justify-center gap-2.5 rounded-xl border px-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                      on ? "border-accent bg-accent-soft text-accent-strong" : "border-line bg-surface hover:border-accent-line hover:bg-canvas/60"
                    }`}
                  >
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{o.icon}</svg>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-bold">Title *</span>
            <Input
              value={form.title}
              onChange={(e) => { set({ title: e.target.value }); clearError("title"); }}
              placeholder="Festive Season Banner"
              maxLength={120}
              aria-invalid={!!errors.title}
            />
            <span className="text-xs text-muted">For your banner list only — customers don’t see it.</span>
            <FieldError>{errors.title}</FieldError>
          </label>

          <div>
            <div className="text-xs font-bold">{isVideo ? "Video *" : "Image *"}</div>
            {form.src ? (
              <div className={`mt-1.5 overflow-hidden rounded-xl border ${errors.media ? "border-danger-line" : "border-line"}`}>
                <div className="mx-auto w-full max-w-[420px] bg-black" style={{ aspectRatio: BANNER_RATIO }}>
                {isVideo ? (
                  <video
                    key={form.src}
                    src={form.src}
                    controls
                    muted
                    playsInline
                    loop
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      setPreviewNote(v.videoWidth ? "" : "Preview isn’t available in this browser. The video is checked when you save.");
                      if (form.file) checkShape(v.videoWidth, v.videoHeight);
                    }}
                    onError={() => setPreviewNote("Preview isn’t available in this browser. The video is checked when you save.")}
                    className="block h-full w-full object-cover"
                  />
                ) : (
                  <img
                    src={form.src}
                    alt="Banner as customers see it"
                    onLoad={(e) => form.file && checkShape(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
                    className="block h-full w-full object-cover"
                  />
                )}
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2">
                  <span className="min-w-0 truncate text-xs text-muted">{form.file ? `${form.file.name} · ${formatBytes(form.file.size)}` : "Saved"}</span>
                  <div className="flex shrink-0 gap-1.5">
                    <label className={`inline-flex h-9 cursor-pointer items-center rounded-lg border border-line px-3 text-xs font-bold hover:bg-canvas ${saving ? "pointer-events-none opacity-50" : ""}`}>
                      <input type="file" accept={limit.accept} aria-label={`Replace ${isVideo ? "video" : "image"}`} className="sr-only" disabled={saving} onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                      Replace
                    </label>
                    {form.file && (
                      <Button size="sm" variant="outline" onClick={removeFile} disabled={saving} className="h-9 text-danger hover:bg-danger-soft">Remove</Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <label
                style={{ aspectRatio: BANNER_RATIO }}
                className={`mx-auto mt-1.5 flex w-full max-w-[420px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition-colors focus-within:ring-2 focus-within:ring-accent/40 ${
                  errors.media ? "border-danger-line bg-danger-soft/40" : "border-line bg-canvas/40 hover:border-accent hover:bg-canvas/60"
                }`}
              >
                <input type="file" accept={limit.accept} aria-label={`Upload ${isVideo ? "video" : "image"}`} className="sr-only" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
                <div className="rounded-full border border-line bg-surface p-3 shadow-sm">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-muted" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V3M8 7l4-4 4 4" /><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2" /></svg>
                </div>
                <span className="mt-2 text-sm font-bold">{isVideo ? "Upload Video" : "Upload Image"}</span>
                <span className="mt-0.5 text-xs text-muted">{limit.hint}</span>
                <span className="mt-0.5 text-xs font-semibold text-muted">{BANNER_SIZE_HINT}</span>
              </label>
            )}
            <FieldError>{errors.media}</FieldError>
            {previewNote && !errors.media && <p aria-live="polite" className="mt-1.5 text-xs font-semibold text-info">{previewNote}</p>}
            {shapeNote && !errors.media && <p aria-live="polite" className="mt-1.5 text-xs font-semibold text-warn">{shapeNote} {BANNER_SIZE_HINT}.</p>}
            {uploading && (
              <div aria-live="polite" className="mt-2">
                <div className="flex justify-between text-xs font-bold text-accent-strong">
                  <span>{progress < 100 ? "Uploading…" : "Checking file…"}</span>
                  {isVideo && <span className="num font-mono">{progress}%</span>}
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                  <div className={`h-full rounded-full bg-accent transition-[width] duration-200 ${isVideo ? "" : "w-1/3 animate-pulse"}`} style={isVideo ? { width: `${progress}%` } : undefined} />
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5"><span className="text-xs font-bold">Start date <span className="font-semibold text-muted">(optional)</span></span><Input type="date" value={form.startDate} aria-invalid={!!errors.dates} onChange={(e) => { set({ startDate: e.target.value }); clearError("dates"); }} /></label>
              <label className="grid gap-1.5"><span className="text-xs font-bold">End date <span className="font-semibold text-muted">(optional)</span></span><Input type="date" value={form.endDate} aria-invalid={!!errors.dates} onChange={(e) => { set({ endDate: e.target.value }); clearError("dates"); }} /></label>
            </div>
            {!errors.dates && <p className="mt-1.5 text-xs text-muted">Leave blank to show the banner from today with no end date.</p>}
            <FieldError>{errors.dates}</FieldError>
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <span className="text-xs font-bold">Priority</span>
              <Input type="number" min={1} max={5} value={form.priority} onChange={(e) => set({ priority: e.target.value })} />
              {/* Ordinal, not a score: 1 is shown first. */}
              <span className="text-xs text-muted">Slide order in the app — 1 comes first.</span>
            </div>
            <div className="grid gap-1.5">
              <span className="text-xs font-bold">Active status</span>
              <Select value={form.active ? "Active" : "Inactive"} onValueChange={(v) => { set({ active: v === "Active" }); clearError("active"); }} options={["Active", "Inactive"]} />
              <span className="text-xs text-muted">Up to 5 banners can be active at once.</span>
              <FieldError>{errors.active}</FieldError>
            </div>
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
