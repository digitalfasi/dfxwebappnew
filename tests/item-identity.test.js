/**
 * Phase 3 (5.13 / 5.17): a piece carries an Item Code XOR a HUID, and that
 * identifier - not the cashier - decides the bill mode.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ns = read("../src/modules/billing/new-sale/NewSale.jsx");
const inv = read("../src/modules/procurement/inventory/Inventory.jsx");
const svc = read("../src/modules/billing/billingService.js");

describe("purchase: HUID optional, Item Code auto", () => {
  it("HUID is no longer required on Add Purchase", () => {
    expect(inv).not.toMatch(/toast\("HUID is required"\)/);
  });
  it("a HUID is never used alongside an Item Code", () => {
    expect(inv).toMatch(/productCode: f\.huid\.trim\(\) \? undefined :/);
    expect(inv).toMatch(/itemCode: r\.ident\.trim\(\) \? undefined :/);
    expect(svc).toMatch(/product_code: r\.huid \? null : \(r\.itemCode \|\| null\)/);
  });
  it("only raw gold still requires its identifier on bulk rows", () => {
    expect(inv).toMatch(/bulkType === "RAW_GOLD" && !r\.ident\.trim\(\)/);
  });
});

describe("sale: the piece decides the mode", () => {
  it("HUID = ONLINE, Item Code = OFFLINE, set on lookup", () => {
    expect(ns).toMatch(/const mode = \(q\.huid \|\| ""\)\.trim\(\) \? "ONLINE" : "OFFLINE";/);
  });
  it("there is no manual mode picker or switch", () => {
    expect(ns).not.toMatch(/Choose payment mode/);
    expect(ns).not.toMatch(/Switch to \{saleMode/);
  });
});
