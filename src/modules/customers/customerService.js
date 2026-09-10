/**
 * Customer + KYC integration for the new UI. Ports the existing DFX frontend
 * customerService contract (endpoints, payloads, response mapping) onto the new
 * apiClient. Classification (customer_type) and kyc_status are backend-derived —
 * this layer maps names only, never recomputes business rules.
 */
import { apiClient } from "@/_shared/apiClient";
import { fmtDate } from "@/_shared/utils";

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
  /**
   * GET /api/v1/admin/customers?page&limit&search — one page of customers,
   * with the server's pagination block.
   *
   * Screens that show the full customer list MUST page and search through this:
   * asking for one big page and filtering it in the browser hid every customer
   * past the requested limit, and a search for one of them came back empty even
   * though the record exists. The server caps `limit` at 100.
   */
  async getCustomerPage({ search = "", page = 1, limit = 20, customerType, kycState } = {}) {
    const params = new URLSearchParams({ page: String(page), limit: String(Math.min(limit, 100)) });
    if (search) params.set("search", search);
    if (customerType) params.set("customer_type", customerType);
    if (kycState) params.set("kyc_state", kycState);
    const res = await apiClient.get(`/admin/customers?${params.toString()}`, { auth: true });
    const p = res.meta?.pagination ?? {};
    const rows = (res.data?.customers ?? []).map(mapRow);
    return {
      rows,
      page: p.page ?? page,
      pageSize: p.page_size ?? limit,
      totalItems: p.total_items ?? rows.length,
      totalPages: p.total_pages ?? 1,
    };
  },

  /**
   * Every customer, by walking the pages. The server caps `limit` at 100, so a
   * single request for a bigger page is rejected outright (422) — which is what
   * silently emptied the birthdays widget. Bounded at 50 pages so a bad total
   * can never spin forever.
   */
  async getAllCustomers({ search = "" } = {}) {
    const all = [];
    let page = 1;
    let totalPages = 1;
    do {
      const res = await customerService.getCustomerPage({ search, page, limit: 100 });
      all.push(...res.rows);
      totalPages = res.totalPages || 1;
      page += 1;
    } while (page <= totalPages && page <= 50);
    return all;
  },

  /** Rows only — for pickers that just need the top matches for a search. */
  async getCustomers(opts = {}) {
    const { rows } = await customerService.getCustomerPage(opts);
    return rows;
  },

  /**
   * GET /api/v1/admin/customers/summary — authoritative counters.
   *
   * The header cards used to count the rows of the fetched page, which is
   * capped at limit=100, so "Total customers" stuck at 100 for any tenant past
   * that. These are COUNT queries on the server.
   */
  async getSummary() {
    const res = await apiClient.get("/admin/customers/summary", { auth: true });
    const s = res.data?.summary ?? {};
    return {
      totalCustomers: s.total_customers ?? 0,
      kycPending: s.kyc_pending ?? 0,
      schemeEnrolled: s.scheme_enrolled ?? 0,
      // Composition over the whole base, counted server-side. Null when an
      // older backend does not send it, so the caller can tell "no data" from
      // a genuine zero.
      types: s.type_walk_in === undefined ? null : {
        "Walk-in": s.type_walk_in ?? 0,
        "Scheme Customer": s.type_scheme ?? 0,
        Hybrid: s.type_hybrid ?? 0,
        New: s.type_new ?? 0,
      },
    };
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

  /**
   * DELETE /api/v1/admin/customers/{id}/test — UAT-only permanent delete.
   * Backend gates this to the designated UAT tenant (UAT_TENANT_SLUG); a normal
   * tenant receives 403 regardless of the UI. On success the customer's
   * mobile/email are released for reuse.
   */
  async deleteTestCustomer(id) {
    const res = await apiClient.delete(`/admin/customers/${id}/test`, { auth: true });
    return res.data?.deleted;
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
