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
    // Seeding 16 into a rupees field would bill sixteen rupees of making.
    // Both halves of the guard, without tying the test to how it wraps.
    expect(ns).toMatch(/\(q\.makingChargeType \|\| "PERCENTAGE"\) !== "PERCENTAGE"/);
    expect(ns).toMatch(/\? \(q\.makingChargeValue != null \? String\(q\.makingChargeValue\) : ""\)/);
  });
  it("the shop's rule outranks the number frozen on the piece", () => {
    // HU8879 carried an old 11% and that 11 was winning over base + running +
    // tunch, which is how a live bill opened sitting on its own break-even.
    const seed = ns.slice(ns.indexOf("setMakingVal("), ns.indexOf("setWastageVal("));
    const bands = seed.indexOf("makingBands?.listPercent");
    // lastIndexOf, not indexOf: the same expression is also the FIXED-charge
    // branch above. What matters is the order inside the PERCENTAGE path.
    const frozen = seed.lastIndexOf("q.makingChargeValue != null ? String(q.makingChargeValue)");
    expect(bands).toBeGreaterThan(-1);
    expect(frozen).toBeGreaterThan(bands);
  });
});

describe("one concession, three boxes that agree", () => {
  // Three stages of the same mistake. First two money models (a typed price
  // solved the making charge down with no discount line; a typed discount left
  // the charge alone and added one) - the two halves of the screen described
  // different bills. Then one model but two numbers: the charge and a separate
  // discount, which together could overshoot the floor, get the quote refused,
  // and leave a 1% making charge printed beside the rupees for 14% - and a
  // "Max discount" that went NEGATIVE. Now one number.
  it("there is no second driver left", () => {
    expect(ns).not.toMatch(/priceDriver/);
    expect(ns).not.toMatch(/customerPrice:/);
  });

  it("the making charge is the only state; the other two are derived", () => {
    // No useState for the discount - only a buffer for what is being typed.
    expect(ns).not.toMatch(/const \[discount, setDiscount\]/);
    expect(ns).toMatch(/const \[discountText, setDiscountText\] = useState\(null\);/);
    expect(ns).toMatch(/const concession = product \? Math\.max\(0, pctToRupees\(listPct - agreedPct\)\) : 0;/);
  });

  it("the concession is never sent twice", () => {
    // It is inside makingChargeValue already; a discount line as well would
    // take it off the bill a second time.
    expect(ns).toMatch(/discountAmount: 0,/);
    expect(ns).not.toMatch(/discountAmount: discountNum/);
    expect(ns).not.toMatch(/customerPrice: .*toBillTotal/);
  });

  it("each of the three boxes writes that one number", () => {
    expect(ns).toMatch(/const onMakingInput = \(v\) => \{ setMakingVal\(v\);/);
    expect(ns).toMatch(/const onDiscountInput = \(v\) => \{/);
    expect(ns).toMatch(/setAgreedPct\(v === "" \? listPct : listPct - rupeesToPct\(num\(v\)\)\);/);
    expect(ns).toMatch(/const onCustomerPriceInput = \(v\) => \{/);
    expect(ns).toMatch(/setAgreedPct\(listPct - rupeesToPct\(off\)\);/);
  });

  it("all three inputs are bound to it", () => {
    expect(ns).toMatch(/onChange=\{\(e\) => onMakingInput\(e\.target\.value\)\}/);
    expect(ns).toMatch(/onChange=\{\(e\) => onDiscountInput\(e\.target\.value\)\}/);
    expect(ns).toMatch(/onValueChange=\{onCustomerPriceInput\}/);
  });

  it("the making charge field is the admin's and nothing writes back to it", () => {
    // An effect used to mirror the backend's solved value in after every quote,
    // which snapped the number back the instant it was typed.
    expect(ns).not.toMatch(/setMakingVal\(\(prev\)/);
  });

  it("the headroom can never go negative", () => {
    expect(ns).toMatch(/\? Math\.max\(0, round2\(askingPretax - minSafe \/ taxFactor\)\)/);
    expect(ns).toMatch(/: Math\.max\(0, pctToRupees\(listPct - profitFloorPct\)\);/);
  });

  it("the asking price is the bill at LIST, built from the backend's figures", () => {
    expect(ns).toMatch(/const askingPretax = product/);
    expect(ns).toMatch(/\(product\.subtotalBeforeTax \|\| 0\) - \(product\.makingChargeAmount \|\| 0\) \+ pctToRupees\(listPct\)/);
    // and the come-down is measured from THAT, not from the current price
    expect(ns).toMatch(/Come down from \{money\(askingPrice\)\}/);
  });

  it("selling price is what the bill comes to", () => {
    expect(ns).toMatch(/const sellingPrice = product \? round2\(product\.finalAmount \|\| 0\) : 0;/);
  });
});

describe("Online actually charges the tax-inclusive rate", () => {
  it("both modes send the rate they display", () => {
    // ONLINE used to send nothing, so the field read Rs 14,548.75 while the
    // bill still charged 14 g x Rs 14,125 - the mode was decoration.
    expect(ns).toMatch(/appliedRatePerGram: rate !== "" && !rateOutOfBand \? num\(rate\) : undefined,/);
  });
  it("the tax is applied to the published rate, never to an already-taxed one", () => {
    expect(ns).toMatch(/const modeRate = \(m\) => \{/);
    expect(ns).toMatch(/const base = publishedRate;/);
  });
});

describe("the tunch a piece was bought at is visible in stock", () => {
  it("the service carries it, and null stays null", () => {
    expect(svc).toMatch(/tunch: raw\.tunch_percent \?\? null,/);
    expect(svc).toMatch(/tunch: r\.tunch_percent \?\? null,/);
  });
  it("both tables have the column, and an unrecorded tunch is a dash not 0%", () => {
    expect(inv).toMatch(/<th className="px-3 py-3 text-right">Tunch<\/th>/);
    expect(inv).toMatch(/<th className="px-4 py-2.5 text-right">Tunch<\/th>/);
    expect(inv).toMatch(/\{p\.tunch != null \? `\$\{p\.tunch\}%` : "—"\}/);
    expect(inv).toMatch(/\{r\.tunch != null \? `\$\{r\.tunch\}%` : "—"\}/);
  });
  it("the store default making value is the shop's 6%, not a saved blank 0", () => {
    expect(svc).toMatch(/makingValue: d\.making_charge_value \? d\.making_charge_value : 6,/);
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
    const panel = ns.slice(ns.indexOf("{rawGold && ("), ns.indexOf("Placeholder for the pinned summary"));
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
    const panel = ns.slice(ns.indexOf("{rawGold && ("), ns.indexOf("Placeholder for the pinned summary"));
    expect(panel).toMatch(/Existing customer/);
    expect(panel).toMatch(/Walk-in/);
    expect(panel).toMatch(/setSelectedCustomer\(c\)/);
  });

  it("it says plainly that a scheme does not apply, and offers none", () => {
    const panel = ns.slice(ns.indexOf("{rawGold && ("), ns.indexOf("Placeholder for the pinned summary"));
    expect(panel).toMatch(/Scheme redemption does not apply to bullion/);
    expect(panel).not.toMatch(/schemeOptions|schemeRedeem|Redeem/);
  });

  it("the bill cannot be raised without a buyer", () => {
    expect(ns).toMatch(/const rawGoldBuyerReady =/);
    expect(ns).toMatch(/disabled=\{rawGoldBusy \|\| !rawGoldBuyerReady \|\| !rawGoldStatus \|\| rawGoldPartialInvalid\}/);
  });

  it("a bar is settled in the same three words as a jewellery bill", () => {
    // It was a bare "Amount collected - leave 0 to bill it as outstanding",
    // which left the counter to translate their intent into a number.
    expect(ns).toMatch(/const \[rawGoldStatus, setRawGoldStatus\] = useState\(""\);/);
    expect(ns).toMatch(/options=\{PAYMENT_STATUSES\.map\(\(v\) => \(\{ value: v, label: PAYMENT_STATUS_LABEL\[v\] \}\)\)\}/);
    // and what is collected FOLLOWS from the status, never typed beside it
    expect(ns).toMatch(/rawGoldStatus === "PAID" \? rawGoldTotal : rawGoldStatus === "PARTIAL" \? rawGoldPaidNum : 0;/);
    expect(ns).toMatch(/amountPaid: rawGoldPaidNow,/);
  });

  it("the bar's summary fills the right column instead of leaving it blank", () => {
    // The whole short trade used to stack down the left while the right column
    // sat empty and white, and the page scrolled for no reason.
    expect(ns).toMatch(/\{!product && rawGold && \(/);
    expect(ns).toMatch(/\{!product && !rawGold && \(/);
  });
});

describe("one lookup box for both trades", () => {
  it("the field names both identifiers", () => {
    // The shop holds jewellery, found by HUID, and bullion, found by serial
    // number. Naming only the HUID told the counter a bar could not be sold
    // here, when typing its serial has always worked.
    expect(ns).toMatch(/HUID or Serial No\. \*/);
    expect(ns).toMatch(/placeholder="HUID for jewellery, serial number for a gold bar"/);
    expect(ns).not.toMatch(/placeholder="Enter HUID"/);
    // including the empty-field toast, which is the one place the old wording
    // survived a bundle check
    expect(ns).not.toMatch(/toast\("Enter HUID"\)/);
  });

  it("the tax switch carries no GST caption", () => {
    expect(ns).not.toMatch(/"GST On"/);
    expect(ns).not.toMatch(/"GST Off"/);
    expect(ns).toMatch(/\[\["On", true\], \["Off", false\]\]/);
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


describe("the verdict states this piece's own floors", () => {
  it("the strip names both floors, from the bands", () => {
    // It read "11% break-even" welded - which on a 4% tunch lot is the PROFIT
    // floor, not break-even (8%). It named the wrong line, and welded it.
    expect(ns).toMatch(/profit \{round2\(profitFloorPct\)\}% . break-even \{round2\(breakEvenPct\)\}%/);
    expect(ns).not.toMatch(/% making . 11% break-even/);
  });

  it("the Staff word-card claims no percentage it cannot know", () => {
    // Staff are not sent the bands at all, so a number on their card could not
    // be checked against anything - and it was welded at 11 regardless.
    expect(ns).not.toMatch(/Above 11% break-even/);
    expect(ns).not.toMatch(/Under 11% break-even/);
    expect(ns).toMatch(/note: "Gold profit intact"/);
  });

  it("the derivation lives in Store Defaults, not over the billing field", () => {
    // The counter needs the decision; the arithmetic belongs where the numbers
    // that make it are set.
    expect(ns).not.toMatch(/% list = /);
    expect(ns).not.toMatch(/% tunch \+ /);
    expect(inv).toMatch(/How a bill is priced/);
    expect(inv).toMatch(/this Making Value \+ Running Cost \+ that piece/);
  });
});
