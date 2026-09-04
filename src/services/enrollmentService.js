/**
 * Enrollment integration for the new UI. Ports the existing DFX frontend
 * enrollmentService contract onto the new apiClient. All financial figures
 * (total_paid, maturity, months_paid, available_balance) are backend
 * authoritative — this layer maps names only, computes no business values.
 */
import { apiClient } from "../lib/apiClient";

// Backend EnrollmentStatus (UPPERCASE) -> the label the view renders/filters.
const STATUS_LABEL = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  CLOSED: "Closed",
  REDEEMED: "Redeemed",
};
function labelStatus(s) {
  return STATUS_LABEL[String(s || "").toUpperCase()] ?? s ?? "";
}

/** GET /enrollments item -> the row shape the Enrollments table renders. */
function mapRow(raw) {
  return {
    id: raw.id,
    enrollment: raw.enrollment_number,
    customer: raw.customer_name,
    customerId: raw.customer_id,
    // Customer code is not on the enrollment payload; left blank, not faked.
    code: "",
    scheme: raw.scheme_name,
    joined: raw.joined_date,
    maturity: raw.maturity_date,
    status: labelStatus(raw.status),
    installment: raw.monthly_amount ?? 0,
    paid: raw.months_paid ?? 0,
    total: raw.duration_months ?? 0,
    totalPaid: raw.total_paid ?? 0,
    // Backend base maturity (monthly x duration, no bonus) — authoritative.
    maturityAmount: raw.maturity_amount ?? 0,
    // Authoritative amount still due (max(0, maturity - paid)) computed by the
    // backend. Null when the live backend predates the field — never recomputed.
    outstanding: raw.outstanding_amount ?? null,
    // Redemptions are not on the list payload; enriched from balance on open.
    alreadyRedeemed: 0,
    nextDue: raw.next_due_date,
    remarks: raw.remarks ?? "",
  };
}

export const enrollmentService = {
  /**
   * GET /api/v1/enrollments — admin list. Pass customerId to scope to one
   * customer's enrollments (backend customer_id filter); omit for the full list.
   */
  async getEnrollments(customerId = "") {
    const q = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : "";
    const res = await apiClient.get(`/enrollments${q}`, { auth: true });
    return (res.data?.enrollments ?? []).map(mapRow);
  },

  /**
   * GET /api/v1/enrollments — admin list plus the backend-authoritative KPI
   * summary from the SAME response. Rows use the shared mapRow; `summary` is
   * passed through untouched (per status-filter slices, each carrying
   * active_enrollments, completed, total_paid, outstanding). The frontend never
   * sums or derives these figures — it only displays the slice for the active
   * filter. `summary` is null when the live backend predates the field.
   */
  async getEnrollmentsWithSummary() {
    const res = await apiClient.get("/enrollments", { auth: true });
    return {
      rows: (res.data?.enrollments ?? []).map(mapRow),
      summary: res.data?.summary ?? null,
    };
  },

  /** GET /api/v1/enrollments/{id}/balance — authoritative totals + redemptions. */
  async getBalance(id) {
    const res = await apiClient.get(`/enrollments/${id}/balance`, { auth: true });
    return res.data?.balance ?? null;
  },

  /** PATCH /api/v1/enrollments/{id}/remarks */
  async updateRemarks(id, remarks) {
    const res = await apiClient.patch(`/enrollments/${id}/remarks`, { remarks }, { auth: true });
    return res.data?.enrollment;
  },

  /** POST /api/v1/enrollments/{id}/close — cancel/close with a reason. */
  async closeEnrollment(id, reason) {
    const res = await apiClient.post(`/enrollments/${id}/close`, { reason }, { auth: true });
    return res.data?.balance ?? null;
  },
};
