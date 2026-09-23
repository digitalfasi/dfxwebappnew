/**
 * Promotion (marketing banner) integration for the new UI. Ports the existing
 * DFX frontend promotionService contract onto the new apiClient. All persistence
 * is backend-authoritative (/admin/promotions) — this layer maps names only and
 * recreates no business rules. Restores the real Marketing module (the new UI
 * previously used a local mock store).
 */
import { apiClient } from "@/_shared/apiClient";
import { istToday } from "@/_shared/utils";

/** The backend stores the window as timestamps ("2026-09-23T00:00:00Z") but the
 *  form sends and edits plain dates. Kept as YYYY-MM-DD so a date input can show
 *  it and promotionStatus compares like with like — "2026-09-23" sorted before
 *  "2026-09-23T00:00:00Z", which made a banner starting today read Scheduled. */
function toDateOnly(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v ?? null;
}

/** GET /admin/promotions item -> the row/edit shape the Marketing views render. */
function mapPromotion(raw = {}) {
  return {
    id: raw.id,
    bannerType: raw.banner_type ?? "STANDARD",
    // Rows saved before video existed carry no media_type — they are images.
    mediaType: raw.media_type ?? "IMAGE",
    videoUrl: raw.video_url ?? "",
    title: raw.title ?? "",
    subtitle: raw.subtitle ?? "",
    description: raw.description ?? "",
    imageUrl: raw.image_url ?? "",
    buttonText: raw.button_text ?? "",
    buttonLink: raw.button_link ?? "",
    backgroundColor: raw.background_color ?? "",
    textColor: raw.text_color ?? "",
    priority: raw.priority ?? 1,
    isActive: raw.is_active ?? false,
    startDate: toDateOnly(raw.start_date),
    endDate: toDateOnly(raw.end_date),
    createdAt: raw.created_at ?? null,
    updatedAt: raw.updated_at ?? null,
  };
}

/** UI form shape -> backend request body. Only defined keys are sent so an
 *  update PATCHes just what changed. */
function toBody(data = {}) {
  const b = {};
  if (data.bannerType !== undefined) b.banner_type = data.bannerType;
  if (data.mediaType !== undefined) b.media_type = data.mediaType;
  if (data.title !== undefined) b.title = data.title;
  if (data.subtitle !== undefined) b.subtitle = data.subtitle;
  if (data.description !== undefined) b.description = data.description;
  if (data.imageUrl !== undefined) b.image_url = data.imageUrl;
  if (data.buttonText !== undefined) b.button_text = data.buttonText;
  if (data.buttonLink !== undefined) b.button_link = data.buttonLink;
  if (data.backgroundColor !== undefined) b.background_color = data.backgroundColor;
  if (data.textColor !== undefined) b.text_color = data.textColor;
  if (data.priority !== undefined) b.priority = Number(data.priority);
  if (data.isActive !== undefined) b.is_active = data.isActive;
  if (data.startDate !== undefined) b.start_date = data.startDate;
  if (data.endDate !== undefined) b.end_date = data.endDate;
  return b;
}

export const promotionService = {
  /** GET /api/v1/admin/promotions — all promotions for the tenant, highest priority first. */
  async getAdminPromotions() {
    const res = await apiClient.get("/admin/promotions", { auth: true });
    return (res.data?.promotions ?? []).map(mapPromotion);
  },

  /** POST /api/v1/admin/promotions */
  async createPromotion(data) {
    const res = await apiClient.post("/admin/promotions", toBody(data), { auth: true });
    return mapPromotion(res.data?.promotion ?? {});
  },

  /** PUT /api/v1/admin/promotions/{id} — partial update. */
  async updatePromotion(id, data) {
    const res = await apiClient.put(`/admin/promotions/${id}`, toBody(data), { auth: true });
    return mapPromotion(res.data?.promotion ?? {});
  },

  /** POST /api/v1/admin/promotions/{id}/image — upload the banner image; returns
   *  the promotion carrying the stored production URL. */
  async uploadPromotionImage(id, file) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.post(`/admin/promotions/${id}/image`, fd, { auth: true });
    return mapPromotion(res.data?.promotion ?? {});
  },

  /** POST /api/v1/admin/promotions/{id}/video — MP4 for a VIDEO banner, with
   *  upload progress (0–100). The backend verifies the file and may rewrite it
   *  for fast start; `video` in the result reports what it found. */
  async uploadPromotionVideo(id, file, { onProgress, signal } = {}) {
    const fd = new FormData();
    fd.append("file", file);
    const res = await apiClient.upload(`/admin/promotions/${id}/video`, fd, {
      onProgress,
      signal,
      // 20 MB on a slow shop connection can take minutes; the default 45 s
      // request timeout would cut off an upload that is still progressing.
      timeoutMs: 10 * 60 * 1000,
    });
    return { promotion: mapPromotion(res.data?.promotion ?? {}), video: res.data?.video ?? null };
  },

  /** DELETE /api/v1/admin/promotions/{id} — permanent delete. */
  async deletePromotion(id) {
    await apiClient.delete(`/admin/promotions/${id}`, { auth: true });
  },
};

/** Live status label from is_active + the active window (matches old app). */
export function promotionStatus(p) {
  if (!p.isActive) return "Disabled";
  const today = istToday();
  if (p.startDate && today < p.startDate) return "Scheduled";
  if (p.endDate && today > p.endDate) return "Expired";
  return "Active";
}
