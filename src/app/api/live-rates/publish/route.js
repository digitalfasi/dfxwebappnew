/**
 * DFX Collector Engine — scheduled auto-publish.  POST /api/live-rates/publish
 *
 * The 24/7 path for the MOBILE app. The mobile app reads gold rates from the
 * DFX (Render) backend, not from Vercel — so a live rate only reaches customers
 * once it is written into that backend. This route scrapes the live rate and
 * writes it to POST/PUT /gold-rates/today, with no admin and no browser.
 *
 * Triggered by the 5-min GitHub cron. Guards, in order:
 *   1. Shared-secret header (x-cron-secret) — only the cron may call it.
 *   2. Market-hours gate — only writes during KJPL's booking window
 *      (09:05–23:25 IST, Mon–Fri); outside it, the last value stands.
 *   3. Sanity checks — required purities present, sane ranges, karat ordering —
 *      so a broken scrape can never push a wrong billing rate.
 *
 * Never throws the cron into failure over a transient miss: a closed market,
 * failed sanity, or unreachable source returns 200 with published:false.
 *
 * Config (Vercel env vars — never hard-coded):
 *   CRON_SECRET            shared secret the cron sends as x-cron-secret
 *   DFX_API_URL            backend base, e.g. https://dfx-backend-lym0.onrender.com/api/v1
 *   DFX_SERVICE_USERNAME   a backend account allowed to write gold rates
 *   DFX_SERVICE_PASSWORD   its password
 *
 * ?dryRun=1 runs the scrape + gates and reports what it WOULD publish, without
 * logging into or writing to the backend (safe to test before creds exist).
 */
import crypto from "node:crypto";
import { collectLiveRates } from "../../../../lib/collector";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = (process.env.DFX_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1").replace(/\/+$/, "");

// Sanity bands (per gram, INR). Wide enough for real market swings, tight
// enough to reject parse garbage (0, 1.5, 158000, …).
const BANDS = { r24: [4000, 60000], r22: [3000, 55000], r18: [2000, 50000], silver: [30, 8000] };

/** Constant-time secret comparison. */
function secretOk(provided) {
  const expected = process.env.CRON_SECRET || "";
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Current wall-clock in IST, as {weekday 0-6, minutes-since-midnight}. */
function istNow() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return { day: ist.getUTCDay(), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/** KJPL booking window: Mon–Fri, 09:05–23:25 IST. */
function marketOpen() {
  const { day, minutes } = istNow();
  return day >= 1 && day <= 5 && minutes >= 9 * 60 + 5 && minutes <= 23 * 60 + 25;
}

/** Validate the scraped form. Returns a list of failure reasons (empty = ok). */
function sanityReasons(form) {
  const reasons = [];
  const need = ["r24", "r22", "r18"];
  for (const k of need) {
    const v = form[k];
    if (v == null || !(v > 0)) { reasons.push(`${k} missing/zero`); continue; }
    const [lo, hi] = BANDS[k] || [0, Infinity];
    if (v < lo || v > hi) reasons.push(`${k}=${v} out of range [${lo}-${hi}]`);
  }
  if (form.silver != null) {
    const [lo, hi] = BANDS.silver;
    if (form.silver < lo || form.silver > hi) reasons.push(`silver=${form.silver} out of range [${lo}-${hi}]`);
  }
  // Karat ordering: 24K > 22K > 18K.
  if (form.r24 > 0 && form.r22 > 0 && !(form.r22 < form.r24)) reasons.push("r22 not < r24");
  if (form.r22 > 0 && form.r18 > 0 && !(form.r18 < form.r22)) reasons.push("r18 not < r22");
  return reasons;
}

/** Backend body — only positive numbers; blanks persist as NULL. rate_24k required. */
function toBody(form) {
  const body = { rate_24k: Number(form.r24) };
  const opt = { rate_22k: form.r22, rate_18k: form.r18, rate_14k: form.r14, rate_9k: form.r9, silver_999: form.silver };
  for (const [k, v] of Object.entries(opt)) {
    const n = Number(v);
    if (v != null && Number.isFinite(n) && n > 0) body[k] = n;
  }
  return body;
}

async function backend(path, { method = "GET", body, token } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!res.ok) {
    const msg = payload?.errors?.[0]?.message || payload?.message || payload?.detail || `backend ${method} ${path} -> ${res.status}`;
    throw new Error(msg);
  }
  return payload ?? {};
}

export async function POST(request) {
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  // 1. Secret guard.
  if (!secretOk(request.headers.get("x-cron-secret"))) {
    return Response.json({ published: false, error: "unauthorized" }, { status: 401 });
  }

  // 2. Market-hours gate.
  if (!marketOpen()) {
    return Response.json({ published: false, skipped: "market-closed", checkedAt: new Date().toISOString() });
  }

  // 3. Scrape + sanity.
  let data;
  try {
    data = await collectLiveRates({ fresh: true });
  } catch (e) {
    return Response.json({ published: false, skipped: "scrape-failed", error: String(e?.message || e) });
  }
  const reasons = sanityReasons(data.form || {});
  if (data.errors?.length) reasons.unshift(`source errors: ${data.errors.map((e) => e.source).join(",")}`);
  if (reasons.length) {
    return Response.json({ published: false, skipped: "sanity-failed", reasons, form: data.form });
  }

  const body = toBody(data.form);
  if (dryRun) {
    return Response.json({ published: false, dryRun: true, wouldPublish: body, fetchedAt: data.fetchedAt });
  }

  // 4. Authenticate to the backend and write today's rate.
  const username = process.env.DFX_SERVICE_USERNAME;
  const password = process.env.DFX_SERVICE_PASSWORD;
  if (!username || !password) {
    return Response.json({ published: false, error: "service credentials not configured" }, { status: 500 });
  }
  try {
    const login = await backend("/auth/login", { method: "POST", body: { username: String(username).trim(), password } });
    const token = login.data?.access_token;
    if (!token) return Response.json({ published: false, error: "login returned no access token" }, { status: 502 });

    let exists = false;
    try {
      const today = await backend("/gold-rates/today", { token });
      exists = today.data?.rate?.rate_24k != null;
    } catch { exists = false; } // treat a read failure as "not set yet"

    const res = await backend("/gold-rates/today", { method: exists ? "PUT" : "POST", body, token });
    return Response.json({
      published: true,
      method: exists ? "PUT" : "POST",
      rate: res.data?.rate ?? body,
      fetchedAt: data.fetchedAt,
      publishedAt: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ published: false, error: String(e?.message || e) }, { status: 502 });
  }
}
