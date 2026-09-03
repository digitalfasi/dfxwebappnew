# DFX Collector Engine — Implementation & Handoff

**Status:** Implemented locally, **not yet pushed / deployed.**
**Owner of GitHub + Vercel + Render access:** dev teammate (must push & configure).
**Purpose:** Auto-collect live **24K / 22K / 18K gold + silver** rates from two Indian
sources and feed them to the DFX web app (admin) and, via the backend, the mobile app.

---

## 1. TL;DR — what was built

A **collector** that scrapes live gold/silver rates server-side and:

1. **Auto-fills the web admin's Gold Rate screen** (replacing manual typing), refreshing every 60s.
2. **Auto-publishes the live rate into the Render backend every 5 min** (during market hours) so the
   **mobile app** — which reads the backend — shows live rates 24/7 with no admin action.

No Python, no separate microservice, no headless browser, no socket. It's plain server-side
HTTP scraping inside the existing Next.js app + a free GitHub Actions cron.

> **UI was not redesigned.** Only small, approved additions were made to the Gold Rate screen
> (a "Fetch live" button, a live-timestamp line, an "incl. GST" line, and per-field GST/derived hints).

---

## 2. Sources & rate mapping (verified against live sites)

| Rate | Source | How it's obtained |
|---|---|---|
| **24K /g** | KJPL live feed `http://www.kjpl.in/client/kjpl.txt` | Tab-separated feed; type-`3` rows are retail gram gold; **com_id 48 = "GOLD 100 GMS 999 Chennai"**. Fallback: KJPL homepage snapshot → derive from 22K×24/22. |
| **22K /g (without GST)** | KJPL homepage MJDTA board block | e.g. ₹14,240. Backup: MJDTA site. |
| **22K /g (with GST)** | KJPL homepage MJDTA board block (official rounded, e.g. ₹14,668) | Scraped directly — not computed — so it matches the website's rounding. Fallback: ×1.03. |
| **18K /g** | MJDTA `https://thejewellersassociation.org/` | Baked into inline `set_goldrate()` JS (e.g. ₹12,010). With-GST computed ×1.03. |
| **Silver /g** | KJPL MJDTA board block | ₹255 / ₹263 with GST. |
| **14K & 9K /g** | Derived | `rate = 24K × karat/24` (14K is 14/24 pure gold, 9K is 9/24). Flagged "derived" in the UI. |

Notes:
- **USD / global / LBMA / forex** rows on KJPL are intentionally **ignored** (Indian retail only).
- **GST = 3%** (verified: 14667.20 / 14240 = 1.03).
- KJPL's 24K only *moves* during its **booking window: 09:05–23:25 IST, Mon–Fri**. Outside that it holds the last value (expected, not a bug).
- MJDTA (`thejewellersassociation.org`) **blocks in-browser requests (WAF)** but returns 200 to server-side requests with browser-like headers — which is why scraping must run server-side, never from the browser.

---

## 3. Architecture — before vs after

### Before (original project)
```
Web app (admin)  ──  manually typed rate  ──►  Render backend (/gold-rates/today, Supabase)
Mobile app       ──  reads gold rate      ──►  Render backend
```
The admin typed the rate by hand; the mobile app read whatever was stored.

### After (this change)
```
                         ┌── GET  /api/live-rates          → admin web form auto-prefill (+ 60s refresh)
KJPL + MJDTA ─ scraper ──┤    (src/lib/collector.js)
                         └── POST /api/live-rates/publish  → writes /gold-rates/today  → 📱 mobile app
                             ▲ every 5 min via GitHub cron, during IST market hours, with safety guards
```
- The admin screen now **auto-fills** from the live scrape (admin can still review + Save & publish).
- A **cron** writes the live rate into the **Render backend** every 5 min, so the **mobile app is live 24/7** without an admin.

> **Key fact:** the mobile app reads the **Render backend**, *not* Vercel. So the live rate must be
> written **into the backend** — that's what `POST /api/live-rates/publish` does. Pinging the Vercel
> GET endpoint alone would NOT reach mobile.

---

## 4. On-demand vs scheduled — how it actually runs

There is **one scraper** (`/api/live-rates`), rung by **two triggers**:

| Trigger | Runs where | When |
|---|---|---|
| 60s browser timer (admin Gold Rate screen) | client → Vercel | only while an admin has the page open |
| 5-min GitHub Actions cron → publish route | GitHub → Vercel → Render | 24/7 (gated to market hours), **no browser needed** |

- In **production** the scraper runs on **Vercel's servers**, not anyone's laptop.
- The current dev setup runs on a laptop only because it's `npm run dev`.

---

## 5. Files added / changed

### Added
| File | What it does |
|---|---|
| `src/lib/collector.js` | Shared scraping core — fetches + parses KJPL + MJDTA, returns a normalized payload. Single source of truth. |
| `src/app/api/live-rates/route.js` | **GET** `/api/live-rates` — read-only live rates (feeds admin form; callable directly). `?fresh=1` bypasses the 20s cache. |
| `src/app/api/live-rates/publish/route.js` | **POST** `/api/live-rates/publish` — protected auto-publish to the Render backend. Guards: shared secret, market hours, sanity checks. `?dryRun=1` tests without writing. |
| `src/services/liveRateService.js` | Client wrapper the web UI uses to call the GET endpoint. |
| `.github/workflows/live-rates-cron.yml` | Free GitHub Actions cron; POSTs to the publish route every 5 min during market hours. |
| `DFX-COLLECTOR-ENGINE.md` | This document. |

