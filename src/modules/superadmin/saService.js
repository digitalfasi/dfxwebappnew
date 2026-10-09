import { apiClient } from "@/_shared/apiClient";
import { downloadBase64 } from "@/modules/reports/reportService";

// SuperAdmin API. Every call is SuperAdmin-only on the server as well.
const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "" && v !== "all") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};

const get = async (path, params) => (await apiClient.get(`${path}${qs(params)}`, { auth: true })).data;

export const saService = {
  // Monitoring
  overview: () => get("/superadmin/monitor/overview"),
  sessions: (params) => get("/superadmin/monitor/sessions", params),
  users: (params) => get("/superadmin/monitor/users", params),
  userTimeline: (id, days = 30) => get(`/superadmin/monitor/users/${encodeURIComponent(id)}`, { days }),
  events: (params) => get("/superadmin/monitor/events", params),
  activity: (params) => get("/superadmin/monitor/activity", params),
  system: () => get("/superadmin/monitor/system"),
  rateFeed: () => get("/superadmin/monitor/rate-feed"),

  // Search across every shop (top bar, Ctrl+K)
  search: async (q) => (await get("/superadmin/search", { q })).search,

  // Platform dashboard
  // A period name ("this_month") or a custom { date_from, date_to }.
  dashboard: async (p = "this_month") => (await get("/superadmin/dashboard", typeof p === "string" ? { period: p } : p)).dashboard,
  exportDashboard: async (period) => downloadBase64((await get("/superadmin/export/dashboard", { format: "excel", period })).export),
  exportTenants: async () => downloadBase64((await get("/superadmin/export/tenants", { format: "excel" })).export),

  // Tenants
  tenants: async (status) => (await get("/superadmin/tenants", { status })).tenants,
  tenant: async (id) => (await get(`/superadmin/tenants/${encodeURIComponent(id)}`)).tenant,
  statistics: async (id) => (await get(`/superadmin/tenants/${encodeURIComponent(id)}/statistics`)).statistics,
  provision: async (body) =>
    (await apiClient.post("/superadmin/tenants/provision", body, { auth: true })).data.provisioned,
  setStatus: async (id, status) =>
    (await apiClient.put(`/superadmin/tenants/${encodeURIComponent(id)}/status`, { status }, { auth: true })).data.tenant,
  setSubscription: async (id, body) =>
    (await apiClient.put(`/superadmin/tenants/${encodeURIComponent(id)}/subscription`, body, { auth: true })).data.tenant,
  setAdminStatus: async (id, isActive) =>
    (await apiClient.put(`/superadmin/tenants/${encodeURIComponent(id)}/admin/status`, { is_active: isActive }, { auth: true })).data.admin,
  setAdminPassword: async (id, newPassword, signOutEverywhere = true) =>
    (await apiClient.post(`/superadmin/tenants/${encodeURIComponent(id)}/admin/set-password`,
      { new_password: newPassword, sign_out_everywhere: signOutEverywhere }, { auth: true })).data.admin,
  resetAdminPassword: async (id) =>
    (await apiClient.post(`/superadmin/tenants/${encodeURIComponent(id)}/admin/reset-password`, {}, { auth: true })).data.reset,
};

// ── Formatting (everything shown in Indian time) ─────────────────────────
const IST = "Asia/Kolkata";

export function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: IST, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

export function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

export function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { timeZone: IST, day: "2-digit", month: "short", year: "numeric" });
}

export function ago(iso, now = Date.now()) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  // Whole minutes, floored - rounding produced "19 h 60 m".
  if (s < 86400) { const m = Math.floor((s % 3600) / 60); return `${Math.floor(s / 3600)} h${m ? ` ${m} m` : ""} ago`; }
  const d = Math.floor(s / 86400);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

// Exact time something was last seen, in India time: "5:42:13 pm" today,
// "Yesterday, 6:36 pm", else "29 Sept, 6:36 pm". Never "just now".
export function seenAt(iso) {
  if (!iso) return "never";
  const t = new Date(iso);
  const day = (x) => x.toLocaleDateString("en-CA", { timeZone: IST });
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000);
  const time = (o) => t.toLocaleTimeString("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", ...o });
  if (day(t) === day(today)) return time({ second: "2-digit" });
  if (day(t) === day(yest)) return `Yesterday, ${time()}`;
  return `${t.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" })}, ${time()}`;
}

export function dur(sec) {
  if (sec == null) return "—";
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function bytes(n) {
  if (n == null) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

// One rule for "this shop was used today", wherever a count of active shops is shown.
export const usedToday = (t) => !!(t && (t.live_now || t.users_today || t.logins_today || t.sales_today));

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export const EVENT_LABEL = {
  LOGIN_SUCCESS: "Logged in",
  LOGIN_FAILED: "Failed login",
  LOGIN_BLOCKED: "Blocked login",
  LOGOUT: "Logged out",
  LOGOUT_ALL: "Logged out everywhere",
  TOKEN_REUSE: "Security alarm",
};

export const END_LABEL = { logout: "Logged out", logout_all: "Logged out everywhere", revoked: "Cut off for security" };
