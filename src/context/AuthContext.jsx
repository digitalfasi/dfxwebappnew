"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authService } from "../lib/authService";
import { tokenStore } from "../lib/apiClient";

/**
 * App-wide authentication context. Infrastructure only — no visual output.
 * Wraps the existing authService/apiClient (POST /auth/login, GET /users/me,
 * POST /auth/refresh, POST /auth/logout). Exposes the current user plus the
 * role/tenant/permissions the backend already returns on the user object.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenantName, setTenantName] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: if a token exists, resolve the current user; drop to signed-out
  // when the token is missing/expired/revoked.
  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!tokenStore.getAccessToken()) {
        if (alive) setLoading(false);
        return;
      }
      try {
        const u = await authService.fetchCurrentUser();
        if (alive) setUser(u);
        const tn = await authService.getTenantName();
        if (alive) setTenantName(tn);
      } catch {
        tokenStore.clear();
      } finally {
        if (alive) setLoading(false);
      }
    }
    boot();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (username, password) => {
    const u = await authService.loginWithEmail(username, password);
    setUser(u);
    authService.getTenantName().then(setTenantName);
    return u;
  }, []);

  const logout = useCallback(() => {
    // Clear client session immediately so the UI returns to login without
    // waiting on the network; revoke the refresh token best-effort in the
    // background (preserves the existing backend logout behavior).
    authService.logout(); // best-effort backend revoke (reads refresh token synchronously)
    tokenStore.clear();
    setUser(null);
    setTenantName(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const u = await authService.fetchCurrentUser();
    setUser(u);
    return u;
  }, []);

  const permissions = user?.permissions ?? [];
  const hasPermission = useCallback(
    (perm) => permissions.includes(perm),
    [permissions]
  );

  const value = {
    user,
    role: user?.role ?? null,
    backendRole: user?.backendRole ?? null,
    tenantId: user?.tenantId ?? null,
    tenantName,
    permissions,
    hasPermission,
    isAuthenticated: !!user,
    loading,
    login,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
