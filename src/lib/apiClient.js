/**
 * Thin fetch wrapper for the DFX (JROS) FastAPI backend.
 *
 * Ported from the existing DFX frontend contract. The backend answers with the
 * envelope { success, message, data, meta } (2xx) or
 * { success: false, message, errors: [...] } (4xx/5xx). This module unwraps the
 * envelope, attaches the Bearer access token, and rotates an expired access
 * token via /auth/refresh once.
 */

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

export const STORAGE_KEYS = {
  accessToken: "jros_access_token",
  refreshToken: "jros_refresh_token",
  role: "jros_user_role",
  user: "jros_user",
};

export class ApiError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

const isBrowser = () => typeof window !== "undefined";

export const tokenStore = {
  getAccessToken() {
    return isBrowser() ? localStorage.getItem(STORAGE_KEYS.accessToken) : null;
  },
  getRefreshToken() {
    return isBrowser() ? localStorage.getItem(STORAGE_KEYS.refreshToken) : null;
  },
  setTokens(accessToken, refreshToken) {
    if (!isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
  },
  clear() {
    if (!isBrowser()) return;
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.role);
    localStorage.removeItem(STORAGE_KEYS.user);
  },
};

function extractErrorMessage(payload, status) {
  const first = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  if (first?.message) {
    return first.field ? `${first.field}: ${first.message}` : first.message;
  }
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.detail === "string") return payload.detail;
  return `Request failed with status ${status}`;
}

async function rawRequest(path, opts = {}) {
  const { method = "GET", body, token, signal } = opts;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = { Accept: "application/json" };
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (networkError) {
    if (networkError instanceof DOMException && networkError.name === "AbortError") {
      throw networkError;
    }
    throw new ApiError(
      `Unable to reach the DFX Solution API at ${API_BASE_URL}. Please make sure the backend server is running.`,
      0,
      [{ code: "NETWORK_ERROR", message: String(networkError) }]
    );
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(payload, response.status),
      response.status,
      Array.isArray(payload?.errors) ? payload.errors : []
    );
  }

  return payload ?? { success: true, message: "", data: null };
}

let inFlightRefresh = null;

async function performRefresh() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await rawRequest("/auth/refresh", {
      method: "POST",
      body: { refresh_token: refreshToken },
    });
    const data = res.data;
    if (!data?.access_token || !data?.refresh_token) return null;
    tokenStore.setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

export function refreshAccessToken() {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", body, auth = false, signal } = options;

  if (!auth) {
    return rawRequest(path, { method, body, signal });
  }

  const token = tokenStore.getAccessToken();
  if (!token) {
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  try {
    return await rawRequest(path, { method, body, token, signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        tokenStore.clear();
        throw new ApiError("Your session has expired. Please sign in again.", 401);
      }
      return rawRequest(path, { method, body, token: newToken, signal });
    }
    throw error;
  }
}

/**
 * GET a binary file (PDF/XLSX) with the bearer token and hand it to the browser
 * as a download. Mirrors the old frontend downloadBlob helper; no envelope here
 * because the backend streams raw bytes.
 */
export async function downloadFile(path, filename) {
  if (!isBrowser()) return;
  const token = tokenStore.getAccessToken();
  if (!token) {
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ApiError(`Download failed with status ${response.status}`, response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const apiClient = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: "GET" }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: "POST", body }),
  put: (path, body, options = {}) => apiRequest(path, { ...options, method: "PUT", body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: "PATCH", body }),
  delete: (path, options = {}) => apiRequest(path, { ...options, method: "DELETE" }),
  download: downloadFile,
};
