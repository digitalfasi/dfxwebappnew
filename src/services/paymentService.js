/**
 * Payment integration for the new UI. Ports the existing DFX frontend
 * paymentService contract onto the new apiClient. Payment status, references,
 * installment coverage and amounts are backend authoritative — this layer maps
 * names only and recreates no business rules.
 */
import { apiClient } from "../lib/apiClient";

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
   * POST /api/v1/payments/manual — canonical scheme manual payment. The caller
   * supplies the backend enrollment id (chosen in the customer-first picker), so
   * no enrollment lookup happens here. Amount, months coverage and maturity caps
   * are re-validated server-side; nothing is recomputed in this layer.
   */
  async recordManualPayment({ enrollmentId, amount, method, paymentDate, monthsCovered, remarks }) {
    const body = {
      enrollment_id: enrollmentId,
      amount,
      payment_method: method,
      ...(paymentDate ? { payment_date: paymentDate } : {}),
      ...(monthsCovered ? { months_covered: monthsCovered } : {}),
      ...(remarks ? { remarks } : {}),
    };
    const res = await apiClient.post("/payments/manual", body, { auth: true });
    return res.data?.payment;
  },
};
