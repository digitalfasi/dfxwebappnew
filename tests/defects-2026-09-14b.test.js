/**
 * The five defects reported from the screenshots on 14 Sep 2026.
 *
 * Every assertion here reads the real module or the real source, never a copy
 * of the rule. Where a test reads source text it matches the ELEMENT, not a
 * bare word, so that a comment explaining the fix cannot satisfy the test that
 * proves the fix.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { planOptionsFor } from "../src/modules/customers/schemePlan";
import { canOpen } from "../src/_shared/moduleAccess";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// A Flexible Digi Gold scheme as the API returns one: an amount that is the
// per-deposit GUIDE, and a purity, which is the only thing enrollment fixes.
const WALLET = {
  id: "sch_flexi",
  name: "FLEXI SAVER PLAN",
  schemeType: "FLEXIBLE_DIGI_GOLD",
  amount: 1000,
  durationMonths: 12,
  goldPurity: "24K",
  tiers: [{ id: "t1", isActive: true, monthlyAmount: 5000, durationMonths: 12 }],
};
const MONTHLY = {
  id: "sch_monthly",
  name: "PREMIUM MONTHLY PLAN",
  schemeType: "MONTHLY",
  amount: 1000,
  durationMonths: 12,
  tiers: [
    { id: "t1", isActive: true, monthlyAmount: 5000, durationMonths: 12 },
    { id: "t2", isActive: true, monthlyAmount: 10000, durationMonths: 12 },
  ],
};

// Fixed Gold Rate is sold on the PURITY: the live rate for the purity chosen on
// the day of enrollment is frozen for the whole term, up or down. The amount is
// the scheme's own, not something the customer picks off a ladder.
const FIXED = {
  id: "sch_fixed",
  name: "FIXED GOLD PLAN",
  schemeType: "FIXED_GOLD_RATE",
  amount: 2000,
  durationMonths: 12,
  goldPurity: "22K",
  tiers: [{ id: "t1", isActive: true, monthlyAmount: 5000, durationMonths: 12 }],
};

describe("only a Monthly plan is sold on an amount", () => {
  // MONTHLY: the tier ladder IS the product, and there is no purity.
  it("offers the ladder on a Monthly plan, base amount included", () => {
    expect(planOptionsFor(MONTHLY).map((o) => o.amount)).toEqual([1000, 5000, 10000]);
  });

  // FLEXIBLE_DIGI_GOLD: a wallet. Rs 500 - Rs 1,00,000 is a RANGE per deposit,
  // not an instalment - app/modules/plan/scheme/schema.py says so in those
  // words and enforces it as a range.
  it("offers no ladder on a Digi Gold wallet", () => {
    expect(planOptionsFor(WALLET)).toEqual([]);
  });

  // FIXED_GOLD_RATE: the purity decides the plan, and its rate that day is
  // locked for the term.
  it("offers no ladder on a Fixed Gold Rate plan", () => {
    expect(planOptionsFor(FIXED)).toEqual([]);
  });

  it("ignores tier rows on both, even when the shop defined some", () => {
    expect(planOptionsFor({ ...WALLET, tiers: MONTHLY.tiers })).toEqual([]);
    expect(planOptionsFor({ ...FIXED, tiers: MONTHLY.tiers })).toEqual([]);
  });

  // Every scheme that predates the type column is a Monthly plan.
  it("treats a scheme with no type as Monthly and keeps its ladder", () => {
    const { schemeType, ...legacy } = MONTHLY;
    expect(planOptionsFor(legacy).map((o) => o.amount)).toEqual([1000, 5000, 10000]);
  });
});

describe("the scheme picker names the scheme and states no terms", () => {
  const src = read("../src/modules/customers/Customers.jsx");
  // It printed `${sc.name} - Rs 1,000.00/mo - 12 installments` for every
  // scheme in Add Customer, including a wallet, which has no monthly amount
  // and no instalment count to state.
  it("Add Customer labels each scheme with its name alone", () => {
    expect(src).toMatch(/schemeList\.map\(\(sc\) => \(\{ value: sc\.id, label: sc\.name \}\)\)/);
    expect(src).not.toMatch(/label: `\$\{sc\.name\}[^`]*\/mo/);
  });

  it("changing the scheme clears the previous scheme's tier and purity", () => {
    expect(src).toMatch(/schemeId: v, schemeTierId: "", goldPurity: ""/);
  });

  it("says why there is no amount field instead of leaving a gap", () => {
    expect(src).toMatch(/addPlanOptions\.length === 0 && noAmountNote\(addScheme\)/);
    expect(src).toMatch(/planOptions\.length === 0 && noAmountNote\(enrollScheme\)/);
  });

  it("the explainer says the right thing for each of the two", () => {
    expect(src).toMatch(/this is a wallet/);
    expect(src).toMatch(/frozen for the whole term/);
  });

  it("Add Customer states the locked rate once a purity is chosen", () => {
    expect(src).toMatch(/is locked for the whole term\. Every contribution buys gold at this rate/);
  });
});

describe("a staff member is offered only what was granted", () => {
  const RAM = ["enrollments", "billing_inventory"];
  it("Master Inventory needs its own grant", () => {
    expect(canOpen("master-inventory", "Staff", RAM)).toBe(false);
    expect(canOpen("master-inventory", "Staff", [...RAM, "master_inventory"])).toBe(true);
  });
  it("Purchase History opens for no staff grant, because its routes are require_admin", () => {
    expect(canOpen("vendors", "Staff", ["billing", "billing_inventory", "master_inventory"])).toBe(false);
    expect(canOpen("vendors", "Admin", [])).toBe(true);
  });
});

describe("the live rate reaches every staff account", () => {
  const app = read("../src/App.jsx");
  // The strip fell back to the rate HISTORY, which is still gated behind the
  // gold_rate module - so a staff member without that module got a 403 and the
  // header sat at "-/g", the shop looking like it has no price.
  it("falls back through carry_forward, not through the gated history", () => {
    expect(app).toMatch(/getTodayRate\(\{ carryForward: true \}\)/);
    expect(app).not.toMatch(/getLastPublishedRate\(\)/);
  });
  it("still decides isToday from the rate's own effective date", () => {
    expect(app).toMatch(/isToday: last\.effective_date === istToday\(\)/);
  });
});

describe("a staff member can be removed", () => {
  const svc = read("../src/modules/staff/staffService.js");
  const ui = read("../src/modules/staff/StaffUsers.jsx");
  it("the service calls DELETE on the staff endpoint", () => {
    expect(svc).toMatch(/apiClient\.delete\(`\/admin\/staff\/\$\{id\}`/);
  });
  it("removal is armed before it is done", () => {
    expect(ui).toMatch(/onClick=\{\(\) => setConfirmRemove\(true\)\}/);
    expect(ui).toMatch(/onClick=\{handleRemove\}/);
  });
  it("opening another staff member never arrives with removal armed", () => {
    expect(ui).toMatch(/setManaging\(u\);\r?\n\s*\/\/[^\n]*\r?\n\s*setConfirmRemove\(false\);/);
  });
});
