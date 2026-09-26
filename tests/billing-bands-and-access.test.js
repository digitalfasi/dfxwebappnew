/**
 * The shop's running cost is its own to set, and its pricing defaults are not
 * for staff to see.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const svc = read("../src/modules/billing/billingService.js");
const inv = read("../src/modules/procurement/inventory/Inventory.jsx");
const ps = read("../src/modules/billing/pricing-settings/PricingSettings.jsx");
const access = read("../src/_shared/moduleAccess.js");

describe("running cost is a field the shop owns", () => {
  it("is read off the store defaults", () => {
    expect(svc).toMatch(/runningCost: d\.running_cost_percent \?\? ""/);
  });
  it("is sent back, and blank means 'use the default' rather than zero", () => {
    expect(svc).toMatch(/running_cost_percent: f\.runningCost !== "" && f\.runningCost != null \? Number\(f\.runningCost\) : null/);
  });
  it("Store Defaults offers it, and says what it is for", () => {
    expect(ps).toMatch(/label="Running cost"/);
    expect(ps).toMatch(/Rent, wages, power\./);
  });
});

describe("store pricing defaults are Admin-only on screen, as they are on the server", () => {
  it("Store Defaults is an Admin-only page", () => {
    expect(access).toMatch(/"store-defaults": ADMIN_ONLY,/);
  });
  it("Inventory no longer carries the pricing dialog", () => {
    expect(inv).not.toMatch(/onClick=\{openDefaults\}/);
  });
});

describe("raw gold is visible where it was bought", () => {
  const svc = readFileSync(new URL("../src/modules/billing/billingService.js", import.meta.url), "utf8");

  it("the service reads the endpoint that returns it", () => {
    expect(svc).toMatch(/apiClient\.get\(`\/billing\/inventory\/raw-gold/);
  });

  // Scoped to listRawGold's own body: the file also maps hallmarked pieces,
  // which legitimately carry a HUID, so asking this of the whole file asks the
  // wrong question.
  it("a bar is keyed by serial number, not HUID", () => {
    const body = svc.slice(svc.indexOf("async listRawGold"), svc.indexOf("listVendors"));
    expect(body).toMatch(/serialNumber: r\.serial_number/);
    expect(body).not.toMatch(/huid/i);
  });

  it("Inventory renders it, and a failure there cannot blank the jewellery table", () => {
    expect(inv).toMatch(/Raw gold &amp; bullion/);
    expect(inv).toMatch(/listRawGold\(\)\.then\(setRawGold\)\.catch\(\(\) => setRawGold\(\[\]\)\)/);
  });

  it("the section is absent rather than empty when the shop holds no bars", () => {
    expect(inv).toMatch(/\{filteredRawGold\.length > 0 && \(/);
  });
});
