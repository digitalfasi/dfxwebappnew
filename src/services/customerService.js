/**
 * Customer + KYC integration for the new UI. Ports the existing DFX frontend
 * customerService contract (endpoints, payloads, response mapping) onto the new
 * apiClient. Classification (customer_type) and kyc_status are backend-derived —
 * this layer maps names only, never recomputes business rules.
 */
import { apiClient } from "../lib/apiClient";

/** Backend customer_type (WALK-IN | SCHEME CUSTOMER | HYBRID | NEW) -> new UI label. */
const TYPE_LABEL = {
  "WALK-IN": "Walk-in",
  "SCHEME CUSTOMER": "Scheme Customer",
  "SCHEME": "Scheme Customer",
  "HYBRID": "Hybrid",
  "NEW": "New",
};

function labelType(raw) {
  if (!raw) return "New";
  return TYPE_LABEL[raw.toUpperCase()] ?? raw;
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/** GET /admin/customers list item -> row shape the Customers view renders. */
function mapRow(raw) {
  return {
    id: raw.id,
    name: raw.name,
    code: raw.customer_code ?? "",
    type: labelType(raw.customer_type),
    email: raw.email ?? "—",
    phone: raw.phone ?? "—",
    // Real, backend-derived submission state (Not Submitted | Pending Review |
    // Verified | Rejected). Falls back to raw kyc_status only if absent.
    kyc: raw.kyc_state ?? raw.kyc_status ?? "Not Submitted",
    since: fmtDate(raw.member_since),
    status: raw.is_active ? "Active" : "Inactive",
    dob: raw.date_of_birth ?? "",
    // Profile fields below are not exposed by the backend list; enriched via
    // getOverview when a row is opened. Placeholders keep the drawer honest.
    gender: "—",
    city: "",
    address: "—",
    idType: "—",
    idNo: "—",
    occupation: "—",
    schemes: [],
    history: [],
  };
}

export const customerService = {
  /** GET /api/v1/admin/customers?page&limit&search — real list. */
  async getCustomers({ search = "", page = 1, limit = 100 } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    const res = await apiClient.get(`/admin/customers?${params.toString()}`, { auth: true });
    return (res.data?.customers ?? []).map(mapRow);
  },

  /** POST /api/v1/admin/customers — walk-in/manual create; scheme_id optional. */
  async createCustomer({ name, password, phone, email, dateOfBirth, schemeId }) {
    const body = {
      name,
      password,
      ...(dateOfBirth ? { date_of_birth: dateOfBirth } : {}),
      ...(phone ? { phone } : {}),
      ...(email ? { email } : {}),
      ...(schemeId ? { scheme_id: schemeId } : {}),
    };
    const res = await apiClient.post("/admin/customers", body, { auth: true });
    return res.data?.customer;
  },

  /** PUT /api/v1/admin/customers/{id} — name/phone/email/status. */
  async updateCustomer(id, { name, phone, email, isActive }) {
    const body = {
      ...(name !== undefined ? { name } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(isActive !== undefined ? { is_active: isActive } : {}),
    };
    const res = await apiClient.put(`/admin/customers/${id}`, body, { auth: true });
    return res.data?.customer;
  },

  /** GET /api/v1/admin/customers/{id}/overview — Customer 360 for the drawer. */
  async getOverview(id) {
    const res = await apiClient.get(`/admin/customers/${id}/overview`, { auth: true });
    const o = res.data?.overview;
    if (!o) return null;
    const schemes = (o.enrollments ?? []).map((e) => ({
      name: e.scheme_name,
      code: e.enrollment_number,
      enrolled: e.joined_date ?? "",
      installment: 0,
      paid: e.total_paid ?? 0,
      total: 0,
      status: e.status,
    }));
    const history = [
      ...(o.contributions ?? []).map((c) => ({
        date: (c.entry_date ?? "").slice(0, 10),
        action: "Payment",
        amount: c.amount,
        meta: c.description ?? "Scheme contribution",
      })),
      ...(o.purchases ?? []).map((p) => ({
        date: (p.sale_timestamp ?? "").slice(0, 10),
        action: "Purchase",
        amount: p.final_amount,
        meta: `${p.product_name} · ${p.invoice_number}`,
      })),
    ].sort((a, b) => (a.date < b.date ? 1 : -1));
    return {
      profile: {
        code: o.profile?.customer_code ?? "",
        type: labelType(o.profile?.customer_type),
        since: fmtDate(o.profile?.member_since),
        dob: o.profile?.date_of_birth ?? "",
      },
      totals: o.totals,
      schemes,
      history,
    };
  },

  /* ---- KYC (state machine is backend-owned; statuses: Pending/Verified/Rejected) ---- */

  /** GET /api/v1/kyc — admin KYC records. */
  async getKycRecords() {
    const res = await apiClient.get("/kyc", { auth: true });
    return (res.data?.kyc_records ?? []).map((r) => ({
      id: r.id,
      // user_id links a KYC record to its customer row (customer.id === user_id),
      // so the Customer Directory can open the right record for review.
      userId: r.user_id,
      name: r.customer_name,
      email: r.customer_email ?? "",
      phone: r.customer_phone ?? "",
      docType: r.doc_type ?? "",
      docNumber: r.doc_number ?? "",
      status: r.status,
      rejectionReason: r.rejection_reason ?? "",
      createdAt: r.created_at,
    }));
  },

  /** PUT /api/v1/kyc/{id}/approve */
  async approveKyc(id) {
    const res = await apiClient.put(`/kyc/${id}/approve`, undefined, { auth: true });
    return res.data?.kyc_record;
  },

  /** PUT /api/v1/kyc/{id}/reject { reason } */
  async rejectKyc(id, reason) {
    const res = await apiClient.put(`/kyc/${id}/reject`, { reason }, { auth: true });
    return res.data?.kyc_record;
  },
};
