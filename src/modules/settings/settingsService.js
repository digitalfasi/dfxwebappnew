import { apiClient } from "@/_shared/apiClient";

/**
 * Store configuration — the admin's own tenant profile (app/modules/customers,
 * "/admin/tenant/profile").
 *
 *   GET /admin/tenant/profile -> the whole profile
 *   PUT /admin/tenant/profile -> contact + branding columns ONLY
 *
 * The update request deliberately carries no id/tenant_id/name/slug/status: a
 * tenant admin can change how the store is contacted and branded, never the
 * store's identity or its subscription status (that is SuperAdmin territory).
 * So `name`, `slug` and `status` are read-only everywhere in this module.
 */

function mapProfile(p = {}) {
  return {
    id: p.id ?? "",
    name: p.name ?? "",              // read-only
    slug: p.slug ?? "",              // read-only (the store identifier)
    status: p.status ?? "",          // read-only
    contactEmail: p.contact_email ?? "",
    contactPhone: p.contact_phone ?? "",
    gstNumber: p.gst_number ?? "",
    brandColor: p.brand_color ?? "",
    logoUrl: p.logo_url ?? "",
  };
}

export const settingsService = {
  /** GET /api/v1/admin/tenant/profile */
  async getTenantProfile() {
    const res = await apiClient.get("/admin/tenant/profile", { auth: true });
    return mapProfile(res.data?.profile ?? {});
  },

  /**
   * PUT /api/v1/admin/tenant/profile — a partial update: every field is
   * optional server-side, and the string fields reject "" (min_length=1), so
   * only fields with an actual value are sent. Clearing a field back to empty
   * is therefore not supported by the API.
   */
  async updateTenantProfile({ contactEmail, contactPhone, gstNumber, brandColor, logoUrl } = {}) {
    const body = {};
    if (contactEmail && contactEmail.trim()) body.contact_email = contactEmail.trim();
    if (contactPhone && contactPhone.trim()) body.contact_phone = contactPhone.trim();
    if (gstNumber && gstNumber.trim()) body.gst_number = gstNumber.trim();
    if (brandColor && brandColor.trim()) body.brand_color = brandColor.trim();
    if (logoUrl && logoUrl.trim()) body.logo_url = logoUrl.trim();
    const res = await apiClient.put("/admin/tenant/profile", body, { auth: true });
    return mapProfile(res.data?.profile ?? {});
  },
};
