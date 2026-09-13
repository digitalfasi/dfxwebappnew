/**
 * D5 / D6 — the shop's ladder never reached the enrollment screens.
 *
 * D6: the monthly-amount list read `scheme.tiers` only. The scheme's OWN amount
 * is not a tier row — it lives on the scheme — so a shop selling PREMIUM
 * MONTHLY PLAN at Rs 1,000 with tiers of Rs 5,000 and Rs 10,000 could not
 * enrol anyone at Rs 1,000 from that screen.
 *
 * D5: Add Customer offered one flat list at the base amount, with no tier and
 * no purity at all — and the enrollment was then written with no snapshot, so
 * it silently fell back to the base amount. All three of Afsar's live
 * enrollments were created this way.
 *
 * Both screens now compose the list from the same builder.
 */
import { describe, it, expect } from "vitest";
import { planOptionsFor, BASE_PLAN } from "../src/modules/customers/schemePlan";

// Afsar's PREMIUM MONTHLY PLAN, exactly as the database has it.
const PREMIUM = {
  id: "sch_29b6ebbe59b6",
  amount: 1000,
  durationMonths: 12,
  tiers: [
    { id: "t5", monthlyAmount: 5000, durationMonths: 12, isActive: true },
    { id: "t10", monthlyAmount: 10000, durationMonths: 12, isActive: true },
  ],
};

describe("D6 — the plan's own amount is offered", () => {
  it("lists the base amount and both tiers", () => {
    const opts = planOptionsFor(PREMIUM);
    expect(opts.map((o) => o.amount)).toEqual([1000, 5000, 10000]);
  });

  it("the base is first, and is not a tier id", () => {
    expect(planOptionsFor(PREMIUM)[0].value).toBe(BASE_PLAN);
  });

  it("carries each option's own duration", () => {
    expect(planOptionsFor(PREMIUM).every((o) => o.months === 12)).toBe(true);
  });

  it("ignores inactive tiers", () => {
    const s = { ...PREMIUM, tiers: [...PREMIUM.tiers, { id: "x", monthlyAmount: 99, durationMonths: 12, isActive: false }] };
    expect(planOptionsFor(s).map((o) => o.amount)).toEqual([1000, 5000, 10000]);
  });

  it("de-duplicates a tier that repeats the base", () => {
    const s = { ...PREMIUM, tiers: [{ id: "same", monthlyAmount: 1000, durationMonths: 12, isActive: true }] };
    expect(planOptionsFor(s).map((o) => o.amount)).toEqual([1000]);
  });

  it("a scheme with no tiers still offers its own amount", () => {
    expect(planOptionsFor({ id: "s", amount: 1000, durationMonths: 12, tiers: [] }))
      .toEqual([{ value: BASE_PLAN, amount: 1000, months: 12 }]);
  });

  it("no scheme, no options", () => {
    expect(planOptionsFor(null)).toEqual([]);
  });
});

describe("D5 — what is sent when the base amount is chosen", () => {
  // Mirrors both submit paths: BASE_PLAN is the scheme's own amount, which is
  // not a tier row, so it must be sent as no tier at all.
  const tierToSend = (chosen) => (chosen && chosen !== BASE_PLAN ? chosen : undefined);

  it("sends no tier for the base amount", () => {
    expect(tierToSend(BASE_PLAN)).toBeUndefined();
  });

  it("sends the tier id for a tier", () => {
    expect(tierToSend("t10")).toBe("t10");
  });

  it("sends nothing when nothing is chosen", () => {
    expect(tierToSend("")).toBeUndefined();
  });
});
