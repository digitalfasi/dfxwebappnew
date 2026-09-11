/**
 * Gold rate integration for the new UI. Backend stores the 24K rate
 * authoritatively (rate_24k) plus optional manually-entered per-purity and
 * silver rates (rate_22k/rate_18k/rate_14k/rate_9k/silver_999). Only rate_24k
 * is required; any omitted purity stays null (never fabricated).
 */
import { apiClient } from "@/_shared/apiClient";

/** Build the request body from a {r24,r22,r18,r14,r9,silver} rate set. Only
 *  positive numbers are sent; blank/zero fields are dropped so they persist as
 *  NULL rather than a fabricated value. rate_24k is always required. */
function toBody(rates) {
  const body = { rate_24k: Number(rates.r24) };
  const opt = { rate_22k: rates.r22, rate_18k: rates.r18, rate_14k: rates.r14, rate_9k: rates.r9, silver_999: rates.silver };
  for (const [k, v] of Object.entries(opt)) {
    const n = Number(v);
    if (v !== "" && v != null && Number.isFinite(n) && n > 0) body[k] = n;
  }
  return body;
}

export const goldRateService = {
  /** GET /api/v1/gold-rates/today — returns null when none set for today. */
  async getTodayRate({ carryForward = false } = {}) {
    // carryForward is for screens that need A rate to work with rather than an
    // answer to "has today been published". The rate comes back with its own
    // effective_date, which the caller MUST show - it may not be today's.
    const qs = carryForward ? "?carry_forward=true" : "";
    const res = await apiClient.get(`/gold-rates/today${qs}`, { auth: true });
    return res.data?.rate ?? null;
  },

  /** GET /api/v1/gold-rates/history — recent published rates (newest first,
   *  all purities + silver). Powers the trend chart + history table. */
  async getHistory(limit = 30) {
    const res = await apiClient.get(`/gold-rates/history?limit=${limit}`, { auth: true });
    return res.data?.history ?? [];
  },

  /**
   * The most recently published rate, whatever day it belongs to. Used for
   * DISPLAY only, when today's rate has not been published yet: the header
   * strip then shows the rate actually in force, labelled with its own date,
   * rather than an empty "—". Never used to price anything — billing resolves
   * its own rate server-side.
   */
  async getLastPublishedRate() {
    const history = await this.getHistory(1);
    return history[0] ?? null;
  },

  /** POST /api/v1/gold-rates/today — first set of the day. */
  async createTodayRate(rates) {
    const res = await apiClient.post("/gold-rates/today", toBody(rates), { auth: true });
    notifyRatePublished();
    return res.data?.rate;
  },

  /** PUT /api/v1/gold-rates/today — update today's rate. */
  async updateTodayRate(rates) {
    const res = await apiClient.put("/gold-rates/today", toBody(rates), { auth: true });
    notifyRatePublished();
    return res.data?.rate;
  },
};

// Broadcast that today's rate changed so the global TopBar bullion strip
// re-fetches immediately after an admin publishes, without a page reload.
export const RATE_PUBLISHED_EVENT = "dfx:rate-published";
function notifyRatePublished() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RATE_PUBLISHED_EVENT));
}