### Modified
| File | Change (UI layout preserved) |
|---|---|
| `src/views/GoldRate.jsx` | Auto-fetch live rates on mount; 60s auto-refresh (updates fields, skips hand-edited ones); "Fetch live" button; live-timestamp status line; "incl. GST" line on the hero; "Without/With GST" hint under 22K; "Derived · 24K × k/24" hints under 14K/9K. |

**No other project files were touched.** The backend (Render/FastAPI) and the mobile app are **not**
in this repo and were **not** modified.

---

## 6. Backend contract used (already exists on Render)

The publish route uses the same contract the web app already uses:
- `POST /auth/login { username, password }` → `data { access_token, refresh_token }`
- `GET  /gold-rates/today` → `data.rate` (null if none today)
- `POST /gold-rates/today` (create) / `PUT /gold-rates/today` (update) with
  `{ rate_24k, rate_22k, rate_18k, rate_14k, rate_9k, silver_999 }` (Bearer auth; only positive values sent).

---

## 7. DEPLOYMENT — steps for the dev teammate (GitHub / Vercel / Render access)

> Nothing is live until these are done. Do them in order.

### Step 1 — Review & push the code
- Pull this branch/folder, review the files in §5.
- Run locally to sanity-check: `npm install` then `npm run dev`, open `http://localhost:3000`.
- Test the GET endpoint (no auth needed):
  ```bash
  curl "http://localhost:3000/api/live-rates?fresh=1"
  ```
  You should get JSON with `form: { r24, r22, r18, r14, r9, silver }` and `success: true`.
- Commit & push to the GitHub repo that Vercel deploys.

### Step 2 — Create a backend service account (Render/Supabase side)
- Create (or pick) a backend login that is **allowed to write gold rates** (admin/staff role that
  can `POST/PUT /gold-rates/today`).
