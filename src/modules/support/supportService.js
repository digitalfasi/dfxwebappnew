import { apiClient } from "@/_shared/apiClient";

/**
 * Support tickets — real backend (app/modules/support), admin side.
 *
 * What the backend gives an admin, and therefore all this module can do:
 *   GET  /admin/support/tickets              -> every ticket in the tenant
 *   GET  /admin/support/tickets/{id}         -> one ticket + its full thread
 *   PUT  /admin/support/tickets/{id}         -> status and/or priority
 *   POST /admin/support/tickets/{id}/messages-> an admin reply on the thread
 *
 * Tickets are RAISED BY CUSTOMERS in the mobile app (POST /customer/support/
 * tickets); there is no admin route to open one on a customer's behalf, no
 * assignment/owner concept, no internal notes and no satisfaction rating — so
 * this module offers none of those rather than storing them nowhere.
 */

// The backend vocabulary (support/schema.py). Sent as-is; the labels are only
// for display, so a renamed label can never change what the API receives.
export const TICKET_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

export const TICKET_PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

export const statusLabel = (v) => TICKET_STATUSES.find((s) => s.value === v)?.label ?? v ?? "—";
export const priorityLabel = (v) => TICKET_PRIORITIES.find((p) => p.value === v)?.label ?? v ?? "—";

export const STATUS_TONE = { OPEN: "danger", IN_PROGRESS: "warning", RESOLVED: "success", CLOSED: "neutral" };
export const PRIORITY_TONE = { URGENT: "danger", HIGH: "warning", MEDIUM: "info", LOW: "neutral" };

function mapMessage(m = {}) {
  return {
    id: m.id,
    ticketId: m.ticket_id,
    senderId: m.sender_id,
    senderName: m.sender_name ?? "",
    message: m.message ?? "",
    createdAt: m.created_at ?? null,
  };
}

function mapTicket(t = {}) {
  return {
    id: t.id,
    ticketNumber: t.ticket_number ?? "",
    customerName: t.customer_name ?? "",
    customerEmail: t.customer_email ?? "",
    userId: t.user_id ?? "",
    subject: t.subject ?? "",
    description: t.description ?? "",
    category: t.category ?? "",
    priority: t.priority ?? "MEDIUM",
    status: t.status ?? "OPEN",
    createdAt: t.created_at ?? null,
    updatedAt: t.updated_at ?? null,
    // Only the detail endpoint carries the thread; the list omits it.
    messages: Array.isArray(t.messages) ? t.messages.map(mapMessage) : [],
  };
}

export const supportService = {
  /** GET /api/v1/admin/support/tickets — the tenant's tickets, newest first. */
  async listTickets() {
    const res = await apiClient.get("/admin/support/tickets", { auth: true });
    return (res.data?.tickets ?? []).map(mapTicket);
  },

  /** GET /api/v1/admin/support/tickets/{id} — ticket plus its message thread. */
  async getTicket(id) {
    const res = await apiClient.get(`/admin/support/tickets/${id}`, { auth: true });
    return mapTicket(res.data?.ticket ?? {});
  },

  /**
   * PUT /api/v1/admin/support/tickets/{id} — status and/or priority. Both are
   * optional server-side, so only what actually changed is sent.
   */
  async updateTicket(id, { status, priority } = {}) {
    const body = {};
    if (status) body.status = status;
    if (priority) body.priority = priority;
    const res = await apiClient.put(`/admin/support/tickets/${id}`, body, { auth: true });
    return mapTicket(res.data?.ticket ?? {});
  },

  /**
   * POST /api/v1/admin/support/tickets/{id}/messages — reply on the thread. The
   * customer sees this in the app; there is no separate internal-note channel,
   * so anything written here is visible to them.
   */
  async replyToTicket(id, message) {
    const res = await apiClient.post(`/admin/support/tickets/${id}/messages`, { message }, { auth: true });
    return mapMessage(res.data?.message ?? {});
  },
};
