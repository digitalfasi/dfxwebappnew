/**
 * Thin fetch wrapper for the JROS FastAPI backend.
 *
 * The backend always answers with the envelope:
 *   { success, message, data, meta }           (2xx)
 *   { success: false, message, errors: [...] } (4xx / 5xx)
 *
 * This module unwraps that envelope, attaches the Bearer access token, and
 * transparently rotates an expired access token via /auth/refresh once.
 */

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
).replace(/\/+$/, '');

export const STORAGE_KEYS = {
  accessToken: 'jros_access_token',
  refreshToken: 'jros_refresh_token',
  role: 'jros_user_role',
  user: 'jros_user',
} as const;

export interface ApiEnvelope<T = any> {
  success: boolean;
  message: string;
  data: T;
  meta?: any;
}

export interface ApiFieldError {
  code?: string;
  message?: string;
  field?: string;
}

export class ApiError extends Error {
  status: number;
  errors: ApiFieldError[];

  constructor(message: string, status: number, errors: ApiFieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

/* ------------------------------------------------------------------ */
/* Token storage                                                       */
/* ------------------------------------------------------------------ */

const isBrowser = () => typeof window !== 'undefined';

export const tokenStore = {
  getAccessToken(): string | null {
    return isBrowser() ? localStorage.getItem(STORAGE_KEYS.accessToken) : null;
  },
  getRefreshToken(): string | null {
    return isBrowser() ? localStorage.getItem(STORAGE_KEYS.refreshToken) : null;
  },
  setTokens(accessToken: string, refreshToken: string): void {
    if (!isBrowser()) return;
    localStorage.setItem(STORAGE_KEYS.accessToken, accessToken);
    localStorage.setItem(STORAGE_KEYS.refreshToken, refreshToken);
  },
  clear(): void {
    if (!isBrowser()) return;
    localStorage.removeItem(STORAGE_KEYS.accessToken);
    localStorage.removeItem(STORAGE_KEYS.refreshToken);
    localStorage.removeItem(STORAGE_KEYS.role);
    localStorage.removeItem(STORAGE_KEYS.user);
  },
};

/* ------------------------------------------------------------------ */
/* Request plumbing                                                    */
/* ------------------------------------------------------------------ */

function extractErrorMessage(payload: any, status: number): string {
  const first = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  if (first?.message) {
    return first.field ? `${first.field}: ${first.message}` : first.message;
  }
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.detail === 'string') return payload.detail;
  return `Request failed with status ${status}`;
}

interface RawOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function rawRequest<T>(path: string, opts: RawOptions = {}): Promise<ApiEnvelope<T>> {
  const { method = 'GET', body, token } = opts;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  // FormData must NOT get an explicit Content-Type — the browser sets its
  // own multipart boundary automatically, and overriding it here would
  // break the backend's multipart parsing.
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    });
  } catch (networkError) {
    throw new ApiError(
      `Unable to reach the DFX Solution API at ${API_BASE_URL}. Please make sure the backend server is running.`,
      0,
      [{ code: 'NETWORK_ERROR', message: String(networkError) }]
    );
  }

  const text = await response.text();
  let payload: any = null;
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

  return (payload ?? { success: true, message: '', data: null }) as ApiEnvelope<T>;
}

/* ------------------------------------------------------------------ */
/* Access token rotation                                               */
/* ------------------------------------------------------------------ */

let inFlightRefresh: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const res = await rawRequest<{ access_token: string; refresh_token: string }>(
      '/auth/refresh',
      { method: 'POST', body: { refresh_token: refreshToken } }
    );
    const data = res.data;
    if (!data?.access_token || !data?.refresh_token) return null;
    tokenStore.setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

/** Rotates the token pair. Concurrent callers share a single network round-trip. */
export function refreshAccessToken(): Promise<string | null> {
  if (!inFlightRefresh) {
    inFlightRefresh = performRefresh().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Attach the stored Bearer token and auto-rotate it on 401. */
  auth?: boolean;
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiEnvelope<T>> {
  const { method = 'GET', body, auth = false } = options;

  if (!auth) {
    return rawRequest<T>(path, { method, body });
  }

  const token = tokenStore.getAccessToken();
  if (!token) {
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  try {
    return await rawRequest<T>(path, { method, body, token });
  } catch (error) {
    // Access token rejected — try a single silent refresh, then replay the call.
    if (error instanceof ApiError && error.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        tokenStore.clear();
        throw new ApiError('Your session has expired. Please sign in again.', 401);
      }
      return rawRequest<T>(path, { method, body, token: newToken });
    }
    throw error;
  }
}

export const apiClient = {
  get: <T = any>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T = any>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ) => apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T = any>(
    path: string,
    body?: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {}
  ) => apiRequest<T>(path, { ...options, method: 'PUT', body }),
  delete: <T = any>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