- Note its **username** and **password** — these become the service credentials below.
- (Recommended: a dedicated account like `collector@dfxsolution.com` so it's auditable and revocable.)

### Step 3 — Set Vercel environment variables
Vercel → Project → **Settings → Environment Variables** (Production), then **redeploy**:
```
CRON_SECRET           = <a long random string, e.g. 40+ chars>
DFX_API_URL           = https://dfx-backend-lym0.onrender.com/api/v1
DFX_SERVICE_USERNAME  = <the backend service account username>
DFX_SERVICE_PASSWORD  = <its password>
```

### Step 4 — Set GitHub Actions secrets
GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
```
PUBLISH_URL  = https://<your-vercel-domain>/api/live-rates/publish
CRON_SECRET  = <the SAME random string used in Vercel>
```
The workflow `.github/workflows/live-rates-cron.yml` runs automatically once pushed (Actions tab).
There's a **Run workflow** button to trigger it manually.

### Step 5 — Test safely BEFORE real writes (dry run)
Dry run scrapes + runs all guards but does **not** log in or write to the backend:
```bash
curl -X POST "https://<your-vercel-domain>/api/live-rates/publish?dryRun=1" \
  -H "x-cron-secret: <CRON_SECRET>"
```
Expected: `{"published":false,"dryRun":true,"wouldPublish":{...},"fetchedAt":...}`
(If run outside market hours you'll get `{"published":false,"skipped":"market-closed"}` — that's correct.)

### Step 6 — Go live
- Remove `?dryRun=1` (or just let the cron run). During market hours it will POST/PUT the live rate to
  `/gold-rates/today`. Confirm the mobile app now shows the live rate.
- Verify in the Actions tab that runs return HTTP 200 and `published:true` during market hours.

### Step 7 (optional) — decide auto-publish policy
Currently: **auto-publish during market hours** with sanity guards. If you prefer the mobile rate to
change only when **both** sources agree, or want a wider/narrower sanity band, adjust
`sanityReasons()` / `marketOpen()` in `src/app/api/live-rates/publish/route.js`.

---

## 8. Safety guards in the publish route (why it won't push bad billing rates)
1. **Shared secret** — only a caller with the correct `x-cron-secret` header can trigger it (else 401).
2. **Market-hours gate** — only writes 09:05–23:25 IST, Mon–Fri; else no-op.
3. **Sanity checks** — requires 24K/22K/18K present, within sane ranges, and correctly ordered
   (24K > 22K > 18K). Any source error or bad value → **no write** (`published:false`), not an error.
4. **Fail-soft** — closed market, failed sanity, or unreachable source all return HTTP 200 with
   `published:false`, so the cron schedule never "fails".

---

## 9. Endpoints reference

| Method | Path | Auth | Use |
|---|---|---|---|
| GET | `/api/live-rates` | none | Live rates JSON (admin form, or any direct client). `?fresh=1` skips 20s cache. |
| POST | `/api/live-rates/publish` | `x-cron-secret` header | Scrape + write to backend. `?dryRun=1` = no write. |

---

## 10. Open question for the teammate to confirm
The mobile app reads the **Render backend** (confirmed). So auto-publish (§7) is the correct path and
requires the **service account credentials**. If, instead, you ever point the mobile app to call
`GET /api/live-rates` (Vercel) directly, it would get live rates without the backend write — but that
changes the mobile app and is a separate decision.

---

## 11. PROMPT FOR THE TEAMMATE'S CLAUDE SESSION

Copy-paste this into Claude Code (opened in this project) to have it explain, verify, and push:

```
This Next.js project (DFX admin web app) has a newly added "DFX Collector Engine" that scrapes
live gold/silver rates. It was implemented but NOT yet pushed or deployed. Read
DFX-COLLECTOR-ENGINE.md at the project root first — it documents everything.

Please do the following:

1. EXPLAIN: Read src/lib/collector.js, src/app/api/live-rates/route.js,
   src/app/api/live-rates/publish/route.js, src/services/liveRateService.js,
   src/views/GoldRate.jsx, and .github/workflows/live-rates-cron.yml. Give me a concise
   walkthrough of how the scraping, the 60s browser refresh, and the 5-min auto-publish cron work,
   and how the live rate reaches the MOBILE app (which reads the Render backend, not Vercel).

2. VERIFY LOCALLY: Run `npm install` and `npm run dev`, then test:
     - GET  http://localhost:3000/api/live-rates?fresh=1   → expect JSON with form + success:true
     - POST http://localhost:3000/api/live-rates/publish    → expect 401 without a secret
   Confirm the parsed 24K/22K/18K/silver values match what kjpl.in and thejewellersassociation.org
   currently show (24K from the kjpl.txt feed, com_id 48; 22K with-GST should match KJPL's rounded
   14,668-style value; 18K from the MJDTA site).

3. REVIEW: Check the safety guards in the publish route (secret, market hours 09:05–23:25 IST Mon–Fri,
   sanity ranges + karat ordering). Point out anything risky before it writes to the billing backend.

4. DEPLOY: I have GitHub + Vercel + Render access. Walk me through / do:
     - Push the code to the GitHub repo Vercel deploys.
     - Set Vercel env vars: CRON_SECRET, DFX_API_URL, DFX_SERVICE_USERNAME, DFX_SERVICE_PASSWORD.
     - Set GitHub Actions secrets: PUBLISH_URL, CRON_SECRET (same value as Vercel).
     - Create/confirm a backend service account that can write /gold-rates/today.
   Then have me dry-run:  POST /api/live-rates/publish?dryRun=1  with the x-cron-secret header,
   confirm `wouldPublish` looks right, and only then enable the real cron.

Do not commit any secrets to the repo. Report what you changed and the exact test outputs.
```

---

## 12. Quick local test commands
```bash
# Live rates (read-only)
curl "http://localhost:3000/api/live-rates?fresh=1"

# Publish guard (should be 401 without secret)
curl -X POST "http://localhost:3000/api/live-rates/publish"

# Dry run (needs CRON_SECRET set in the environment the server reads)
curl -X POST "http://localhost:3000/api/live-rates/publish?dryRun=1" -H "x-cron-secret: <CRON_SECRET>"
```

---

## 13. FULL SOURCE OF EVERY CHANGE

The complete content of every added/modified file, so this document is
self-contained — a reviewer (or Claude) can understand exactly what changed
without the repo. Paths are relative to the project root.

### 13.1 `src/lib/collector.js` — NEW (shared scraping core)

````js
/**
 * DFX Collector Engine — shared scraping core.
 *
 * Fetches and normalizes live gold/silver rates from two Indian sources, from
 * their server-rendered HTML/feeds (no headless browser, no socket, no keys):
 *
 *   KJPL  (http://www.kjpl.in/ + /client/kjpl.txt) — live 24K (999) via the feed,
 *          plus the MJDTA With/Without-GST board block.
 *   MJDTA (https://thejewellersassociation.org/)   — 18K + 22K backup + silver.
 *
 * Only the Indian retail rates the business bills at (24K/22K/18K gold + silver)
 * are collected; USD / global / LBMA / forex rows are ignored. Missing figures
 * stay null and are never fabricated.
 *
 * Used by:
 *   GET  /api/live-rates          — read-only, feeds the admin form + mobile.
 *   POST /api/live-rates/publish  — the cron: writes into the DFX backend.
 */

const KJPL_URL = "http://www.kjpl.in/";
// KJPL's live rate feed — the same tab-separated feed the site's socket display
// reads. Type-3 rows are the retail gram gold rates; com_id 48 = the Chennai
// 999 (24K) rate. Tracks the live displayed value, unlike the slower snapshot.
const KJPL_FEED_URL = "http://www.kjpl.in/client/kjpl.txt";
const KJPL_24K_COM_ID = "48"; // GOLD 100 GMS 999 Chennai
const MJDTA_URL = "https://thejewellersassociation.org/";
export const GST_RATE = 0.03; // MJDTA board GST (verified: 14667.20 / 14240 = 1.03)
const FETCH_TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 20000; // soft cache so rapid reloads don't hammer sources

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Fetch text with a timeout and browser-like headers. */
async function fetchText(url, extraHeaders = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...extraHeaders,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

const toNum = (v) => {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const withGst = (n) => (n == null ? null : round2(n * (1 + GST_RATE)));
/** Pick the first finite value from the given candidates. */
const pick = (...vals) => vals.find((v) => Number.isFinite(v)) ?? null;

/**
 * KJPL homepage — the MJDTA With/Without-GST board block (22K + silver, incl.
 * the officially published with-GST figures), plus a slower snapshot 24K used
 * only as a fallback to the live feed.
 */
function parseKjpl(html) {
  const out = { ok: true, gold24k: null, silverSpot: null, mjdta: {}, updated: null };

  const settingM = html.match(/var\s+rpanelsetting\s*=\s*(\{.*?\});/s);
  const comM = html.match(/var\s+rpanelcommodities\s*=\s*(\[.*?\]);/s);
  if (comM) {
    const coms = JSON.parse(comM[1]);
    let gW = 10, sW = 1000;
    if (settingM) {
      const s = JSON.parse(settingM[1]);
      gW = toNum(s.rpsg_weight) || 10;
      sW = toNum(s.rpss_weight) || 1000;
    }
    const gold = coms.find((c) => /gold/i.test(c.dispname || ""));
    const silver = coms.find((c) => /silver/i.test(c.dispname || ""));
    if (gold) out.gold24k = round2(toNum(gold.sellrate) / gW);
    if (silver) out.silverSpot = round2(toNum(silver.sellrate) / sW);
  }

  // MJDTA board block(s): rendered twice — a mobile copy with a precise
  // recompute (14667.20) and the desktop copy with MJDTA's official rounded
  // display (14668). For With-GST, prefer the official whole-rupee display.
  const cand = { withGst: [], withoutGst: [] };
  for (const m of html.matchAll(/MJDTA RATE \((With|Without) GST\)<\/strong>[\s\S]*?<\/table>/g)) {
    const kind = m[1].toLowerCase() === "with" ? "withGst" : "withoutGst";
    const goldRaw = (m[0].match(/GOLD:<\/td>\s*<td[^>]*>\(₹\)\s*([\d.,]+)/)?.[1] || "").replace(/,/g, "");
    const silverRaw = m[0].match(/SILVER:<\/td>\s*<td[^>]*>\(₹\)\s*([\d.,]+)/)?.[1];
    const u = m[0].match(/UPDATED:<\/td>\s*<td[^>]*>([^<]+)</)?.[1];
    cand[kind].push({ gold: toNum(goldRaw), silver: toNum(silverRaw), goldRaw });
    if (u && !out.updated) out.updated = u.trim();
  }
  const chooseWith = cand.withGst.find((c) => /^\d+(\.0+)?$/.test(c.goldRaw)) || cand.withGst[0];
  const chooseWithout = cand.withoutGst[0];
  if (chooseWithout) out.mjdta.withoutGst = { gold: chooseWithout.gold, silver: chooseWithout.silver };
  if (chooseWith) out.mjdta.withGst = { gold: chooseWith.gold, silver: chooseWith.silver };
  return out;
}

/**
 * KJPL live feed (kjpl.txt) — tab-separated. Type-3 rows are the retail gram
 * gold rates; column 4 is the live per-gram rate. com_id 48 = Chennai 999 (24K).
 */
function parseKjplFeed(txt) {
  const rows = {};
  let updated = null;
  for (const line of txt.split(/\r?\n/)) {
    const f = line.split("\t");
    if (f[0] === "3" && f[1]) {
      const rate = toNum(f[4]);
      if (rate != null && rate > 0) rows[f[1].trim()] = rate;
    } else if (f[0] === "4") {
      updated = line.match(/"([^"]+)"/)?.[1] || updated;
    }
  }
  const gold24k = pick(rows[KJPL_24K_COM_ID], rows["49"], rows["50"], rows["51"], rows["52"], rows["47"]);
  return { ok: true, gold24k, updated };
}

/**
 * MJDTA (thejewellersassociation.org) — rates baked into an inline
 * set_goldrate() script. Authoritative 18K source and the 22K/silver backup.
 */
function parseMjdta(html) {
  const g = (id) => toNum(html.match(new RegExp(`#goldrate_${id}'\\)\\.html\\("([\\d.]+)"\\)`))?.[1]);
  const gold22k = g("22ct");
  const gold18k = g("18ct");
  const gold14kRaw = g("14ct");
  const silver = toNum(html.match(/class="silver_rate"[^>]*>([\d.]+)<\/span>/)?.[1]);
  const upd = html.match(/set_updatetime\("([^"]+)"\)/)?.[1] || null;
  return {
    ok: true,
    gold22k: gold22k || null,
    gold18k: gold18k || null,
    gold14k: gold14kRaw && gold14kRaw > 0 ? gold14kRaw : null, // 0 = unpublished
    silver: silver || null,
    updated: upd,
  };
}

function buildPayload(kjpl, kjplFeed, mjdta, errors) {
  const kMjWithout = kjpl?.mjdta?.withoutGst || {};
  const kMjWith = kjpl?.mjdta?.withGst || {}; // MJDTA's officially published with-GST

  const gold22kBase = pick(kMjWithout.gold, mjdta?.gold22k);
  const feed24k = kjplFeed?.gold24k ?? null;
  const gold24k = pick(feed24k, kjpl?.gold24k, gold22kBase != null ? round2(gold22kBase * (24 / 22)) : NaN);
  const gold24kSource =
    feed24k != null ? "kjpl-live-feed" : kjpl?.gold24k != null ? "kjpl-snapshot" : gold24k != null ? "derived(22k×24/22)" : null;

  const g22 = pick(kMjWithout.gold, mjdta?.gold22k);
  const g18 = mjdta?.gold18k ?? null;
  const silver = pick(kMjWithout.silver, mjdta?.silver, kjpl?.silverSpot);

  const g22WithGst = pick(kMjWith.gold, withGst(g22));
  const silverWithGst = pick(kMjWith.silver, withGst(silver));

  // 14K / 9K: not published — derive from 24K by karat fraction (rate = 24K × k/24).
  const derive = (karat) => (gold24k == null ? null : round2(gold24k * (karat / 24)));
  const g14 = mjdta?.gold14k ?? derive(14);
  const g9 = derive(9);

  return {
    success: gold24k != null || g22 != null || g18 != null,
    fetchedAt: new Date().toISOString(),
    gstRate: GST_RATE,
    form: { r24: gold24k, r22: g22, r18: g18, r14: g14, r9: g9, silver },
    rates: {
      gold_24k: { value: gold24k, source: gold24kSource, unit: "per_gram_inr" },
      gold_22k: {
        withoutGst: g22,
        withGst: g22WithGst,
        withGstSource: kMjWith.gold != null ? "kjpl-mjdta-published" : "computed(×1.03)",
        source: kMjWithout.gold != null ? "kjpl-mjdta-board" : mjdta?.gold22k != null ? "mjdta" : null,
        backup: mjdta?.gold22k ?? null,
        unit: "per_gram_inr",
      },
      gold_18k: { withoutGst: g18, withGst: withGst(g18), source: g18 != null ? "mjdta" : null, unit: "per_gram_inr" },
      gold_14k: {
        withoutGst: g14,
        withGst: withGst(g14),
        source: mjdta?.gold14k != null ? "mjdta" : g14 != null ? "derived(24k×14/24)" : null,
        derived: mjdta?.gold14k == null && g14 != null,
        unit: "per_gram_inr",
      },
      gold_9k: {
        withoutGst: g9,
        withGst: withGst(g9),
        source: g9 != null ? "derived(24k×9/24)" : null,
        derived: g9 != null,
        unit: "per_gram_inr",
      },
      silver: {
        withoutGst: silver,
        withGst: silverWithGst,
        source: kMjWithout.silver != null ? "kjpl-mjdta-board" : mjdta?.silver != null ? "mjdta" : "kjpl-spot",
        unit: "per_gram_inr",
      },
    },
    sources: {
      kjpl: kjpl?.ok
        ? { ok: true, gold24k: kjpl.gold24k, silverSpot: kjpl.silverSpot, mjdtaBlock: kjpl.mjdta, updated: kjpl.updated }
        : { ok: false },
      kjplFeed: kjplFeed?.ok ? { ok: true, gold24k: kjplFeed.gold24k, updated: kjplFeed.updated } : { ok: false },
      mjdta: mjdta?.ok
        ? { ok: true, gold22k: mjdta.gold22k, gold18k: mjdta.gold18k, gold14k: mjdta.gold14k, silver: mjdta.silver, updated: mjdta.updated }
        : { ok: false },
    },
    errors,
  };
}

let cache = { at: 0, body: null };

/** Scrape all sources and return the normalized payload. 20s soft cache. */
export async function collectLiveRates({ fresh = false } = {}) {
  if (!fresh && cache.body && Date.now() - cache.at < CACHE_TTL_MS) {
    return { ...cache.body, cached: true };
  }
  const errors = [];
  const [kjplRes, feedRes, mjdtaRes] = await Promise.allSettled([
    fetchText(KJPL_URL).then(parseKjpl),
    fetchText(KJPL_FEED_URL, { Referer: "http://www.kjpl.in/" }).then(parseKjplFeed),
    fetchText(MJDTA_URL, { Referer: "https://www.google.com/" }).then(parseMjdta),
  ]);
  const kjpl = kjplRes.status === "fulfilled" ? kjplRes.value : null;
  const kjplFeed = feedRes.status === "fulfilled" ? feedRes.value : null;
  const mjdta = mjdtaRes.status === "fulfilled" ? mjdtaRes.value : null;
  if (kjplRes.status === "rejected") errors.push({ source: "kjpl", message: String(kjplRes.reason?.message || kjplRes.reason) });
  if (feedRes.status === "rejected") errors.push({ source: "kjplFeed", message: String(feedRes.reason?.message || feedRes.reason) });
  if (mjdtaRes.status === "rejected") errors.push({ source: "mjdta", message: String(mjdtaRes.reason?.message || mjdtaRes.reason) });

  const body = buildPayload(kjpl, kjplFeed, mjdta, errors);
  cache = { at: Date.now(), body };
  return body;
}
````

### 13.2 `src/app/api/live-rates/route.js` — NEW (GET, read-only)

````js
/**
 * DFX Collector Engine — read-only live rate endpoint.  GET /api/live-rates
 *
 * Scrapes KJPL + MJDTA server-side (see src/lib/collector.js) and returns the
 * normalized payload. Feeds the admin web form (auto-prefill) and can be called
 * directly by any client (e.g. a native mobile app — CORS does not apply there).
 * Pass ?fresh=1 to bypass the 20s soft cache.
 */
import { collectLiveRates } from "../../../lib/collector";

export const dynamic = "force-dynamic"; // never statically cached
export const revalidate = 0;

export async function GET(request) {
  const fresh = new URL(request.url).searchParams.get("fresh") === "1";
  const body = await collectLiveRates({ fresh });
  return Response.json(body, { status: body.success ? 200 : 502 });
}
````

### 13.3 `src/app/api/live-rates/publish/route.js` — NEW (POST, protected auto-publish)

````js
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
````

### 13.4 `src/services/liveRateService.js` — NEW (client for the GET endpoint)

````js
/**
 * Client for the DFX Collector Engine (same-origin Next.js route at
 * /api/live-rates). Kept separate from apiClient because the collector lives on
 * the frontend origin, not the external DFX backend, and needs no auth token.
 *
 * The collector proposes live rates; the operator reviews and publishes them
 * through the existing gold-rate flow. Nothing here writes to the backend.
 */

export const liveRateService = {
  /**
   * GET /api/live-rates — scrape KJPL + MJDTA and return the normalized
   * collector payload. Pass { fresh:true } to bypass the 20s soft cache.
   */
  async getLiveRates({ fresh = false, signal } = {}) {
    const res = await fetch(`/api/live-rates${fresh ? "?fresh=1" : ""}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      const msg = data?.errors?.[0]?.message || `Live rate fetch failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  },
};
````

### 13.5 `.github/workflows/live-rates-cron.yml` — NEW (free 5-min cron)

````yaml
# DFX Collector Engine — free 24/7 auto-publish cron.
#
# Every 5 minutes GitHub Actions POSTs to the deployed /api/live-rates/publish
# route, which scrapes KJPL + MJDTA and writes the live rate into the DFX
# (Render) backend — the source the MOBILE app reads. No server of your own runs
# 24/7; GitHub's runners do the scheduling for free, Vercel does the work.
#
# The publish route itself enforces market hours (09:05–23:25 IST, Mon–Fri) and
# sanity checks, so off-hours or bad-scrape runs simply no-op (published:false).
# The schedule below is narrowed to roughly those hours (UTC) just to avoid
# pointless runs — the route remains the authority.
#
# SETUP (one time):
#   1. Push this repo to the GitHub repo Vercel deploys from.
#   2. Add two GitHub repo secrets (Settings → Secrets and variables → Actions):
#        PUBLISH_URL  = https://<your-app>.vercel.app/api/live-rates/publish
#        CRON_SECRET  = <a long random string>
#   3. In Vercel (Project → Settings → Environment Variables) set the matching:
#        CRON_SECRET           = <the SAME random string>
#        DFX_API_URL           = https://dfx-backend-lym0.onrender.com/api/v1
#        DFX_SERVICE_USERNAME  = <a backend account allowed to write gold rates>
#        DFX_SERVICE_PASSWORD  = <its password>
#      then redeploy so the env vars take effect.
#   4. Test without touching the backend: run the workflow manually (Actions →
#      Run workflow) — or locally hit the route with ?dryRun=1.

name: live-rates-cron

on:
  schedule:
    - cron: "*/5 3-18 * * 1-5" # ~every 5 min during IST market hours (UTC), Mon–Fri
  workflow_dispatch: {}

concurrency:
  group: live-rates-cron
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Scrape & publish live rate
        env:
          PUBLISH_URL: ${{ secrets.PUBLISH_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
        run: |
          if [ -z "$PUBLISH_URL" ] || [ -z "$CRON_SECRET" ]; then
            echo "::error::PUBLISH_URL and CRON_SECRET secrets must be set."
            exit 1
          fi
          echo "POST $PUBLISH_URL"
          code=$(curl -sS -m 40 -o /tmp/out.json -w "%{http_code}" \
            -X POST "$PUBLISH_URL" \
            -H "x-cron-secret: $CRON_SECRET" || echo "000")
          echo "HTTP $code"
          echo "----- response -----"
          head -c 800 /tmp/out.json || true
          echo ""
          # 200 covers both a real publish and an intentional no-op
          # (market-closed / sanity-failed). Only non-200 is worth a warning.
          if [ "$code" = "200" ]; then
            echo "OK"
          else
            echo "::warning::Non-200 ($code) — will retry next run."
          fi
````

### 13.6 `src/views/GoldRate.jsx` — MODIFIED (auto-prefill + 60s refresh + GST/derived hints)

> Only this file was modified (the rest are new). Changes vs the original:
> imports `liveRateService`; adds `dirty`/`live`/`liveLoading`/`liveErr` state and a
> dirty-tracking `setField`; adds `fetchLive(mode)`; auto-fetches on mount and every
> 60s; adds the hero "incl. GST" line, the 22K "Without/With GST" hint, the 14K/9K
> "Derived" hints, the "Fetch live" button and the live-status line. **No layout was
> restructured.** Full current file:

````jsx
import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { usePageMotion, usePressFeedback } from "../hooks/usePageMotion";
import { toast } from "../lib/toast";
import { formatINR } from "../lib/utils";
import { goldRateService } from "../services/goldRateService";
import { liveRateService } from "../services/liveRateService";

// Real gold rate loaded from the DFX backend (24K authoritative).
// No mock rate history remains; the backend contract exposes no history endpoint.
const HISTORY = [];

export default function GoldRate() {
  const scope = useRef(null);
  usePressFeedback(scope);
  // Six manually-entered rates (strings for the inputs). Empty stays empty —
  // never fabricated. rate_24k is the only backend-required figure.
  const EMPTY = { r24: "", r22: "", r18: "", r14: "", r9: "", silver: "" };
  const [rates, setRates] = useState(EMPTY);
  // Fields the operator has hand-edited since the last live pull. Auto-refresh
  // updates every other field but never clobbers these.
  const dirty = useRef(new Set());
  const setField = (k) => (e) => {
    dirty.current.add(k);
    setRates((s) => ({ ...s, [k]: e.target.value }));
  };
  const [loading, setLoading] = useState(true);
  usePageMotion(scope, [loading]);
  const [saving, setSaving] = useState(false);
  const [todayExists, setTodayExists] = useState(false);
  // DFX Collector Engine: live rates scraped from KJPL + MJDTA (server-side).
  const [live, setLive] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveErr, setLiveErr] = useState("");

  const num = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : null; };

  // Pull live rates from the collector.
  //   "fill"  — initial load: fill only blank fields, never touch a saved rate.
  //   "force" — Fetch live button: replace every field, clear hand-edits.
  //   "auto"  — refresh timer: update every field except ones hand-edited.
  const fetchLive = useCallback(async (mode = "fill") => {
    setLiveLoading(true);
    setLiveErr("");
    try {
      const data = await liveRateService.getLiveRates({ fresh: mode === "force" });
      setLive(data);
      const f = data.form || {};
      const str = (n) => (n != null ? String(n) : "");
      const keys = ["r24", "r22", "r18", "r14", "r9", "silver"];
      setRates((s) => {
        const next = { ...s };
        for (const k of keys) {
          if (f[k] == null) continue;
          const allow = mode === "force" ? true : mode === "fill" ? s[k] === "" : !dirty.current.has(k);
          if (allow) next[k] = str(f[k]);
        }
        return next;
      });
      if (mode === "force") dirty.current.clear();
      return data;
    } catch (err) {
      setLiveErr(err?.message || "Live fetch failed");
      return null;
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const loadRate = useCallback(async () => {
    setLoading(true);
    try {
      const today = await goldRateService.getTodayRate();
      if (today?.rate_24k != null) {
        setRates({
          r24: String(today.rate_24k),
          r22: today.rate_22k != null ? String(today.rate_22k) : "",
          r18: today.rate_18k != null ? String(today.rate_18k) : "",
          r14: today.rate_14k != null ? String(today.rate_14k) : "",
          r9: today.rate_9k != null ? String(today.rate_9k) : "",
          silver: today.silver_999 != null ? String(today.silver_999) : "",
        });
        setTodayExists(true);
      } else {
        setRates(EMPTY);
        setTodayExists(false);
      }
    } catch {
      setRates(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Load today's saved rate, then overlay live collector data (fills only the
    // blank fields, and populates the live/GST hints below).
    loadRate().finally(() => fetchLive("fill"));
  }, [loadRate, fetchLive]);

  // Auto-refresh every 60s, unconditionally, for as long as the screen is
  // mounted — the whole app keys off these live rates, so it keeps ticking even
  // when the tab is in the background. Paced at ~1 request/min via the 20s
  // server cache, so it stays gentle on the source sites.
  useEffect(() => {
    const REFRESH_MS = 60000;
    const id = setInterval(() => fetchLive("auto"), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchLive]);

  async function publishRate() {
    const r24 = Number(rates.r24);
    if (!r24 || r24 <= 0) { toast("Enter a valid 24K rate"); return; }
    setSaving(true);
    try {
      if (todayExists) await goldRateService.updateTodayRate(rates);
      else await goldRateService.createTodayRate(rates);
      await loadRate();
      toast(`Gold rate published at ${formatINR(r24)}/g (24K)`);
    } catch (err) {
      toast(err?.message || "Publish failed");
    } finally {
      setSaving(false);
    }
  }

  // No previous-rate endpoint in the contract; delta indicator stays flat.
  const prevRate = null;
  const diff = 0;
  const pct = 0;
  const isUp = false;
  const isDown = false;

  return (
    <div ref={scope} className="mx-auto max-w-[1200px]">
      <div data-motion="page-head" className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Gold Rate</h2>
          <p className="mt-1 max-w-[55ch] text-sm text-muted">
            Set the daily rate. Updates publish to the storefront and apply to new bills instantly.
          </p>
        </div>
        <Badge tone="info" dot>IBJA sync · 11:00 AM</Badge>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div data-motion="stat" className="hero-card group relative overflow-hidden rounded-[20px] border border-white/10 p-7 text-white shadow-xl lg:col-span-2" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 55%, #1e293b 100%)' }}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-[#c9a84c]/25 blur-2xl" />
          <div className="pointer-events-none absolute -left-12 -bottom-12 h-40 w-40 rounded-full bg-amber-400/10 blur-2xl" />
          <div className="pointer-events-none absolute inset-0 rounded-[20px] border border-white/[0.06]" />
          <div className="relative flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">22K Gold · per gram</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-bold backdrop-blur"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />LIVE</span>
          </div>
          <div className="num relative mt-3 text-5xl font-extrabold tracking-tight text-white drop-shadow-sm">
            {num(rates.r22) != null ? formatINR(num(rates.r22)) : "—"}
          </div>
          {live?.rates?.gold_22k?.withGst != null && (
            <div className="num relative mt-1 text-[13px] font-semibold text-white/60">
              incl. GST {formatINR(live.rates.gold_22k.withGst)}
            </div>
          )}
          <div className={`relative mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold backdrop-blur ${isUp ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-300" : isDown ? "border-red-400/20 bg-red-500/15 text-red-300" : "border-[#fde68a]/20 bg-[#c9a84c]/15 text-[#fde68a]"}`} style={isDown ? { textShadow: "0 0 10px rgba(252,165,165,0.7)", boxShadow: "0 0 18px rgba(239,68,68,0.32)" } : isUp ? { textShadow: "0 0 10px rgba(110,231,183,0.55)", boxShadow: "0 0 18px rgba(16,185,129,0.22)" } : undefined}>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{isDown ? <path d="M7 7l10 10M17 7v10H7" /> : <path d="M7 17 17 7M7 7h10v10" />}</svg>
            {diff === 0 ? "— No change vs yesterday" : `${diff > 0 ? "+" : ""}₹${diff} (${pct > 0 ? "+" : ""}${pct.toFixed(2)}%) vs yesterday`}
          </div>
          <div className="relative mt-7 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />24K</div>
              <div className="num mt-1 text-[15px] font-extrabold text-white">{num(rates.r24) != null ? formatINR(num(rates.r24)) : "—"}</div>
              <div className="text-[11px] text-white/45">per gram</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/55"><span className="h-1.5 w-1.5 rounded-full bg-slate-300" />Silver / g</div>
              <div className="num mt-1 text-[15px] font-extrabold text-white">{num(rates.silver) != null ? formatINR(num(rates.silver)) : "—"}</div>
              <div className="text-[11px] text-white/45">per gram</div>
            </div>
          </div>
        </div>

        <Card data-motion="stat" className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Update today&apos;s rate</CardTitle>
              <CardDescription>Publishes to storefront and billing immediately</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">24K rate / gram</span>
                <Input type="number" value={rates.r24} onChange={setField("r24")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">22K rate / gram</span>
                <Input type="number" value={rates.r22} onChange={setField("r22")} />
                {live?.rates?.gold_22k?.withGst != null && (
                  <span className="text-[11px] text-muted">
                    Without GST {formatINR(live.rates.gold_22k.withoutGst)} · With GST {formatINR(live.rates.gold_22k.withGst)}
                  </span>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">18K rate / gram</span>
                <Input type="number" value={rates.r18} onChange={setField("r18")} />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">14K rate / gram</span>
                <Input type="number" value={rates.r14} onChange={setField("r14")} />
                {live?.rates?.gold_14k?.derived && (
                  <span className="text-[11px] text-muted">Derived · 24K × 14/24</span>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">9K rate / gram</span>
                <Input type="number" value={rates.r9} onChange={setField("r9")} />
                {live?.rates?.gold_9k?.derived && (
                  <span className="text-[11px] text-muted">Derived · 24K × 9/24</span>
                )}
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.07em]">Silver / gram</span>
                <Input type="number" value={rates.silver} onChange={setField("silver")} />
              </label>
            </div>
            <p className="mt-3 text-xs text-muted">
              Existing bill drafts are unaffected. Rate history keeps a full audit trail.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Button size="sm" disabled={saving || loading} onClick={publishRate}>{saving ? "Publishing…" : "Save & publish"}</Button>
              <Button size="sm" variant="outline" disabled={saving} onClick={loadRate}>Reset</Button>
              <Button size="sm" variant="outline" disabled={liveLoading || saving} onClick={() => fetchLive("force")}>
                {liveLoading ? "Fetching…" : "Fetch live"}
              </Button>
              {liveErr ? (
                <span className="text-[11px] text-red-500">Live: {liveErr}</span>
              ) : live?.fetchedAt ? (
                <span className="text-[11px] text-muted">
                  Live · KJPL + MJDTA · auto 60s · {new Date(live.fetchedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card data-motion="reveal">
          <CardHeader>
            <div>
              <CardTitle>30-day trend</CardTitle>
              <CardDescription>22K per gram · August 2026</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <svg viewBox="0 0 560 200" className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Gold rate trend, last 30 days">
              <defs>
                <linearGradient id="rateArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c9a84c" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#c9a84c" stopOpacity="0" />
                </linearGradient>
              </defs>
              <g stroke="var(--color-line-soft)"><line x1="0" y1="60" x2="560" y2="60" /><line x1="0" y1="120" x2="560" y2="120" /><line x1="0" y1="180" x2="560" y2="180" /></g>
              <path d="M0,175 C50,170 90,150 140,155 C190,160 240,130 290,125 C340,120 380,130 430,110 C480,90 520,80 560,62 L560,200 L0,200 Z" fill="url(#rateArea)" />
              <path d="M0,175 C50,170 90,150 140,155 C190,160 240,130 290,125 C340,120 380,130 430,110 C480,90 520,80 560,62 L560,200 L0,200 Z" fill="none" stroke="#c9a84c" strokeWidth="2.5" strokeLinecap="round" data-motion="draw" />
              <circle cx="560" cy="60" r="4.5" fill="#c9a84c" />
            </svg>
          </CardContent>
        </Card>

        <Card data-motion="reveal" className="overflow-hidden">
          <CardHeader>
            <div>
              <CardTitle>Rate history</CardTitle>
              <CardDescription>Last 5 published days</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0 pb-0">
            <table className="w-full min-w-[460px] border-collapse text-sm">
              <thead>
                <tr className="border-y border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                  <th className="px-6 py-3">Date</th><th className="py-3">22K</th><th className="py-3">Silver</th><th className="py-3">Change</th>
                </tr>
              </thead>
              <tbody>
                {HISTORY.map((h) => (
                  <tr key={h.date} className="border-b border-line-soft transition-colors duration-150 last:border-0 hover:bg-canvas/60">
                    <td className="px-6 py-3 font-semibold">{h.date}</td>
                    <td className="num py-3">{formatINR(h.k22)}</td>
                    <td className="num py-3">₹{h.silver.toFixed(2)}</td>
                    <td className="py-3">
                      <Badge tone={h.dir === "up" ? "success" : h.dir === "down" ? "danger" : "neutral"}>{h.change}</Badge>
                    </td>
                  </tr>
                ))}
                {HISTORY.length === 0 && (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-muted">No rate history available.</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
````
