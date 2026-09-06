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
