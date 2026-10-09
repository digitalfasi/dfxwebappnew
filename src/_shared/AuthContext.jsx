"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { authService } from "@/_shared/authService";
import { shopHas } from "@/_shared/moduleAccess";
import { apiClient, tokenStore, SESSION_EXPIRED_EVENT } from "@/_shared/apiClient";

/**
 * App-wide authentication context. Infrastructure only — no visual output.
 * Wraps the existing authService/apiClient (POST /auth/login, GET /users/me,
 * POST /auth/refresh, POST /auth/logout). Exposes the current user plus the
 * role/tenant/permissions the backend already returns on the user object.
 */
const AuthContext = createContext(null);

/** Fired by Settings after the store profile is saved: { logoUrl }. */
export const TENANT_BRAND_EVENT = "dfx:tenant-brand";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenantName, setTenantName] = useState(null);
  const [tenantLogo, setTenantLogo] = useState(null);
  // The shop's contact phone, for a signed-in person with none of their own.
  const [tenantPhone, setTenantPhone] = useState(null);
  const [loading, setLoading] = useState(true);

  // Heartbeat: once a minute while this tab is open (even in the background
  // or idle), tell the server this login is still here. The Super Admin shows
  // a person as Live exactly as long as their browser has DFX open. A failure
  // is ignored - it only means the next beat tries again.
  useEffect(() => {
    if (!user) return undefined;
    const beat = () => { apiClient.get("/auth/heartbeat", { auth: true }).catch(() => {}); };
    beat();
    const id = setInterval(beat, 60000);
    return () => clearInterval(id);
  }, [user]);

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
        if (alive) { setUser(u); setTenantLogo(u?.tenantLogoUrl || null); setTenantPhone(u?.tenantPhone || null); }
        // /users/me carries the caller's own shop name, so staff are never left
        // with the product name. The admin-only profile is still preferred when
        // it resolves; it is the record the shop edits.
        // The SuperAdmin has no shop, so there is no shop profile to read.
        const tn = u?.backendRole === "SuperAdmin" ? null : await authService.getTenantName();
        if (alive) setTenantName(tn || u?.tenantName || null);
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

  // Mid-session hard expiry: the apiClient clears tokens when both access and
  // refresh are dead and emits SESSION_EXPIRED_EVENT. Drop the user so AuthGate
  // falls back to the login screen instead of a stuck, falsely-authenticated UI.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onExpired = () => {
      tokenStore.clear();
      setUser(null);
      setTenantName(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (username, password) => {
    const u = await authService.loginWithEmail(username, password);
    // The login response carries no logo and no shop modules; /users/me does.
    // Waited for, so a shop without Billing never sees Billing for a moment.
    const me = await authService.fetchCurrentUser().catch(() => null);
    setUser(me ? { ...u, shopModules: me.shopModules } : u);
    if (me) { setTenantLogo(me.tenantLogoUrl || null); setTenantPhone(me.tenantPhone || null); }
    if (u?.backendRole !== "SuperAdmin") authService.getTenantName().then((tn) => setTenantName(tn || u?.tenantName || null));
    return u;
  }, []);

  // Free-trial sign-up returns a token pair: sign the new owner straight in.
  const signInWithTokens = useCallback(async (access, refresh) => {
    tokenStore.setTokens(access, refresh);
    const u = await authService.fetchCurrentUser();
    setUser(u);
    setTenantName(u?.tenantName || null);
    return u;
  }, []);

  const logout = useCallback(() => {
    // Clear client session immediately so the UI returns to login without
    // waiting on the network; revoke the refresh token best-effort in the
    // background (preserves the existing backend logout behavior).
    authService.logout(); // best-effort backend revoke (reads refresh token synchronously)
    tokenStore.clear();
    // Signing out ends the session, so the next sign-in starts at the
    // beginning. The URL hash is what survives a refresh and restores the tab
    // you were on - which is right for a refresh and wrong for a logout: the
    // next person to sign in on this machine should not land in Inventory
    // because the last one was there. Refresh behaviour is untouched; this
    // only runs when someone deliberately signs out.
    if (typeof window !== "undefined") {
      window.location.hash = "/dashboard";
    }
    setUser(null);
    setTenantName(null);
    setTenantLogo(null);
    setTenantPhone(null);
  }, []);

  // Settings saves a new logo: the sidebar follows at once, no reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBrand = (e) => { if (e.detail && "logoUrl" in e.detail) setTenantLogo(e.detail.logoUrl || null); };
    window.addEventListener(TENANT_BRAND_EVENT, onBrand);
    return () => window.removeEventListener(TENANT_BRAND_EVENT, onBrand);
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

  // Which parts of DFX this shop uses (schemes / catalogue / billing). null
  // until known = every module, which is what every shop had before.
  const shopModules = user?.shopModules ?? null;
  const hasModule = useCallback((m) => shopHas(shopModules, m), [shopModules]);

  const value = {
    user,
    shopModules,
    hasModule,
    role: user?.role ?? null,
    backendRole: user?.backendRole ?? null,
    tenantId: user?.tenantId ?? null,
    tenantName,
    tenantLogo,
    tenantPhone,
    permissions,
    hasPermission,
    isAuthenticated: !!user,
    loading,
    login,
    signInWithTokens,
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
