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
   * GET /api/v1/payments/summary — backend-authoritative Scheme money-in for a
   * period. Reads data.total_collected and data.collected_by_method directly
   * (no frontend row reduction). The backend already counts SUCCESS scheme
   * payments only (PENDING/FAILED/CANCELLED/REFUNDED excluded) and groups the
   * split by payment_method (scheme Payment has no source field). Mapping:
   * Offline = CASH; Online = UPI + CARD + BANK_TRANSFER; Other = remainder
   * (CHEQUE/ONLINE/any other method); Total = total_collected. Accepts one
   * named period OR a custom { dateFrom, dateTo } range (both required;
   * date_from/date_to win over period). Returns null when unavailable.
   */
  async getSchemePaymentSummary({ period = "today", dateFrom = "", dateTo = "" } = {}) {
    const params = new URLSearchParams();
    if (dateFrom && dateTo) {
      params.set("date_from", dateFrom);
      params.set("date_to", dateTo);
    } else {
      params.set("period", period);
    }
    const res = await apiClient.get(`/payments/summary?${params.toString()}`, { auth: true });
    const d = res.data ?? null;
    if (!d) return null;
    const m = d.collected_by_method ?? {};
    const val = (k) => Number(m[k]) || 0;
    const offline = val("CASH");
    const online = val("UPI") + val("CARD") + val("BANK_TRANSFER");
    const total = Number(d.total_collected) || 0;
    // Other is the residual so the parts always sum to total_collected even if
    // the backend returns a method key we haven't classified — never row-derived.
    const other = Math.max(0, Number((total - offline - online).toFixed(2)));
    return { offline, online, other, total, label: d.period ?? "" };
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
