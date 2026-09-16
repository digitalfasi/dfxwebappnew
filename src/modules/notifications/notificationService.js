import { apiClient } from "@/_shared/apiClient";

/**
 * Notification campaigns — real backend (app/modules/notifications,
 * admin_notification_router.py), admin side.
 *
 * This screen used to be five invented rows in useState. "Send" flipped a
 * local string to "Sent" and nothing left the building, so an admin could
 * announce a Diwali offer to nobody and be told it worked. The backend has
 * had the whole feature all along:
 *
 *   POST   /admin/notifications            -> create a DRAFT
 *   GET    /admin/notifications            -> the tenant's campaigns
 *   GET    /admin/notifications/{id}       -> one campaign
 *   PUT    /admin/notifications/{id}       -> edit, DRAFT only
 *   POST   /admin/notifications/{id}/send  -> actually deliver it
 *   DELETE /admin/notifications/{id}       -> cancel a draft
 *
 * The backend is honest about delivery: a channel with no provider configured
 * comes back FAILED with the reason, rather than reporting a success nobody
 * received. This module passes that through untouched.
 */

// Backend vocabulary (notification_campaign_schema.py). Sent as-is; labels are
// display only, so renaming one can never change what the API receives.
export const CHANNELS = [
  { value: "IN_APP", label: "In-App" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "PUSH", label: "Push" },
];

export const TARGETS = [
  { value: "ALL", label: "All customers" },
  { value: "CUSTOMERS", label: "Specific customers" },
  { value: "SCHEME", label: "Customers enrolled in a scheme" },
];

export const STATUSES = ["DRAFT", "SENT", "FAILED", "CANCELLED"];

export const channelLabel = (v) => CHANNELS.find((c) => c.value === v)?.label ?? v ?? "—";
export const targetLabel = (v) => TARGETS.find((t) => t.value === v)?.label ?? v ?? "—";
export const statusLabel = (v) => (v ? v.charAt(0) + v.slice(1).toLowerCase() : "—");

export const STATUS_TONE = {
  DRAFT: "neutral",
  SENT: "success",
  FAILED: "danger",
  CANCELLED: "warning",
};

function mapCampaign(c = {}) {
  return {
    id: c.id,
    title: c.title ?? "",
    body: c.body ?? "",
    channel: c.channel ?? "IN_APP",
    targetType: c.target_type ?? "ALL",
    targetIds: Array.isArray(c.target_ids) ? c.target_ids : [],
    status: c.status ?? "DRAFT",
    // Counted by the backend when it sent. Null before that - and null is
    // rendered as a dash, never as 0, because "0 people" and "not sent yet"
    // are different facts.
    recipientCount: c.recipient_count ?? null,
    sentAt: c.sent_at ?? null,
    error: c.error ?? null,
    createdAt: c.created_at ?? null,
  };
}

export const notificationService = {
  /** GET /api/v1/admin/notifications — the tenant's campaigns, newest first. */
  async list() {
    const res = await apiClient.get("/admin/notifications", { auth: true });
    return (res.data?.notifications ?? []).map(mapCampaign);
  },

  /** POST /api/v1/admin/notifications — creates a DRAFT. Never sends. */
  async createDraft({ title, body, channel, targetType, targetIds = [] }) {
    const res = await apiClient.post(
      "/admin/notifications",
      { title, body, channel, target_type: targetType, target_ids: targetIds },
      { auth: true },
    );
    return mapCampaign(res.data?.notification ?? {});
  },

  /** PUT /api/v1/admin/notifications/{id} — DRAFT only; the server enforces it. */
  async updateDraft(id, { title, body, channel, targetType, targetIds }) {
    const patch = {};
    if (title !== undefined) patch.title = title;
    if (body !== undefined) patch.body = body;
    if (channel !== undefined) patch.channel = channel;
    if (targetType !== undefined) patch.target_type = targetType;
    if (targetIds !== undefined) patch.target_ids = targetIds;
    const res = await apiClient.put(`/admin/notifications/${id}`, patch, { auth: true });
    return mapCampaign(res.data?.notification ?? {});
  },

  /**
   * POST /api/v1/admin/notifications/{id}/send — real delivery.
   *
   * A campaign can come back FAILED from a 200 response: no recipients matched,
   * or the channel has no provider configured. The caller must read `status`
   * and `error` off the returned campaign rather than assuming success.
   */
  async send(id) {
    const res = await apiClient.post(`/admin/notifications/${id}/send`, {}, { auth: true });
    return mapCampaign(res.data?.notification ?? {});
  },

  /** DELETE /api/v1/admin/notifications/{id} — cancels a draft. */
  async cancel(id) {
    await apiClient.delete(`/admin/notifications/${id}`, { auth: true });
  },
};
