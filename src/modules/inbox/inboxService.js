import { apiClient } from "@/_shared/apiClient";

/**
 * Shop-user notification inbox — the header bell (backend app/modules/inbox).
 *
 * Every item is read live from the record that caused it: a scheme request, a
 * KYC submission, a payment made in the app, a support ticket or a customer's
 * reply. The server filters by the staff member's module grants, so this layer
 * never decides what someone may see. Only read state is written.
 *
 *   GET  /inbox?limit&before&unread   newest first, cursor paged
 *   GET  /inbox/unread-count          badge
 *   POST /inbox/read  {keys}          mark some read (idempotent)
 *   POST /inbox/read-all              mark everything read
 */

// Fired after anything changes read state, so the bell and the full page stay
// in step without sharing a store.
export const INBOX_CHANGED = "dfx:inbox-changed";
const announce = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(INBOX_CHANGED));
};

const mapItem = (i = {}) => ({
  key: i.key,
  kind: i.kind,
  title: i.title ?? "",
  body: i.body ?? "",
  page: i.page ?? null,
  createdAt: i.created_at ?? null,
  read: !!i.read,
});

export const inboxService = {
  async list({ limit = 10, before = null, unread = false } = {}) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (before) q.set("before", before);
    if (unread) q.set("unread", "true");
    const res = await apiClient.get(`/inbox?${q}`, { auth: true });
    const d = res.data ?? {};
    return {
      items: (d.items ?? []).map(mapItem),
      unreadCount: d.unread_count ?? 0,
      unreadCapped: !!d.unread_capped,
      nextBefore: d.next_before ?? null,
    };
  },

  async unreadCount() {
    const res = await apiClient.get("/inbox/unread-count", { auth: true });
    return { count: res.data?.unread_count ?? 0, capped: !!res.data?.unread_capped };
  },

  async markRead(keys) {
    if (!keys?.length) return;
    await apiClient.post("/inbox/read", { keys }, { auth: true });
    announce();
  },

  async markAllRead() {
    await apiClient.post("/inbox/read-all", {}, { auth: true });
    announce();
  },
};
