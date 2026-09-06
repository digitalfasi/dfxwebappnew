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
