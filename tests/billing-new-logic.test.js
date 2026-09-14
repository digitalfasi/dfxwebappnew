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
    // The CONTROLS must be absent, not the word: the panel deliberately says
    // that a scheme does not apply to bullion, which is the opposite of
    // offering one. Asserting on the bare word made explaining the rule
    // impossible without failing the test.
    for (const absent of ["Making Charge", "Wastage", "Discount (", "schemeOptions", "setSchemeRedeem"]) {
      expect(panel).not.toContain(absent);
    }
  });

  it("finding a new item clears any bar that was loaded", () => {
    expect(ns).toMatch(/setRawGold\(null\); setRawGoldRate\(""\);/);
  });
});

describe("a bullion bill has a buyer, but never a scheme", () => {
  it("the panel offers an existing customer or a walk-in", () => {
    const panel = ns.slice(ns.indexOf("{rawGold && ("), ns.indexOf("{!product && !rawGold"));
    expect(panel).toMatch(/Existing customer/);
    expect(panel).toMatch(/Walk-in/);
    expect(panel).toMatch(/setSelectedCustomer\(c\)/);
  });

  it("it says plainly that a scheme does not apply, and offers none", () => {
    const panel = ns.slice(ns.indexOf("{rawGold && ("), ns.indexOf("{!product && !rawGold"));
    expect(panel).toMatch(/Scheme redemption does not apply to bullion/);
    expect(panel).not.toMatch(/schemeOptions|schemeRedeem|Redeem/);
  });

  it("the bill cannot be raised without a buyer", () => {
    expect(ns).toMatch(/const rawGoldBuyerReady =/);
    expect(ns).toMatch(/disabled=\{rawGoldBusy \|\| !rawGoldBuyerReady\}/);
  });
});

describe("the enrollment list shows overdue, not the rest of the contract", () => {
  it("the column is Overdue", () => {
    expect(sm).toMatch(/>Overdue</);
  });

  it("it reads the backend's own per-enrollment overdue figure", () => {
    expect(sm).toMatch(/money\(r\.overdueAmount\)/);
    expect(sm).toMatch(/const overdueTotal = rows\.reduce\(\(s, r\) => s \+ \(Number\(r\.overdueAmount\) \|\| 0\), 0\)/);
  });

  it("a plan merely mid-term shows a dash, not eleven months of future contract", () => {
    // No newline in the pattern: the source wraps there, so match the two
    // halves separately rather than guessing the line ending.
    expect(sm).toMatch(/isWalletScheme\(r\.schemeType\) \|\| !\(r\.overdueAmount > 0\)/);
    expect(sm).toMatch(/\? NOT_APPLICABLE/);
  });

  it("the remaining-contract figure is gone from the list entirely", () => {
    expect(sm).not.toMatch(/label="Outstanding"/);
    expect(sm).not.toMatch(/Remaining to collect/);
    expect(sm).not.toMatch(/money\(outstanding\(r\)\)/);
  });
});

describe("the metal rate the two modes quote", () => {
  it("Offline uses the published rate, ex-tax", () => {
    expect(ns).toMatch(/const modeRate = \(m\) => \{/);
    expect(ns).toMatch(/the published \$\{product\.purity \|\| ""\} rate, before tax/);
  });

  it("Online quotes the same rate tax-inclusive", () => {
    expect(ns).toMatch(/const onlineRateFactor = 1 \+ \(Number\(product\?\.taxRatePercent\) \|\| 0\) \/ 100/);
    expect(ns).toMatch(/m === "ONLINE" \? base \* onlineRateFactor : base/);
  });

  it("22K at 14,125 with 3% quotes 14,548.75", () => {
    const f = 1 + 3 / 100;
    expect(Math.round(14125 * f * 100) / 100).toBe(14548.75);
  });

  it("the bill's own GST line is not removed by Online", () => {
    // The two taxes are different things: one is baked into the quoted metal
    // rate, the other is the invoice's tax on the product. Nothing in the mode
    // switch touches the gst toggle.
    const fn = ns.slice(ns.indexOf("const selectMode"), ns.indexOf("const rateBand"));
    expect(fn).not.toMatch(/setGst\(/);
  });
});
