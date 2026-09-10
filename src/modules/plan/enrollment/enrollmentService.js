/**
 * Enrollment integration for the new UI. Ports the existing DFX frontend
 * enrollmentService contract onto the new apiClient. All financial figures
 * (total_paid, maturity, months_paid, available_balance) are backend
 * authoritative — this layer maps names only, computes no business values.
 */
import { apiClient } from "@/_shared/apiClient";

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

const MS_PER_DAY = 86400000;

// Whole days between next_due_date and today, floored at 0. Only an ACTIVE
// enrollment with a due date in the past is overdue; COMPLETED and CANCELLED
// records are closed, and a wallet plan has no schedule at all.
function deriveOverdueDays(raw) {
  if (String(raw.status || "").toUpperCase() !== "ACTIVE" || !raw.next_due_date) return 0;
  const due = new Date(raw.next_due_date);
  if (Number.isNaN(due.getTime())) return 0;
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - due) / MS_PER_DAY);
  return days > 0 ? days : 0;
}

// One instalment per 30 overdue days (the schedule is monthly), never more than
// the amount still due to maturity.
function deriveOverdueAmount(raw) {
  const days = deriveOverdueDays(raw);
  if (days <= 0) return 0;
  const installment = Number(raw.monthly_amount) || 0;
  const missed = Math.floor(days / 30) + 1;
  const due = installment * missed;
  const cap = Number(raw.outstanding_amount);
  return Number.isFinite(cap) && cap >= 0 ? Math.min(due, cap) : due;
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
    // The API returns no overdue field, so both are derived here from the only
    // facts the payload carries: status, next_due_date and the instalment. Two
    // screens read them (Enrollment Management's Overdue filter and Payments'
    // Scheme Dues table), so deriving once here keeps them consistent.
    // A wallet enrollment has no next_due_date and can never be overdue.
    overdueDays: deriveOverdueDays(raw),
    overdueAmount: deriveOverdueAmount(raw),
    remarks: raw.remarks ?? "",
    // Reason captured when the enrollment was CLOSED. A different field from
    // `remarks` (the editable operational note) — the close transaction writes
    // closure_reason, so it must be surfaced separately or it looks lost.
    closureReason: raw.closure_reason ?? "",
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

  /**
   * POST /api/v1/admin/customers/{customerId}/enrollments — admin enrolls a
   * chosen customer of their tenant into an active scheme. Backend mirrors the
   * customer self-enroll rules (active scheme, no duplicate active enrollment in
   * the same scheme; different schemes allowed). scheme_tier_id is optional.
   */
  async adminEnrollCustomer(customerId, { schemeId, schemeTierId } = {}) {
    const body = { scheme_id: schemeId, ...(schemeTierId ? { scheme_tier_id: schemeTierId } : {}) };
    const res = await apiClient.post(`/admin/customers/${customerId}/enrollments`, body, { auth: true });
    return res.data?.enrollment;
  },

  /** POST /api/v1/enrollments/{id}/close — cancel/close with a reason. */
  async closeEnrollment(id, reason) {
    const res = await apiClient.post(`/enrollments/${id}/close`, { reason }, { auth: true });
    return res.data?.balance ?? null;
  },

  /**
   * POST /api/v1/billing/sales/{saleId}/redeem-schemes/request-otp — send a
   * single-use, 5-minute code to the customer's app authorising scheme
   * redemption against this sale. Returns the challenge metadata.
   */
  async requestRedemptionOtp(saleId) {
    const res = await apiClient.post(`/billing/sales/${saleId}/redeem-schemes/request-otp`, {}, { auth: true });
    return res.data?.otp ?? null;
  },

  /**
   * POST /api/v1/billing/sales/{saleId}/redeem-schemes — settle one invoice from
   * several scheme balances in ONE atomic backend transaction (all-or-nothing).
   * `items` is [{ enrollmentId, amount }]; the OTP is verified + consumed
   * server-side before any balance is touched. Never chain single redeems.
   */
  async redeemSchemes(saleId, items, otpCode) {
    const res = await apiClient.post(
      `/billing/sales/${saleId}/redeem-schemes`,
      { items: items.map((i) => ({ enrollment_id: i.enrollmentId, amount: i.amount })), otp_code: otpCode },
      { auth: true }
    );
    return res.data?.settlement ?? null;
  },
};
