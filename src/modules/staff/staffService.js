import { apiClient } from "@/_shared/apiClient";

/**
 * Staff & Users — real backend (app/modules/staff). Everything here is
 * tenant-scoped by the token; an admin only ever sees and edits their own
 * tenant's staff.
 *
 * What the backend supports, and therefore what this module can do:
 *   GET  /admin/staff/permission-catalog  -> the grouped module list to render
 *   GET  /admin/staff                     -> list staff
 *   POST /admin/staff                     -> create staff (always Staff role)
 *   PUT  /admin/staff/{id}/status         -> activate / deactivate
 *   PUT  /admin/staff/{id}/permissions    -> replace the whole grant set
 *
 * There is deliberately NO endpoint to change an existing staff member's name,
 * email, phone or password, so this service exposes none — the UI shows those
 * fields read-only rather than pretending an edit was saved.
 *
 * The create request carries no role field at all: the Staff role is hardcoded
 * server-side, so a tenant admin cannot escalate an account to Admin.
 */

function mapStaff(s = {}) {
  return {
    id: s.id,
    name: s.name ?? "",
    email: s.email ?? "",
    phone: s.phone ?? "",
    isActive: !!s.is_active,
    memberSince: s.member_since ?? null,
    // Flat set of module KEYS (not labels) — the catalog turns them into text.
    permissions: Array.isArray(s.permissions) ? s.permissions : [],
    createdAt: s.created_at ?? null,
  };
}

export const staffService = {
  /**
   * GET /api/v1/admin/staff/permission-catalog — the Scheme/Business grouping
   * the form renders. `allModules` is the authoritative set of valid keys.
   *
   * A few keys ("reports", "analytics", "notifications") intentionally appear
   * in BOTH groups with different context labels. The grant set is flat, so the
   * same key selected under either group is one and the same permission.
   */
  async getPermissionCatalog() {
    const res = await apiClient.get("/admin/staff/permission-catalog", { auth: true });
    const d = res.data ?? {};
    return {
      groups: (d.groups ?? []).map((g) => ({
        group: g.group,
        label: g.label,
        modules: (g.modules ?? []).map((m) => ({ key: m.key, label: m.label })),
      })),
      allModules: d.all_modules ?? [],
    };
  },

  /** GET /api/v1/admin/staff — all Staff-role users in the admin's tenant. */
  async listStaff() {
    const res = await apiClient.get("/admin/staff", { auth: true });
    return (res.data?.staff ?? []).map(mapStaff);
  },

  /**
   * POST /api/v1/admin/staff — create a Staff account. Email and phone are both
   * optional server-side, so they are omitted rather than sent as "" (an empty
   * string fails EmailStr validation). A new account starts active.
   */
  async createStaff({ name, email, phone, password, permissions = [] }) {
    const body = { name: name.trim(), password, permissions };
    if (email && email.trim()) body.email = email.trim();
    if (phone && phone.trim()) body.phone = phone.trim();
    const res = await apiClient.post("/admin/staff", body, { auth: true });
    return mapStaff(res.data?.staff ?? {});
  },

  /** PUT /api/v1/admin/staff/{id}/status — activate / deactivate. */
  async setStaffStatus(id, isActive) {
    const res = await apiClient.put(`/admin/staff/${id}/status`, { is_active: !!isActive }, { auth: true });
    return mapStaff(res.data?.staff ?? {});
  },

  /**
   * PUT /api/v1/admin/staff/{id}/permissions — REPLACES the full grant set (it
   * is not additive), so always send every module the staff member should keep.
   */
  async setStaffPermissions(id, permissions) {
    const res = await apiClient.put(`/admin/staff/${id}/permissions`, { permissions }, { auth: true });
    return mapStaff(res.data?.staff ?? {});
  },
};
