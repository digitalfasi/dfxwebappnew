/**
 * Authentication against the existing DFX backend contract.
 * POST /auth/login { username, password } -> data { access_token, refresh_token }
 * GET  /users/me -> data.user (current user)
 * POST /auth/logout (auth) -> revoke refresh token
 * Ported from the existing DFX frontend; UI is intentionally not reused.
 */

import { ApiError, STORAGE_KEYS, apiClient, tokenStore } from "./apiClient";

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

  /** GET /users/me is the identity; the store/tenant display name comes from
   *  GET /admin/tenant/profile. Best-effort — staff without access simply 403. */
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
