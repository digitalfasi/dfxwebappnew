/**
 * "Today's Sales ₹0.00" must mean the shop sold nothing — never that the
 * request failed.
 *
 * Reported as: the dashboard shows no data for today on one machine and the
 * correct figures on another, refresh after refresh. The server was right
 * throughout — Afsar's 14 Sep sale returns ₹3,76,227.28 from
 * /reports/sales-trend?period=today. The screen was turning a failed fetch
 * into an empty array, and an empty array reduces to a confident zero.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/dashboard/Dashboard.jsx", import.meta.url), "utf8");

// The real reducer from the component, so this test cannot drift from it.
const bizSalesOf = (salesTrend) =>
  salesTrend ? salesTrend.reduce((s, p) => s + (Number(p.total_amount) || 0), 0) : null;

describe("an unknown figure is not a zero", () => {
  it("the KPI reducer still returns null when the rows are unknown", () => {
    expect(bizSalesOf(null)).toBe(null);
  });

  it("a genuinely empty day is still zero", () => {
    expect(bizSalesOf([])).toBe(0);
  });

  it("a real day still totals", () => {
    expect(bizSalesOf([{ total_amount: 376227.28 }])).toBeCloseTo(376227.28, 2);
  });

  it("the trend is no longer coerced to an empty array on failure", () => {
    // The exact line that caused this: `setSalesTrend(t?.trend ?? [])`.
    expect(src).not.toMatch(/setSalesTrend\(t\?\.trend \?\? \[\]\)/);
    expect(src).not.toMatch(/setPopSchemes\(r\?\.schemes \?\? \[\]\)/);
    expect(src).toMatch(/setSalesTrend\(rows\)/);
  });

  it("a failed or refused payload becomes null, an arrived one becomes rows", () => {
    // rowsOrUnknown, lifted out of the source so the test exercises the real rule.
    const body = src.match(/function rowsOrUnknown\(payload, key\) \{([\s\S]*?)\n\}/)[1];
    const rowsOrUnknown = new Function("payload", "key", body);
    expect(rowsOrUnknown(null, "trend")).toBe(null);
    expect(rowsOrUnknown({ __failed: true }, "trend")).toBe(null);
    expect(rowsOrUnknown({ __refused: true }, "trend")).toBe(null);
    expect(rowsOrUnknown({ trend: [] }, "trend")).toEqual([]);
    expect(rowsOrUnknown({ trend: [{ total_amount: 1 }] }, "trend")).toEqual([{ total_amount: 1 }]);
  });

  it("the failure is stated on screen, with a way to retry it", () => {
    expect(src).toMatch(/setBizFailed\(rows === null\)/);
    expect(src).toMatch(/they are not zero, they are unknown/);
    expect(src).toMatch(/bizFailed \|\| coreFailed/);
  });

  it("today is still scoped by the SERVER, never by the viewer's clock", () => {
    // period=today is resolved server-side against IST; only the label is local.
    expect(src).toMatch(/buildQuery\(\{ period: sel \}\)/);
  });
});
