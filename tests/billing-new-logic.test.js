/**
 * The new making-charge logic on screen, and the concession made readable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ns = read("../src/modules/billing/new-sale/NewSale.jsx");
const ps = read("../src/modules/billing/pricing-settings/PricingSettings.jsx");
const svc = read("../src/modules/billing/billingService.js");
const inv = read("../src/modules/procurement/inventory/Inventory.jsx");
// The profit/loss word and its wording live in ONE place now, shared by New
// Sale and Sales History, so that the two screens cannot describe the same
// bill differently.
const verdict = read("../src/_shared/ui/verdict.jsx");
const sh = read("../src/modules/billing/sale-history/SalesHistory.jsx");
const sch = read("../src/modules/plan/scheme/Schemes.jsx");
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
    // converted through the scheme-aware inverse, not a flat factor
    expect(ns).toMatch(/\? Math\.max\(0, round2\(askingPretax - toPretax\(minSafe\)\)\)/);
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

describe("Online charges the rate it displays", () => {
  it("both modes send the rate they display", () => {
    // ONLINE used to send nothing, so the field read Rs 14,548.75 while the
    // bill still charged 14 g x Rs 14,125 - the mode was decoration.
    expect(ns).toMatch(/appliedRatePerGram: rate !== "" && !rateOutOfBand \? num\(rate\) : undefined,/);
  });
  it("the saved sale sends the same rate as the quote, in both modes", () => {
    // The quote was fixed but createSale/generateQuotation (baseInputs) still
    // sent the rate only for OFFLINE, so an Online bill saved ex-tax.
    const base = ns.slice(ns.indexOf("const baseInputs = () => {"), ns.indexOf("const modeRate"));
    expect(base).toMatch(/appliedRatePerGram: rate !== "" && !rateOutOfBand \? num\(rate\) : undefined,/);
    expect(base).not.toMatch(/offline && rate/);
  });
  it("the tax is applied to the published rate, never to an already-taxed one", () => {
    expect(ns).toMatch(/const modeRate = \(m\) => \{/);
    expect(ns).toMatch(/const base = publishedRate;/);
  });
});

describe("the tunch a piece was bought at is visible in stock", () => {
  it("the service carries it for jewellery, and null stays null", () => {
    expect(svc).toMatch(/tunch: raw\.tunch_percent \?\? null,/);
  });

  it("the product list shows it; an unrecorded tunch is a dash, not 0%", () => {
    expect(inv).toMatch(/<th className="px-3 py-3 text-right">Tunch<\/th>/);
    expect(inv).toMatch(/\{p\.tunch != null \? `\$\{p\.tunch\}%` : "—"\}/);
  });

  it("bullion has no tunch anywhere", () => {
    // A bar is bought at rate x weight and sold at rate x weight plus GST.
    // There is no craftsman's charge at either end, so the column, the input,
    // the payload field and the response field are all gone rather than sitting
    // there as a permanent zero for someone to fill in.
    expect(svc).not.toMatch(/tunch: r\.tunch_percent/);
    expect(inv).not.toMatch(/<th className="px-4 py-2.5 text-right">Tunch<\/th>/);
    expect(inv).toMatch(/\{bulkType === "JEWELLERY" && <th className="py-2 w-\[100px\]">Tunch %<\/th>\}/);
    // and the tunch leg is zero in every raw-gold total on the screen
    expect(inv).toMatch(/bulkType === "JEWELLERY" \? tunchFromNumber\(r\.tunchNo, r\.purity\)\.pct : 0;/);
  });

  it("bulk Tunch comes from the supplier's Tunch Number, never a default", () => {
    // 2026-09-26: Tunch % = Tunch Number - purity (18K 750, number 790 = 4%).
    expect(inv).toMatch(/setCell\("tunchNo"/);
    expect(inv).toMatch(/const touch = n > 100 \? n \/ 10 : n;/);
    expect(inv).toMatch(/tunch: String\(tunchFromNumber\(r\.tunchNo, r\.purity\)\.pct\),/);
    expect(inv).not.toMatch(/tunch: DEFAULT_TUNCH_PERCENT, other/);
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
    // Widened from the wallet to every free-amount plan: Fixed Gold Rate
    // sets no instalment either, so "0/12 months paid" was equally false.
    // Behaviour, not layout: a free-amount plan reports the money it has
    // taken, never a count of months it never agreed to. Pinning the exact
    // markup made an ordinary restyle of the cell look like a regression.
    // The column no longer special-cases free-amount plans, because no plan
    // shows a month count here any more: PAID is money for every row, and the
    // "n of term" counter moved into the PLAN cell where a term belongs.
    // Windowed, it reports what the window collected; otherwise the lifetime
    // figure. Either way a wallet reports money it holds, never months.
    expect(sm).toMatch(/money\(activity\.get\(r\.id\)\?\.amount \?\? 0\)/);
    expect(sm).toMatch(/<span className="font-bold">\{money\(r\.totalPaid\)\}<\/span>/);
    // ...and the counter lives in PlanCell.
    expect(sm).toMatch(/\{done\}\/\{term\}/);
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
    // Phase 3: a piece is found by HUID OR by its Item Code.
    expect(ns).toMatch(/HUID, Item Code or Serial No\. \*/);
    expect(ns).toMatch(/placeholder="HUID or Item Code for jewellery, serial number for a gold bar"/);
    expect(ns).not.toMatch(/placeholder="Enter HUID"/);
    // including the empty-field toast, which is the one place the old wording
    // survived a bundle check
    expect(ns).not.toMatch(/toast\("Enter HUID"\)/);
  });

  it("GST is compulsory: no on/off switch on the bill", () => {
    // 2026-09-26: every bill carries GST; the switch is gone from both the
    // jewellery and the raw-gold summary.
    expect(ns).not.toMatch(/\[\["On", true\], \["Off", false\]\]/);
    expect(ns).not.toMatch(/setGst\(val\)/);
    expect(ns).toMatch(/GST is compulsory on every bill/);
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
    expect(sm).toMatch(/!\(r\.overdueAmount > 0\)/);
    expect(sm).toMatch(/NOT_APPLICABLE/);
  });

  it("a wallet is never shown an overdue amount", () => {
    // A Digi Gold wallet has no duration, no instalment and no due date, so it
    // cannot be in arrears. The wallet branch of this cell must be reached
    // BEFORE any overdue figure is considered.
    // No free-amount plan can be overdue. The quiet nudge stays wallet-only:
    // it is the wallet's own courtesy reminder, not an arrears state.
    expect(sm).toMatch(/isFreeAmountScheme\(r\.schemeType\)\s*\?\s*\(isWalletScheme\(r\.schemeType\) && r\.quiet/);
  });

  it("a quiet wallet is a reminder, never an arrear", () => {
    // Amber, never red, and it must not use the arrears wording. Red would send
    // staff to chase a customer who owes nothing.
    expect(sm).toMatch(/function QuietNudge/);
    expect(sm).toMatch(/No deposit/);
    expect(sm).toMatch(/border-amber-300/);
    // The nudge must not borrow the danger styling the real arrears use, and
    // must not call the customer overdue. (Its tooltip DOES say "no due date" -
    // explaining why nothing is owed is the point, so "due" is not banned.)
    const nudge = sm.slice(sm.indexOf("function QuietNudge"), sm.indexOf("// KPI card"));
    expect(nudge).not.toMatch(/text-danger|bg-danger|border-danger/);
    expect(nudge).not.toMatch(/overdue|Overdue|arrear|late|Late/);
  });

  it("the shop never sets an amount on a Fixed Gold Rate plan", () => {
    // It fixes the RATE, not the money. Asking for a monthly instalment was the
    // instalment plan's shape forced onto a plan bought on the rate, and the
    // pre-filled 1000 it left behind read as a decision already made.
    expect(sch).toMatch(/isFreeAmountScheme\(form\.type\) \? "Deposit \(₹\)" : "Monthly Amount \(₹\)"/);
    expect(sch).toMatch(/Nothing to set\. The customer pays what he likes/);
    expect(sch).toMatch(/fixes his RATE, not his money/);
  });

  it("a Fixed Gold Rate plan offers every purity, not one the shop pinned", () => {
    // The purity IS the product: the rate he freezes is the rate of the purity
    // he picks. Pinning one meant a separate scheme per purity, and the mobile
    // customer was offered exactly one.
    expect(sch).toMatch(/const needsPurity = \(type\) => type === "FLEXIBLE_DIGI_GOLD"/);
    expect(sch).toMatch(/All purities offered/);
  });

  it("a scheme cannot be sold in a purity the shop cannot price", () => {
    // 20K has no published rate column anywhere in the system, so a scheme
    // saved in it is one nobody can enrol into.
    expect(sch).toMatch(/const PURITY_CHOICES = \["9K", "14K", "18K", "22K", "24K"\]/);
  });

  it("a wallet matures on a gram, not on a date", () => {
    // maturity_date on a wallet is joined + 12 months, inherited from the
    // instalment plans - it promises something the product does not do.
    expect(sm).toMatch(/function GramGoal/);
    expect(sm).toMatch(/isWalletScheme\(r\.schemeType\) && r\.goldGramsTarget/);
    expect(sm).toMatch(/Ready to take/);
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

  it("Online uses the same published rate, before tax (no tax-inclusive rate)", () => {
    expect(ns).not.toMatch(/onlineRateFactor/);
    expect(ns).toMatch(/return String\(round2\(base\)\);/);
    expect(ns).toMatch(/setRate\(published == null \? "" : String\(round2\(published\)\)\);/);
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
    expect(verdict).toMatch(/note: "Gold profit intact"/);
    expect(verdict).not.toMatch(/11%/);
  });

  it("Sales History shows the word to whoever cannot see the rupees", () => {
    // Staff saw the direction while pricing the bill and nothing at all once
    // it was raised: the only profit block on that screen is gated on
    // purchaseCost, which the backend nulls for a Staff caller. Same rule as
    // New Sale, so the same card.
    expect(sh).toMatch(/PnlWordCard/);
    expect(sh).toMatch(/sale\.purchaseCost == null && sale\.profitLabel/);
  });

  it("neither screen keeps its own copy of the wording", () => {
    // Two readers of one rule drift. The tunch readers already proved that.
    for (const src of [ns, sh]) {
      expect(src).not.toMatch(/word: "BREAK EVEN"/);
      expect(src).toMatch(/from "@\/_shared\/ui\/verdict"/);
    }
  });

  it("the derivation lives in Store Defaults, not over the billing field", () => {
    // The counter needs the decision; the arithmetic belongs where the numbers
    // that make it are set.
    expect(ns).not.toMatch(/% list = /);
    expect(ns).not.toMatch(/% tunch \+ /);
    expect(ps).toMatch(/Preview · 10 g 22K/);
  });
});


describe("the screens stay small enough to use", () => {
  const pay = read("../src/modules/payments/Payments.jsx");

  it("pricing lives in Billing > Store Defaults, not in Inventory", () => {
    expect(inv).not.toMatch(/Store Pricing Defaults<\/Button>/);
    expect(ps).toMatch(/label="Gold profit"/);
    expect(ps).toMatch(/const extra = r2\(making - goldProfit\);/);
    expect(ps).toMatch(/Compulsory on every bill/);
  });

  it("Payments shows both types at once instead of behind a dropdown", () => {
    expect(pay).toMatch(/\[\["business", "Business Payment"\], \["scheme", "Scheme Payment"\]\]/);
    expect(pay).toMatch(/onClick=\{\(\) => setTab\(val\)\}/);
    // the state and everything reading it are untouched
    expect(pay).toMatch(/tab === "business"/);
  });

  it("bulk receiving can add a vendor without losing the rows already typed", () => {
    // The control existed only on the single-item Add Purchase form, so a lot
    // from a vendor not yet on file could not be received at all.
    // Both forms now carry it: the single-item Add Purchase, and bulk receiving.
    expect(inv.match(/\+ Add new supplier/g) || []).toHaveLength(2);
    expect(inv).toMatch(/setBulkHeader\(h => \(\{ \.\.\.h, vendor: v\.name, deliveredBy: h\.deliveredBy \|\| v\.contactPerson \|\| "" \}\)\);/);
  });

  it("a bar's bill ends in the same dialog a piece's does", () => {
    // It ended in a toast with an invoice number, so printing it meant going
    // to find the sale in Sales History.
    expect(ns).toMatch(/setInvoice\(\{\r?\n\s*id: sale\.id,/);
    expect(ns).toMatch(/invoiceNumber: sale\.invoice_number,/);
  });

  it("nothing on the bar panel is captioned Tax or GST", () => {
    const panel = ns.slice(ns.indexOf("{rawGold && ("), ns.indexOf("Placeholder for the pinned summary"));
    expect(panel).not.toMatch(/className="text-xs font-bold">Tax</);
  });
});


describe("the tunch a lot was bought at is the tunch it bills at", () => {
  const svcPy = read("../../DFX-Backend/app/modules/billing/service.py");

  it("single Add Purchase points the item back at its lot", () => {
    // The purchase knew its item; the item did not know its purchase. Every
    // reader starts from the ITEM, so a lot entered at 6% was found as the
    // vendor master's 4% - in stock and on every bill raised against it.
    const fn = svcPy.slice(svcPy.indexOf("async def create_purchase"), svcPy.indexOf("async def list_purchases"));
    expect(fn).toMatch(/item\.vendor_purchase_id = purchase\.id/);
  });

  it("stock already created without that link still reports its real tunch", () => {
    // Reached from the other end rather than by rewriting historical rows.
    expect(svcPy).toMatch(/VendorPurchase\.inventory_item_id\.in_\(\{i\.id for i in items\}\)/);
    expect(svcPy).toMatch(/VendorPurchase\.inventory_item_id == item\.id/);
  });

  it("the lot is preferred over the vendor master, in both readers", () => {
    expect(svcPy).toMatch(/v = by_item\.get\(i\.id\)/);
  });

  it("a bullion purchase never carries a tunch leg", () => {
    expect(svcPy).toMatch(/charge_percent=0\.0,/);
  });
});


describe("a scheme bill is judged against itself, not against a bill that is not being raised", () => {
  const svcPy = read("../../DFX-Backend/app/modules/billing/service.py");

  it("the asking price and the floor both carry the scheme carve", () => {
    // Without it the guidance described the UN-carved bill: on a live screen
    // MIN SAFE PRICE (3,37,690.72) sat ABOVE the CURRENT PRICE (3,35,449.03)
    // while the verdict beside them read PROFIT.
    const q = svcPy.slice(svcPy.indexOf("async def get_quote"), svcPy.indexOf("raw_guidance ="));
    const full = q.slice(q.indexOf("full = BillingCalculationEngine.calculate"));
    const floor = q.slice(q.indexOf("floor_breakdown = BillingCalculationEngine.calculate"));
    expect(full.slice(0, floor.length ? full.indexOf("floor_breakdown") : undefined)).toMatch(/scheme_value,/);
    expect(floor).toMatch(/scheme_value,/);
  });

  it("GST is never applied to the gold a scheme already bought", () => {
    // A flat x(1 + rate) taxed the covered slice too - 3% of the credit, 900
    // rupees on the owner's screenshot - and every figure built on the asking
    // price inherited it.
    expect(ns).toMatch(/const toFinal = \(pre\) => round2\(pre \+ Math\.max\(0, pre - schemeCovered\) \* taxRate\);/);
    expect(ns).toMatch(/const toPretax = \(final\) => round2\(\(final \+ schemeCovered \* taxRate\) \/ taxFactor\);/);
    // and nothing converts by the flat factor any more
    expect(ns).not.toMatch(/askingPretax \* taxFactor/);
    expect(ns).not.toMatch(/minSafe \/ taxFactor/);
    expect(ns).not.toMatch(/\(product\.finalAmount \|\| 0\) \/ taxFactor/);
  });

  it("the asking price is built from the backend's own figures", () => {
    expect(ns).toMatch(/const askingPrice = toFinal\(askingPretax\);/);
    expect(ns).toMatch(/\(product\.subtotalBeforeTax \|\| 0\) - \(product\.makingChargeAmount \|\| 0\) \+ pctToRupees\(listPct\)/);
  });
});

describe("one answer to \"how much may I give?\"", () => {
  it("the Safe Price panel prints the SAME cap the Discount box takes", () => {
    // It printed the tax-inclusive figure (8,025.94) beside the box's pre-tax
    // one (7,792.17) - both true, in different units, with nothing saying so.
    // The owner could not tell which number to type.
    expect(ns).toMatch(/Max Discount<\/div><div className="num text-sm font-extrabold">\{discountCeiling != null \? money\(discountCeiling\)/);
    expect(ns).not.toMatch(/Price Can Drop/);
    expect(ns).not.toMatch(/const maxDiscount =/);
  });

  it("and states what that cap does to the bill, so the two figures reconcile", () => {
    expect(ns).toMatch(/The bill falls by \{money\(round2\(discountCeiling \* taxFactor\)\)\}/);
  });

  it("a scheme bill shows what the customer actually hands over", () => {
    // finalAmount is the total BEFORE the credit; on a scheme bill that is not
    // the money changing hands - 3,40,799.66 printed against a real 3,10,799.66.
    expect(ns).toMatch(/\{quoteHasScheme \? "Customer Pays" : "Current Price"\}/);
    expect(ns).toMatch(/money\(round2\(\(product\.finalAmount \|\| 0\) - quotedScheme\)\)/);
    expect(ns).toMatch(/money\(round2\(minSafe - quotedScheme\)\)/);
  });
});
