/**
 * The refresh token must never be sent twice.
 *
 * The backend rotates refresh tokens and treats a reused one as theft: on reuse
 * it revokes EVERY active token for the user. Measured against the deployment,
 * not assumed - two concurrent refreshes with one token return [200, 401], and
 * the replacement the winner issued is ALSO dead afterwards. So a losing caller
 * has nothing to retry with and the user is logged out on every device.
 *
 * `inFlightRefresh` already covered a single page. These tests cover what it
 * cannot: a RELOAD and a SECOND TAB, which are separate module instances
 * sharing one localStorage. Each "page" below is a fresh import of the module,
 * which is exactly what a new document is.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const KEYS = { access: "jros_access_token", refresh: "jros_refresh_token" };

function installStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
  globalThis.window = globalThis.window || { dispatchEvent() {}, addEventListener() {} };
  return map;
}

/** A refresh endpoint with the REAL server's rotation + reuse semantics. */
function makeServer({ latencyMs = 30 } = {}) {
  const state = { live: new Set(["R1"]), calls: 0, revokedAll: 0, issued: 1 };
  // rawRequest reads response.text(), not .json().
  const res = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  globalThis.fetch = vi.fn(async (url, init) => {
    if (!String(url).includes("/auth/refresh")) {
      return res(200, { success: true, data: {} });
    }
    state.calls += 1;
    const sent = JSON.parse(init.body).refresh_token;
    await new Promise((r) => setTimeout(r, latencyMs));
    if (!state.live.has(sent)) {
      // Reuse detection: revoke everything, exactly like auth/service.py.
      state.revokedAll += 1;
      state.live.clear();
      return res(401, { success: false, message: "revoked" });
    }
    state.live.delete(sent);
    state.issued += 1;
    const next = `R${state.issued}`;
    state.live.add(next);
    return res(200, { success: true, data: { access_token: `A${state.issued}`, refresh_token: next } });
  });
  return state;
}

/** Same djb2 the client uses, so a test marker addresses the same token. */
function fingerprintOf(token) {
  let h = 5381;
  for (let i = 0; i < token.length; i += 1) h = ((h << 5) + h + token.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

async function loadPage() {
  vi.resetModules();                       // a new document = a new module instance
  return await import("../src/_shared/apiClient.js");
}

describe("refresh token is never sent twice", () => {
  let server;
  beforeEach(() => {
    const map = installStorage();
    map.set(KEYS.access, "A1");
    map.set(KEYS.refresh, "R1");
    server = makeServer();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("the 7-request burst on one page triggers exactly one refresh", async () => {
    const page = await loadPage();
    const results = await Promise.all(Array.from({ length: 7 }, () => page.refreshAccessToken()));
    expect(server.calls).toBe(1);
    expect(server.revokedAll).toBe(0);
    expect(new Set(results).size).toBe(1);
    expect(results[0]).toBeTruthy();
  });

  it("a reload mid-refresh does not reuse the token (F5)", async () => {
    const first = await loadPage();
    const inFlight = first.refreshAccessToken();   // page 1 is mid-refresh
    const second = await loadPage();               // F5: new module, same storage
    const [a, b] = await Promise.all([inFlight, second.refreshAccessToken()]);
    expect(server.revokedAll).toBe(0);
    expect(server.calls).toBe(1);                  // the reload waited, it did not send
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(localStorage.getItem(KEYS.refresh)).toBe("R2");
  });

  it("two tabs opening together do not revoke the session", async () => {
    const tabA = await loadPage();
    const tabB = await loadPage();
    const [a, b] = await Promise.all([tabA.refreshAccessToken(), tabB.refreshAccessToken()]);
    expect(server.revokedAll).toBe(0);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });

  it("twenty racing callers across ten pages: zero revocations", async () => {
    const pages = [];
    for (let i = 0; i < 10; i += 1) pages.push(await loadPage());
    const calls = pages.flatMap((p) => [p.refreshAccessToken(), p.refreshAccessToken()]);
    const out = await Promise.all(calls);
    expect(server.revokedAll).toBe(0);
    expect(out.every(Boolean)).toBe(true);
  });

  it("a LOST RESPONSE is never retried - the F5 case, failed soft", async () => {
    // What a real F5 does: Chrome aborts the in-flight fetch on navigation. The
    // server still received it and still rotated, so R1 is spent and R2 died
    // with the response. Verified against the deployment - aborting the read
    // after send leaves the token dead.
    const fp = fingerprintOf("R1");
    localStorage.setItem("jros_refresh_inflight", JSON.stringify({ fp, ts: Date.now() - 60000 }));
    const page = await loadPage();
    const token = await page.refreshAccessToken();
    expect(token).toBeNull();          // give up safely...
    expect(server.calls).toBe(0);      // ...WITHOUT sending the spent token
    expect(server.revokedAll).toBe(0); // so nobody is logged out anywhere else
  });

  it("waiting that times out gives up rather than sending", async () => {
    // A marker is fresh, but the page that wrote it never rotates - it died
    // between sending and storing. The wait must expire into a safe give-up.
    const fp = fingerprintOf("R1");
    localStorage.setItem("jros_refresh_inflight", JSON.stringify({ fp, ts: Date.now() }));
    const page = await loadPage();
    const token = await page.refreshAccessToken();
    expect(token).toBeNull();
    expect(server.calls).toBe(0);
    expect(server.revokedAll).toBe(0);
  }, 15000);

  it("a stale marker for a DIFFERENT token does not block us", async () => {
    // A page died mid-refresh and left its marker behind, older than fresh.
    localStorage.setItem(
      "jros_refresh_inflight",
      JSON.stringify({ fp: "whatever", ts: Date.now() - 60000 }),
    );
    const page = await loadPage();
    const token = await page.refreshAccessToken();
    expect(token).toBeTruthy();          // it proceeded rather than waiting forever
    expect(server.calls).toBe(1);
  });

  it("the marker is cleared even when the refresh throws", async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error("network down"); });
    const page = await loadPage();
    const token = await page.refreshAccessToken();
    expect(token).toBeNull();
    expect(localStorage.getItem("jros_refresh_inflight")).toBeNull();
  });

  it("a normal expiry still refreshes once and keeps working", async () => {
    const page = await loadPage();
    expect(await page.refreshAccessToken()).toBe("A2");
    expect(localStorage.getItem(KEYS.access)).toBe("A2");
    expect(await page.refreshAccessToken()).toBe("A3"); // later, independent expiry
    expect(server.revokedAll).toBe(0);
  });
});
