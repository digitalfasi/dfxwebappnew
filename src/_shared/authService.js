/**
 * Authentication against the existing DFX backend contract.
 * POST /auth/login { username, password } -> data { access_token, refresh_token }
 * GET  /users/me -> data.user (current user)
 * POST /auth/logout (auth) -> revoke refresh token
 * Ported from the existing DFX frontend; UI is intentionally not reused.
 */

import { ApiError, STORAGE_KEYS, apiClient, tokenStore } from "@/_shared/apiClient";

const ROLE_MAP = {
  Customer: "customer",
  Staff: "admin",
  Admin: "admin",
  SuperAdmin: "superadmin",
};

function mapBackendUser(raw) {
  return {
    id: raw.id,
    name: raw.name,
    phone: raw.phone ?? "",
    email: raw.email ?? undefined,
    role: ROLE_MAP[raw.role] ?? "customer",
    backendRole: raw.role,
    tenantId: raw.tenant_id ?? undefined,
    kycStatus: raw.kyc_status ?? "Pending",
    memberSince: raw.member_since ?? "",
    permissions: raw.permissions ?? [],
    tenantName: raw.tenant_name ?? null,
    tenantLogoUrl: raw.tenant_logo_url ?? null,
    tenantPhone: raw.tenant_phone ?? null,
  };
}

function persistUser(user) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
  localStorage.setItem(STORAGE_KEYS.role, user.role);
}

export const authService = {
  async fetchCurrentUser() {
    const res = await apiClient.get("/users/me", { auth: true });
    const raw = res.data?.user ?? res.data;
    if (!raw?.id) throw new ApiError("Could not load the current user.", 500);
    const user = mapBackendUser(raw);
    persistUser(user);
    return user;
  },

  async loginWithEmail(username, pass) {
    const res = await apiClient.post("/auth/login", {
      username: String(username).trim(),
      password: pass,
    });
    const tokens = res.data;
    if (!tokens?.access_token || !tokens?.refresh_token) {
      throw new ApiError("Login response did not contain a valid token pair.", 500);
    }
    tokenStore.setTokens(tokens.access_token, tokens.refresh_token);
    return this.fetchCurrentUser();
  },

  /**
   * POST /auth/forgot-password { email }
   *
   * The server answers the same way whether or not the address matches an
   * account - that is deliberate, so this screen cannot be used to discover
   * who has one - and its message is what we show, unchanged.
   */
  async requestPasswordReset(email) {
    const res = await apiClient.post("/auth/forgot-password", {
      email: String(email).trim(),
    });
    return res.message || "If an account exists for that email, a reset link has been sent.";
  },

  getCurrentUser() {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEYS.user);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    return !!tokenStore.getAccessToken();
  },

  /** The shop name now travels on GET /users/me, so every signed-in user —
   *  staff included — gets their OWN shop. This used to read
   *  /admin/tenant/profile, which is admin-only: staff got 403, the catch
   *  returned null, and the sidebar fell back to the product name, showing a
   *  staff member a different business's identity.
   *
   *  The admin profile is still read for an Admin, because it is the record the
   *  shop edits and may be fresher; /users/me is the fallback for everyone. */
  async getTenantName() {
    try {
      const res = await apiClient.get("/admin/tenant/profile", { auth: true });
      return res.data?.profile?.name ?? null;
    } catch {
      return null;
    }
  },

  async logout() {
    try {
      if (tokenStore.getRefreshToken()) {
        await apiClient.post(
          "/auth/logout",
          { refresh_token: tokenStore.getRefreshToken() },
          { auth: true }
        );
      }
    } catch {
      /* ignore network/401 on logout */
    } finally {
      tokenStore.clear();
    }
  },
};
