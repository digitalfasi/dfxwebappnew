/**
 * A list of money must never be shortened in silence.
 *
 * New Sale loaded each enrollment's redeemable balance with
 * `.catch(() => null)` and then filtered on `b && b.can_redeem && ...`. A
 * balance that could not be READ and a scheme with nothing in it collapsed into
 * the same filter, so one transient failure removed a scheme from the redeem
 * list with no indication. The counter raised the bill without the credit and
 * the customer paid money they had already paid.
 *
 * Worse, the empty state then said "No redeemable schemes for this customer" -
 * asserting a fact about their money that had not been established.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/modules/billing/new-sale/NewSale.jsx"), "utf8");

// Mirrors loadSchemes: balances[] may contain nulls for calls that failed.
const countFailures = (balances) => balances.filter((b) => b == null).length;
const buildOptions = (balances) =>
  balances.filter((b) => b && b.can_redeem && (b.available_balance || 0) > 0);

const OK = { enrollment_id: "e1", scheme_name: "Gold Plan", can_redeem: true, available_balance: 40000 };
const EMPTY = { enrollment_id: "e2", scheme_name: "Spent", can_redeem: true, available_balance: 0 };

describe("scheme balance loading", () => {
  it("counts a failed balance call", () => {
    expect(countFailures([OK, null, EMPTY])).toBe(1);
  });

  it("does not confuse a failure with a scheme that has nothing in it", () => {
    // Both are dropped from the options list - which is correct - but only one
    // of them means "we could not find out".
    expect(buildOptions([OK, null, EMPTY])).toHaveLength(1);
    expect(countFailures([OK, EMPTY])).toBe(0);
    expect(countFailures([OK, null])).toBe(1);
  });

  it("tracks the count in component state", () => {
    expect(src).toMatch(/const \[schemeLoadFailures, setSchemeLoadFailures\] = useState\(0\)/);
    expect(src).toMatch(/setSchemeLoadFailures\(balances\.filter\(\(b\) => b == null\)\.length\)/);
  });

  it("warns, naming the number, and tells the user to refresh before billing", () => {
    expect(src).toMatch(/could not be loaded/);
    expect(src).toMatch(/Refresh before billing/);
    expect(src).toMatch(/schemeLoadFailures !== 0/);
  });

  it("does not claim the customer has no schemes when the lookup failed", () => {
    expect(src).toMatch(/schemeOptions\.length === 0 && schemeLoadFailures === 0/);
  });

  it("treats a total enrollment-list failure as unknown, not as none", () => {
    expect(src).toMatch(/setSchemeLoadFailures\(-1\)/);
  });

  it("still lists every scheme that did load", () => {
    expect(buildOptions([OK, null])).toEqual([OK]);
  });
});
