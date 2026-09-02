/**
 * Payment integration for the new UI. Ports the existing DFX frontend
 * paymentService contract onto the new apiClient. Payment status, references,
 * installment coverage and amounts are backend authoritative — this layer maps
 * names only and recreates no business rules.
 */
import { apiClient } from "../lib/apiClient";
import { enrollmentService } from "./enrollmentService";

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
function fmtTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

/** GET /payments item -> the scheme-payment row shape the view renders. */
function mapRow(raw) {
  return {
    id: raw.payment_reference,
    paymentId: raw.id,
    enrollment: raw.enrollment_number,
    customer: raw.customer_name,
    // Mobile is not on the payment payload; left blank, not faked.
    mobile: "",
    scheme: raw.scheme_name,
    amount: raw.amount,
    // A payment transaction is fully paid by definition; outstanding is n/a here.
    paid: raw.amount,
    outstanding: 0,
    status: raw.payment_status,
    method: raw.payment_method,
    date: fmtDate(raw.payment_date),
    time: fmtTime(raw.payment_date),
  };
}

export const paymentService = {
  /** GET /api/v1/payments — admin scheme payment transactions. */
  async getSchemePayments() {
    const res = await apiClient.get("/payments", { auth: true });
    return (res.data?.payments ?? []).map(mapRow);
  },

  /**
   * POST /api/v1/payments/manual — canonical manual payment.
   * The modal collects an enrollment NUMBER; the backend needs the enrollment id,
   * so resolve it from the real enrollment list (no fabrication).
   */
  async recordManualPayment({ enrollmentNumber, amount, method, monthsCovered, remarks }) {
    const enrollments = await enrollmentService.getEnrollments();
    const match = enrollments.find((e) => e.enrollment === String(enrollmentNumber).trim());
    if (!match) {
      const err = new Error(`No enrollment found for ${enrollmentNumber}`);
      err.status = 404;
      throw err;
    }
    const body = {
      enrollment_id: match.id,
      amount,
      payment_method: method,
      ...(monthsCovered ? { months_covered: monthsCovered } : {}),
      ...(remarks ? { remarks } : {}),
    };
    const res = await apiClient.post("/payments/manual", body, { auth: true });
    return res.data?.payment;
  },
};
