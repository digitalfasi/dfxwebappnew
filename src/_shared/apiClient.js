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

// Hard ceiling for a single request. Render free-tier cold starts can take tens
// of seconds; this is generous enough not to abort a legitimate cold wake, but
// bounds a genuinely hung request so the UI fails cleanly instead of blocking
// forever. Overridable per call via opts.timeoutMs (0 disables).
const DEFAULT_TIMEOUT_MS = 45000;

// Broadcast that the session is unrecoverable (access + refresh both dead). The
// React AuthContext listens for this to clear the user and drop back to login,
// so an expired session never leaves the UI falsely authenticated.
export const SESSION_EXPIRED_EVENT = "dfx:session-expired";
function notifySessionExpired() {
  if (isBrowser()) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

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
    // A marker left over from this session must not make the NEXT login's first
    // refresh sit waiting for a page that no longer exists.
    clearMarker();
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
  const { method = "GET", body, token, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = { Accept: "application/json" };
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  // Own the abort so we can both time out and honour a caller-supplied signal
  // without conflating the two: `timedOut` distinguishes our timeout from a
  // caller cancellation on the same underlying AbortController.
  const controller = new AbortController();
  let timedOut = false;
  const timer = timeoutMs
    ? setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs)
    : null;
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (networkError) {
    if (timedOut) {
      throw new ApiError(
        `The DFX Solution API at ${API_BASE_URL} did not respond in time. It may be waking up — please retry.`,
        0,
        [{ code: "TIMEOUT", message: "Request timed out" }]
      );
    }
    // Genuine caller cancellation — propagate the AbortError untouched.
    if (signal?.aborted) throw networkError;
    if (networkError instanceof DOMException && networkError.name === "AbortError") {
      throw networkError;
    }
    throw new ApiError(
      `Unable to reach the DFX Solution API at ${API_BASE_URL}. Please make sure the backend server is running.`,
      0,
      [{ code: "NETWORK_ERROR", message: String(networkError) }]
    );
  } finally {
    if (timer) clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onCallerAbort);
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

/* ── Never send the same refresh token twice ──────────────────────────────
 *
 * The backend rotates refresh tokens AND treats a reused one as theft: on
 * reuse it revokes EVERY active token for that user. Measured against the
 * deployment, not assumed - two concurrent refreshes with one token return
 * [200, 401], and the replacement the winner issued is ALSO dead afterwards.
 * So there is nothing left to retry with: the user is logged out on every
 * device, not just the tab that raced. Recovery is impossible by design; the
 * only cure is prevention.
 *
 * `inFlightRefresh` already covers a single page. It cannot cover a RELOAD
 * (F5 while a refresh is in flight) or a SECOND TAB - those are separate
 * module instances sharing one localStorage, and each holds the same token.
 * That is the case this marker closes.
 *
 * The server-side cure is better and is deliberately not attempted here:
 * replaying the immediately-previous token inside a short grace window should
 * return the already-issued pair instead of counting as theft. RefreshToken
 * carries only is_revoked - no revoked_at, no replaced_by - so it needs a
 * migration and its own deploy.
 */
const REFRESH_MARKER_KEY = "jros_refresh_inflight";
const MARKER_FRESH_MS = 10000; // older than this belongs to a crashed page
const MARKER_WAIT_MS = 5000;   // never hang the UI on someone else's marker
const MARKER_POLL_MS = 50;

// Synchronous, not reversible to the token, and never sent anywhere. The only
// question it answers is "is that marker about the token I am holding?".
function tokenFingerprint(token) {
  let h = 5381;
  for (let i = 0; i < token.length; i += 1) h = ((h << 5) + h + token.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

function readMarker() {
  try {
    const raw = localStorage.getItem(REFRESH_MARKER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // private mode / blocked storage: fall through to a normal refresh
  }
}
function writeMarker(fp) {
  try {
    localStorage.setItem(REFRESH_MARKER_KEY, JSON.stringify({ fp, ts: Date.now() }));
  } catch { /* not fatal - we simply lose cross-page coordination */ }
}
function clearMarker() {
  try { localStorage.removeItem(REFRESH_MARKER_KEY); } catch { /* nothing to do */ }
}

/**
 * Another page is already refreshing with the exact token we hold. Sending ours
 * is what triggers the revoke-all, so wait for that page to swap the token
 * instead. Returns the fresh access token, or null meaning "give up safely" -
 * the caller must NOT then send the token itself. Always terminates, so a
 * crashed page can never leave this one staring at a blank screen.
 */
async function waitForRotation(ourRefreshToken) {
  const deadline = Date.now() + MARKER_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, MARKER_POLL_MS));
    if (tokenStore.getRefreshToken() !== ourRefreshToken) {
      return tokenStore.getAccessToken(); // they rotated it; use what they stored
    }
    const marker = readMarker();
    if (!marker || Date.now() - marker.ts > MARKER_FRESH_MS) return null; // they gave up
  }
  return null; // timed out - try ourselves rather than stall
}

async function performRefresh() {
  const refreshToken = tokenStore.getRefreshToken();
  if (!refreshToken) return null;

  const fingerprint = tokenFingerprint(refreshToken);
  const marker = readMarker();
  if (marker && marker.fp === fingerprint) {
    if (Date.now() - marker.ts < MARKER_FRESH_MS) {
      const rotated = await waitForRotation(refreshToken);
      if (rotated) return rotated;
    }
    // We got here two ways, and both mean the same thing: some page already
    // SENT this exact token and the answer never came back.
    //
    // The server rotates on RECEIPT, not on delivery - verified against the
    // deployment by aborting the read after the request was sent, which still
    // killed the token. That is precisely what a real F5 does: Chrome aborts
    // the in-flight fetch on navigation, the server rotates anyway, and the
    // replacement is lost with the response nobody received.
    //
    // So sending it now is never right. Either it is already rotated, and
    // reuse detection revokes every session on every device including the
    // owner's, or it is merely expired and sending achieves nothing. Give up
    // safely instead: returning null makes the caller clear THIS tab and drop
    // to login. One person signs in again on one tab; the account is untouched
    // everywhere else.
    //
    // No client can do better than this. Once the response is lost the
    // replacement is unrecoverable, and only the server can fix it - by
    // returning the already-issued pair when the immediately-previous token is
    // replayed inside a short window. That is a separate deploy with its own
    // migration, and this is the safe behaviour until it lands.
    return null;
  }

  writeMarker(fingerprint);
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
  } finally {
    // finally, not the success path: a thrown request or a closed tab must not
    // leave a marker behind that makes the next page wait for nobody.
    clearMarker();
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
    // Token already gone (e.g. a sibling request just failed refresh). Signal
    // once more so the UI drops to login rather than spinning on error states.
    notifySessionExpired();
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }

  try {
    return await rawRequest(path, { method, body, token, signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        tokenStore.clear();
        // Access and refresh are both dead: tell the app to drop to login so the
        // UI is never left falsely authenticated on a mid-session expiry.
        notifySessionExpired();
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

/**
 * Fetch a raw byte stream (auth header attached) and open it in a new browser
 * tab — used to view/print a PDF that a plain link cannot reach because the API
 * is Bearer-authenticated. The object URL is revoked after the tab has loaded.
 */
export async function openInNewTab(path) {
  if (!isBrowser()) return;
  const token = tokenStore.getAccessToken();
  if (!token) {
    throw new ApiError("Your session has expired. Please sign in again.", 401);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new ApiError(`Could not open file (status ${response.status})`, response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (!win) { URL.revokeObjectURL(url); throw new ApiError("Allow pop-ups to open the PDF.", 0); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export const apiClient = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: "GET" }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: "POST", body }),
  put: (path, body, options = {}) => apiRequest(path, { ...options, method: "PUT", body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: "PATCH", body }),
  delete: (path, options = {}) => apiRequest(path, { ...options, method: "DELETE" }),
  download: downloadFile,
  openInNewTab,
};
