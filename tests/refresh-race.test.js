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
  // A browser on HTTPS always has WebCrypto; Node's test realm may not. Without
  // it the client correctly declines to mint a guessable id and falls back to
  // failing soft - which would silently make every replay test vacuous.
  if (!globalThis.crypto?.getRandomValues) {
    const { webcrypto } = require("node:crypto");
    globalThis.crypto = webcrypto;
  }
  return map;
}

/** A refresh endpoint with the REAL server's rotation + reuse semantics. */
const GRACE_MS = 120000; // AuthService.REPLAY_GRACE_SECONDS

function makeServer({ latencyMs = 30 } = {}) {
  const state = {
    live: new Set(["R1"]),
    calls: 0,
    revokedAll: 0,
    issued: 1,
    replays: 0,
    spent: new Map(), // token -> { nonce, pair, successorUsed, at }
  };
  // rawRequest reads response.text(), not .json().
  const res = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  globalThis.fetch = vi.fn(async (url, init) => {
    if (!String(url).includes("/auth/refresh")) {
      return res(200, { success: true, data: {} });
    }
    state.calls += 1;
    const body = JSON.parse(init.body);
    const sent = body.refresh_token;
    const rid = body.request_id ?? null;
    await new Promise((r) => setTimeout(r, latencyMs));
    if (!state.live.has(sent)) {
      // Idempotent replay, exactly as _is_lost_response_retry decides it: the
      // SAME request id recorded at rotation, a successor that exists and was
      // never used, inside the grace window. Anything missing, mismatched or
      // stale is NOT a retry and falls through to reuse detection.
      const spent = state.spent.get(sent);
      const isRetry =
        !!rid &&
        !!spent &&
        !!spent.nonce &&
        spent.nonce === rid &&
        !!spent.pair &&
        !spent.successorUsed &&
        Date.now() - spent.at <= GRACE_MS;
      if (isRetry) {
        state.replays += 1;
        return res(200, { success: true, data: spent.pair });
      }
      // Reuse detection: revoke everything, exactly like auth/service.py.
      state.revokedAll += 1;
      state.live.clear();
      return res(401, { success: false, message: "revoked" });
    }
    // Using a token marks its predecessor's successor as consumed - the server
    // reads that as proof the response DID arrive, so no replay may follow.
    for (const entry of state.spent.values()) {
      if (entry.pair && entry.pair.refresh_token === sent) entry.successorUsed = true;
    }
    state.live.delete(sent);
    state.issued += 1;
    const next = `R${state.issued}`;
    state.live.add(next);
    const pair = { access_token: `A${state.issued}`, refresh_token: next };
    state.spent.set(sent, { nonce: rid, pair, successorUsed: false, at: Date.now() });
    return res(200, { success: true, data: pair });
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

  /* ── Idempotent replay: the case no client could win alone ─────────────
   *
   * Once the response is lost the replacement is gone, so prevention cannot
   * help and fail-soft was the best available answer. The server can now tell
   * a retry from a theft by the caller's own request id, so the lost-response
   * F5 recovers instead of logging anyone out. The safeguard is untouched:
   * every case WITHOUT a matching id still revokes.
   */

  /** Drive one real refresh, then simulate its response never arriving. */
  async function loseTheResponse() {
    const page = await loadPage();
    await page.refreshAccessToken();               // R1 -> R2, id recorded
    // Read the id the SERVER recorded at rotation. The sender's own marker is
    // cleared in its finally block on completion; in a real F5 the page dies
    // mid-flight and the marker survives, which is what we rebuild below.
    const rid = server.spent.get("R1")?.nonce ?? null;
    // The response never reached the browser: storage still holds R1, and the
    // marker its sender left behind is all the next page has to go on.
    localStorage.setItem(KEYS.refresh, "R1");
    localStorage.setItem(KEYS.access, "A1");
    localStorage.setItem("jros_refresh_inflight", JSON.stringify({ fp: fingerprintOf("R1"), rid, ts: Date.now() - 60000 }));
    return rid;
  }

  it("a lost response RECOVERS when the retry carries the same request id", async () => {
    const rid = await loseTheResponse();
    expect(rid).toBeTruthy();                      // the first attempt minted one
    const reload = await loadPage();
    const token = await reload.refreshAccessToken();
    expect(token).toBeTruthy();                    // signed in, not bounced to login
    expect(server.replays).toBe(1);                // served from the issued pair
    expect(server.revokedAll).toBe(0);             // nobody logged out anywhere
    expect(localStorage.getItem(KEYS.refresh)).toBe("R2");
  });

  it("a replay with the WRONG id still revokes everything", async () => {
    await loseTheResponse();
    localStorage.setItem("jros_refresh_inflight", JSON.stringify({
      fp: fingerprintOf("R1"), rid: "f".repeat(32), ts: Date.now() - 60000,
    }));
    const reload = await loadPage();
    const token = await reload.refreshAccessToken();
    expect(token).toBeNull();
    expect(server.replays).toBe(0);
    expect(server.revokedAll).toBe(1);             // the safeguard is intact
  });

  it("a stolen token carries no id, so it is still treated as theft", async () => {
    await loseTheResponse();
    localStorage.removeItem("jros_refresh_inflight");
    const thief = await loadPage();
    const token = await thief.refreshAccessToken();
    expect(token).toBeNull();
    expect(server.replays).toBe(0);
    expect(server.revokedAll).toBe(1);
  });

  it("replay is refused once the successor has been used", async () => {
    const rid = await loseTheResponse();
    // The response did arrive somewhere and R2 was used - so this is a genuine
    // replay of a spent token, not a retry.
    localStorage.setItem(KEYS.refresh, "R2");
    localStorage.removeItem("jros_refresh_inflight");
    const other = await loadPage();
    await other.refreshAccessToken();              // consumes R2
    localStorage.setItem(KEYS.refresh, "R1");
    localStorage.setItem("jros_refresh_inflight", JSON.stringify({ fp: fingerprintOf("R1"), rid, ts: Date.now() - 60000 }));
    const reload = await loadPage();
    const token = await reload.refreshAccessToken();
    expect(token).toBeNull();
    expect(server.replays).toBe(0);
    expect(server.revokedAll).toBe(1);
  });

  it("the replay is attempted exactly once, never twice", async () => {
    await loseTheResponse();
    localStorage.setItem("jros_refresh_inflight", JSON.stringify({
      fp: fingerprintOf("R1"), rid: "f".repeat(32), ts: Date.now() - 60000,
    }));
    const before = server.calls;
    const reload = await loadPage();
    await reload.refreshAccessToken();
    expect(server.calls - before).toBe(1);         // one attempt, then fail soft
  });

  it("the marker is cleared after a replay, so the next page starts clean", async () => {
    await loseTheResponse();
    const reload = await loadPage();
    await reload.refreshAccessToken();
    expect(localStorage.getItem("jros_refresh_inflight")).toBeNull();
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
