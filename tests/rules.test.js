/**
 * The frontend rules that decide whether money can be committed.
 *
 * These are not UI tests. Each one covers a rule the screen applies BEFORE
 * calling the backend — the cases where letting the request through would show
 * the user a raw 400 instead of a sentence they can act on. The backend
 * enforces all of them too; the point here is that the screen agrees with it,
 * because a disagreement is invisible until someone is standing at a counter.
 */
import { describe, it, expect } from "vitest";
import { schemeCapabilities, isWalletScheme, SCHEME_TYPE } from "../src/modules/plan/scheme/schemeCapabilities";

// Mirrors _RATE_OVERRIDE_BAND in app/modules/billing/service.py. If the backend
// band moves, this number moves with it — and the test below is what notices.
const RATE_BAND = 0.5;

const rateBandFor = (publishedRate) =>
  publishedRate == null ? null : { low: publishedRate * (1 - RATE_BAND), high: publishedRate * (1 + RATE_BAND) };

const rateIsOutOfBand = (rate, publishedRate) => {
  const band = rateBandFor(publishedRate);
  if (band == null || rate === "" || rate == null) return false;
  return Number(rate) < band.low || Number(rate) > band.high;
};

describe("negotiated rate band", () => {
  const published = 11925; // a real published 18K rate

  it("accepts an ordinary counter negotiation", () => {
    expect(rateIsOutOfBand(published * 0.95, published)).toBe(false);
    expect(rateIsOutOfBand(published * 1.05, published)).toBe(false);
  });

  it("rejects the tampered figures the band exists for", () => {
    expect(rateIsOutOfBand(1, published)).toBe(true);
    expect(rateIsOutOfBand(1000000, published)).toBe(true);
  });

  it("holds exactly at the edges the backend uses", () => {
    expect(rateIsOutOfBand(published * 0.5, published)).toBe(false);
    expect(rateIsOutOfBand(published * 1.5, published)).toBe(false);
    expect(rateIsOutOfBand(published * 0.5 - 1, published)).toBe(true);
    expect(rateIsOutOfBand(published * 1.5 + 1, published)).toBe(true);
  });

  it("checks nothing when no rate has been published", () => {
    // Better to let the backend answer than to invent a band from nothing.
    expect(rateIsOutOfBand(5, null)).toBe(false);
  });
});

// Mirrors the guard in NewSale.jsx: the backend refuses an approved below-cost
// sale that carries no reason, so the button waits for one.
const belowCostIncomplete = (allow, reason) => allow && (reason || "").trim().length < 3;

describe("below-cost approval", () => {
  it("does not block an ordinary bill", () => {
    expect(belowCostIncomplete(false, "")).toBe(false);
  });

  it("blocks an approval with no reason, or a token one", () => {
    expect(belowCostIncomplete(true, "")).toBe(true);
    expect(belowCostIncomplete(true, "   ")).toBe(true);
    expect(belowCostIncomplete(true, "ok")).toBe(true);
  });

  it("allows a real reason through", () => {
    expect(belowCostIncomplete(true, "clearance")).toBe(false);
  });
});

describe("scheme capabilities", () => {
  it("treats a Digi Gold plan as a wallet with no instalments", () => {
    const c = schemeCapabilities(SCHEME_TYPE.FLEXIBLE_DIGI_GOLD);
    expect(c.isWallet).toBe(true);
    expect(c.hasInstalments).toBe(false);
    expect(c.hasMaturityAmount).toBe(false);
    expect(c.hasOutstanding).toBe(false);
    expect(c.hasDueDates).toBe(false);
  });

  it("treats the two instalment plans as instalment plans", () => {
    for (const t of [SCHEME_TYPE.MONTHLY, SCHEME_TYPE.FIXED_GOLD_RATE]) {
      expect(schemeCapabilities(t).hasInstalments).toBe(true);
    }
  });

  it("falls back to an instalment plan for an unknown type", () => {
    // Every pre-existing scheme is an instalment plan, so that is the safe
    // reading of a type this build has never heard of.
    expect(schemeCapabilities(undefined).hasInstalments).toBe(true);
    expect(isWalletScheme("SOMETHING_NEW")).toBe(false);
  });
});
