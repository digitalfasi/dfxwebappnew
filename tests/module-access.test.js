/**
 * D2 — a staff member saw every module in the product.
 *
 * The frontend did no permission gating at all: NAV_SECTIONS rendered
 * unconditionally, so Ram — granted `enrollments,billing_inventory` — was
 * offered Customers, Billing, Payments, Catalogue Studio, Marketing, Reports,
 * Branches, Staff Users, Support and Settings. Clicking any of them called an
 * API that correctly refused him and painted a red error.
 *
 * This is a convenience and clarity layer, NOT a security boundary. The server
 * already refuses correctly and these tests must never be read as proof that a
 * user is kept out of anything — only that the screen stops offering work the
 * server will reject.
 */
import { describe, it, expect } from "vitest";
import { canOpen, landingPage, PAGE_MODULE, ADMIN_ONLY, expandPermissions } from "../src/_shared/moduleAccess";

// Ram, exactly as the database has him.
const RAM = ["enrollments", "billing_inventory"];

describe("D2 — what a staff member may open", () => {
  it("opens the two modules he was granted, and only those", () => {
    expect(canOpen("scheme-management", "Staff", RAM)).toBe(true);
    expect(canOpen("inventory", "Staff", RAM)).toBe(true);
  });

  // Ram holds enrollments + billing_inventory - Enrollment Management and
  // Inventory. He was still shown Master Inventory and Purchase History,
  // because all three Procurement pages were mapped to the single
  // billing_inventory key. Purchase History is the vendor ledger and its
  // routes are require_admin, so it could only ever answer him with the red
  // "Admin or SuperAdmin privileges required" in the screenshot. Master
  // Inventory is the product master, a different job from counting stock, and
  // now has its own grant (constants.py: STAFF_MODULE_MASTER_INVENTORY).
  it("does not offer the two Procurement pages he was never granted", () => {
    expect(canOpen("master-inventory", "Staff", RAM)).toBe(false);
    expect(canOpen("vendors", "Staff", RAM)).toBe(false);
  });

  it("opens Master Inventory once that grant is actually made", () => {
    expect(canOpen("master-inventory", "Staff", [...RAM, "master_inventory"])).toBe(true);
  });

  // Purchase History answers to no module key at all. No grant opens it.
  it("never opens Purchase History for any staff grant", () => {
    expect(canOpen("vendors", "Staff", ["billing", "master_inventory", "billing_inventory"])).toBe(false);
  });

  it("opens none of the ten he was offered before", () => {
    for (const page of ["customers", "new-sale", "sales-history", "payments",
                        "catalogue", "marketing", "reports", "branches",
                        "staff-users", "support", "settings"]) {
      expect(canOpen(page, "Staff", RAM)).toBe(false);
    }
  });

  it("an Admin still opens everything", () => {
    for (const page of Object.keys(PAGE_MODULE)) {
      expect(canOpen(page, "Admin", [])).toBe(true);
      expect(canOpen(page, "SuperAdmin", [])).toBe(true);
    }
  });

  it("admin-only pages stay shut for staff however they are granted", () => {
    const everything = Object.values(PAGE_MODULE).filter((m) => m !== ADMIN_ONLY);
    for (const [page, mod] of Object.entries(PAGE_MODULE)) {
      if (mod === ADMIN_ONLY) expect(canOpen(page, "Staff", everything)).toBe(false);
    }
  });

  it("a page with no mapping is not opened by accident", () => {
    expect(canOpen("some-future-page", "Staff", RAM)).toBe(false);
  });

  it("a legacy 'billing' grant still expands to the three areas", () => {
    // Mirrors require_admin_or_staff_module server-side.
    const set = expandPermissions(["billing"]);
    expect(set.has("billing_inventory")).toBe(true);
    expect(set.has("billing_new_sale")).toBe(true);
    expect(set.has("billing_sales_history")).toBe(true);
    expect(canOpen("new-sale", "Staff", ["billing"])).toBe(true);
  });
});

describe("D2 — where a staff member lands", () => {
  it("lands on the first page he can actually open, not a refusal", () => {
    const order = ["dashboard", "gold-rate", "customers", "schemes", "scheme-management", "inventory"];
    expect(landingPage("Staff", RAM, order)).toBe("scheme-management");
  });

  it("lands on the dashboard when analytics is granted", () => {
    expect(landingPage("Staff", ["analytics"], ["dashboard", "customers"])).toBe("dashboard");
  });

  it("an admin lands on the dashboard", () => {
    expect(landingPage("Admin", [], ["dashboard"])).toBe("dashboard");
  });

  it("returns null when nothing at all is granted, rather than guessing", () => {
    expect(landingPage("Staff", [], ["dashboard", "customers"])).toBeNull();
  });
});
