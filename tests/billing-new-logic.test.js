/**
 * The new making-charge logic on screen, and the concession made readable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ns = read("../src/modules/billing/new-sale/NewSale.jsx");
const svc = read("../src/modules/billing/billingService.js");
const inv = read("../src/modules/procurement/inventory/Inventory.jsx");
const sm = read("../src/modules/plan/enrollment/SchemeManagement.jsx");

describe("the making charge is this lot's, not a hard-coded 14", () => {
  it("the bands reach the screen", () => {
    expect(svc).toMatch(/makingBands: data\.making_bands/);
    expect(svc).toMatch(/listPercent: data\.making_bands\.list_percent/);
  });
  it("the field seeds from them, falling back only when they are absent", () => {
    expect(ns).toMatch(/q\.makingBands\?\.listPercent != null \? String\(round2\(q\.makingBands\.listPercent\)\)/);
  });
  it("a FIXED charge is never seeded with a percentage", () => {
    expect(ns).toMatch(/\(q\.makingChargeType \|\| "PERCENTAGE"\) !== "PERCENTAGE" \? ""/);
  });
});

describe("one concession, two editors", () => {
  it("the discount box mirrors the concession while the price box drives", () => {
    expect(ns).toMatch(/value=\{priceDriver === "PRICE" \? \(comeDown \? String\(round2\(comeDown \/ taxFactor\)\) : ""\) : discount\}/);
  });
  it("it is read-only then, because the number is derived and not entered", () => {
    expect(ns).toMatch(/readOnly=\{priceDriver === "PRICE"\}/);
  });
  it("the pre-GST figure is stated, since a discount comes off the taxable value", () => {
    expect(ns).toMatch(/which is \{money\(round2\(comeDown \/ taxFactor\)\)\} before GST/);
  });
});

describe("gold is gold, wherever it sits", () => {
  it("the inventory total counts bullion as well as jewellery", () => {
    expect(inv).toMatch(/rawGoldInStock\.reduce\(\(s,r\)=>s\+\(Number\(r\.netGoldWeightGrams\)\|\|0\),0\)/);
  });
  it("the purity composition counts it too", () => {
    expect(inv).toMatch(/rawGoldInStock\.forEach\(\(r\) => \{/);
    expect(inv).toMatch(/Raw gold & bullion\|\$\{r\.purity\}/);
  });
});

describe("a wallet enrollment is not counted in installments", () => {
  it("the Paid column shows what the wallet holds", () => {
    expect(sm).toMatch(/isWalletScheme\(r\.schemeType\)\r?\n\s*\? <span className="font-bold">\{money\(r\.totalPaid\)\}/);
  });
});

describe("a bar sells as a bar, in the same search box", () => {
  it("the service has both halves of the raw-gold path", () => {
    expect(svc).toMatch(/async getRawGoldQuote\(serialNumber/);
    expect(svc).toMatch(/apiClient\.post\("\/billing\/sell\/raw-gold"/);
  });

  it("the sale body carries no charge a bar does not have", () => {
    const body = svc.slice(svc.indexOf("async sellRawGold"), svc.indexOf("listVendors"));
    for (const absent of ["making_charge", "wastage", "discount", "stone_charge", "scheme"]) {
      expect(body).not.toContain(absent);
    }
  });

  it("a serial scanned in the HUID box switches the screen to raw gold", () => {
    expect(ns).toMatch(/err\?\.status === 409 && \/raw gold\/i\.test/);
    expect(ns).toMatch(/billingService\.getRawGoldQuote\(key\)/);
  });

  it("the panel prices metal and GST and nothing else", () => {
    const panel = ns.slice(ns.indexOf("{rawGold && ("), ns.indexOf("{!product && !rawGold"));
    expect(panel).toMatch(/Gold value/);
    expect(panel).toMatch(/GST \{rawGold\.taxRatePercent\}%/);
    expect(panel).toMatch(/Bill total/);
    for (const absent of ["Making Charge", "Wastage", "Discount", "scheme", "Scheme"]) {
      expect(panel).not.toContain(absent);
    }
  });

  it("finding a new item clears any bar that was loaded", () => {
    expect(ns).toMatch(/setRawGold\(null\); setRawGoldRate\(""\);/);
  });
});
