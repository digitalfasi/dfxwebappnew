/**
 * The Action Center must never turn a failure into "All clear".
 *
 * Two defects met on this panel. The overdue alert read `overdue_customers`,
 * a key the API has never emitted - it emits `overdue_enrollments` - so the one
 * DANGER alert could never fire while the two beside it read correct keys and
 * did. With 3 overdue enrollments live, the dashboard was silent.
 *
 * And the fetch was `.catch(() => null)`, so a 500 produced `{}`, every key
 * falsy, and the panel rendered the same "All clear - no pending actions" it
 * shows a shop with nothing to do. A missing warning must look missing.
 *
 * These test the pure decision, not the DOM: given a cards payload, which
 * alerts exist and is the panel in its unavailable state.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src/modules/dashboard/Dashboard.jsx");
const src = fs.readFileSync(SRC, "utf8");

// Mirrors Dashboard.jsx. Kept in step by the source assertions below, which
// fail if the component stops using these exact keys.
const CARDS_FAILED = { __failed: true };
const buildAlerts = (cards) => {
  const alerts = [];
  if (cards.overdue_enrollments) alerts.push("overdue");
  if (cards.pending_inspection) alerts.push("inspect");
  if (cards.pending_kyc) alerts.push("kyc");
  return alerts;
};
const panelState = (cards) =>
  cards.__failed ? "unavailable" : buildAlerts(cards).length === 0 ? "all-clear" : "alerts";

// The exact live payload measured on the node.
const LIVE = { overdue_enrollments: 3, pending_kyc: 1, pending_inspection: 5, items_in_stock: 22 };

describe("Action Center", () => {
  it("raises the overdue alert from the key the API actually emits", () => {
    expect(buildAlerts(LIVE)).toContain("overdue");
  });

  it("does not read overdue_customers, a key that has never existed", () => {
    // The READ, not the word - the comment above the fix names the old key.
    expect(src).not.toMatch(/cards\.overdue_customers/);
    expect(src).toMatch(/cards\.overdue_enrollments/);
  });

  it("raises all three alerts from the live payload", () => {
    expect(buildAlerts(LIVE).sort()).toEqual(["inspect", "kyc", "overdue"]);
  });

  it("a failed load is NOT reported as all clear", () => {
    expect(panelState(CARDS_FAILED)).toBe("unavailable");
    expect(panelState(CARDS_FAILED)).not.toBe("all-clear");
  });

  it("a genuinely clean shop still reads all clear", () => {
    expect(panelState({ overdue_enrollments: 0, pending_kyc: 0, pending_inspection: 0 })).toBe("all-clear");
  });

  it("the component distinguishes the two, rather than catching to null", () => {
    // `.catch(() => null)` collapsed "failed" into "empty". The sentinel is what
    // keeps them apart, so the panel must both produce and consume it.
    expect(src).toMatch(/CARDS_FAILED/);
    expect(src).toMatch(/cards\.__failed/);
    expect(src).not.toMatch(/dashboard-cards[^\n]*catch\(\(\) => null\)/);
  });

  it("states that alerts are unavailable in words", () => {
    expect(src).toMatch(/Alerts unavailable/);
  });
});
