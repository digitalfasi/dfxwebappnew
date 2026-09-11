import { apiClient } from "@/_shared/apiClient";

/**
 * Branches — real backend, /api/v1/admin/branches.
 *
 * The screen used to keep branches in React state alone: every branch vanished
 * on refresh, and nothing ever reached the database. These endpoints existed
 * the whole time; they were simply never called.
 *
 * There is deliberately NO delete endpoint on the backend. A branch is
 * referenced by the customer-facing branch locator, so it is deactivated rather
 * than removed — the UI says "Deactivate", not "Delete", because that is what
 * actually happens.
 */
function mapBranch(raw = {}) {
  return {
    id: raw.id,
    name: raw.name ?? "",
    address: raw.address ?? "",
    phone: raw.phone ?? "",
    latitude: raw.latitude,
    longitude: raw.longitude,
    isActive: raw.is_active ?? true,
  };
}

function toBody(data = {}) {
  const b = {};
  if (data.name !== undefined) b.name = data.name;
  if (data.address !== undefined) b.address = data.address;
  if (data.phone !== undefined) b.phone = data.phone;
  if (data.latitude !== undefined) b.latitude = Number(data.latitude);
  if (data.longitude !== undefined) b.longitude = Number(data.longitude);
  return b;
}

export const branchService = {
  /** GET /admin/branches — the tenant's branches, inactive ones included. */
  async getBranches() {
    const res = await apiClient.get("/admin/branches", { auth: true });
    return (res.data?.branches ?? []).map(mapBranch);
  },

  /** POST /admin/branches */
  async createBranch(data) {
    const res = await apiClient.post("/admin/branches", toBody(data), { auth: true });
    return mapBranch(res.data?.branch ?? {});
  },

  /** PUT /admin/branches/{id} — every field is optional backend-side, so an
   *  edit sends only what the form holds. */
  async updateBranch(id, data) {
    const res = await apiClient.put(`/admin/branches/${encodeURIComponent(id)}`, toBody(data), { auth: true });
    return mapBranch(res.data?.branch ?? {});
  },

  /** PUT /admin/branches/{id}/status — activate or deactivate. */
  async setBranchStatus(id, isActive) {
    const res = await apiClient.put(
      `/admin/branches/${encodeURIComponent(id)}/status`,
      { is_active: isActive },
      { auth: true }
    );
    return mapBranch(res.data?.branch ?? {});
  },
};
