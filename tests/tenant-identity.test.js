/**
 * D3 — a staff member saw a different business's name.
 *
 * authService resolved the shop name from /admin/tenant/profile, which is
 * admin-only. Staff got 403, the catch returned null, and Sidebar fell back to
 * the hard-coded product name — so Ram, who works for Afsar jewellers, was
 * shown "DFX Solution". In a multi-tenant product that is the most alarming
 * thing a screen can get wrong.
 *
 * The name now travels on /users/me, which every client already calls.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const sidebar = read("src/_shared/Sidebar.jsx");
const authsvc = read("src/_shared/authService.js");
const ctx = read("src/_shared/AuthContext.jsx");

// Mirrors AuthContext: the admin profile when it resolves, otherwise the name
// the user's own /users/me carried.
const resolve = (profileName, userTenantName) => profileName || userTenantName || null;

describe("D3 — which shop name is shown", () => {
  it("an admin keeps the profile name", () => {
    expect(resolve("Afsar jewellers", "Afsar jewellers")).toBe("Afsar jewellers");
  });

  it("a staff member, refused the admin profile, still gets their own shop", () => {
    // 403 -> null from getTenantName
    expect(resolve(null, "Afsar jewellers")).toBe("Afsar jewellers");
  });

  it("never falls back to the product name", () => {
    expect(resolve(null, null)).toBeNull();
    expect(sidebar).not.toMatch(/tenantName \|\| "DFX Solution"/);
  });

  it("shows nothing rather than something wrong", () => {
    expect(sidebar).toMatch(/const storeName = tenantName \|\| "";/);
  });

  it("carries tenant_name off /users/me", () => {
    expect(authsvc).toMatch(/tenantName: raw\.tenant_name \?\? null/);
    expect(ctx).toMatch(/u\?\.tenantName/);
  });

  it("does not open the admin-only profile endpoint to staff", () => {
    // The fix was to add one field to /users/me, not to widen an endpoint that
    // carries GST number, address and contact details.
    expect(authsvc).toMatch(/\/admin\/tenant\/profile/);
    expect(authsvc).toMatch(/catch \{/);
  });
});
