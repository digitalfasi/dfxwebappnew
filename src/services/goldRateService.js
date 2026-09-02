/**
 * Gold rate integration for the new UI. Backend stores the 24K rate
 * authoritatively (rate_24k) plus optional manually-entered per-purity and
 * silver rates (rate_22k/rate_18k/rate_14k/rate_9k/silver_999). Only rate_24k
 * is required; any omitted purity stays null (never fabricated).
 */
import { apiClient } from "../lib/apiClient";

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
  async getTodayRate() {
    const res = await apiClient.get("/gold-rates/today", { auth: true });
    return res.data?.rate ?? null;
  },

  /** POST /api/v1/gold-rates/today — first set of the day. */
  async createTodayRate(rates) {
    const res = await apiClient.post("/gold-rates/today", toBody(rates), { auth: true });
    return res.data?.rate;
  },

  /** PUT /api/v1/gold-rates/today — update today's rate. */
  async updateTodayRate(rates) {
    const res = await apiClient.put("/gold-rates/today", toBody(rates), { auth: true });
    return res.data?.rate;
  },
};
