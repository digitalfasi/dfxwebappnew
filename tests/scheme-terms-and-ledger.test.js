/**
 * Each scheme type quoted on its own terms, and one bill telling one story.
 *
 * Source of truth: the 14 Sep screenshots. A Flexible Digi Gold wallet was
 * advertised as "₹1,000 / mo" on its card, described as "₹1,000 Monthly · 12
 * installments" in the payment modal, and could only ever be paid ₹1,000,
 * ₹3,000 or ₹6,000 — on a plan whose entire point is that the customer pays
 * what he likes between ₹500 and ₹1,00,000.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { planHeadline, tenureLabel, DIGI_MIN, DIGI_MAX } from "../src/modules/plan/scheme/schemeCapabilities";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const MONTHLY = { schemeType: "MONTHLY", amount: 1000, durationMonths: 12 };
const WALLET = { schemeType: "FLEXIBLE_DIGI_GOLD", amount: 1000, durationMonths: 12, goldPurity: "24K" };
const FIXED = { schemeType: "FIXED_GOLD_RATE", amount: 1000, durationMonths: 12, goldPurity: "22K" };

describe("a scheme card quotes the plan on its own terms", () => {
  it("Monthly leads with the instalment", () => {
    const h = planHeadline(MONTHLY);
    expect(h.value).toBe("\u20b91,000");
    expect(h.suffix).toBe("/ mo");
  });

  it("a wallet leads with the deposit RANGE, never a monthly amount", () => {
    const h = planHeadline(WALLET);
    expect(h.value).toContain("\u20b9500");
    expect(h.value).toContain("\u20b91,00,000");
    expect(h.suffix).toBe("per deposit");
    expect(h.suffix).not.toContain("/ mo");
  });

  it("Fixed Gold Rate leads with the purity it is sold on", () => {
    const h = planHeadline(FIXED);
    expect(h.value).toBe("22K");
    expect(h.suffix).toMatch(/locked/);
  });

  it("only a plan paid in instalments counts installments", () => {
    expect(tenureLabel(MONTHLY)).toBe("12 installments");
    expect(tenureLabel(FIXED)).toBe("12 installments");
    expect(tenureLabel(WALLET)).toBe("12 months");
  });

  it("the card reads the headline instead of printing the stored amount", () => {
    const src = read("../src/modules/plan/scheme/Schemes.jsx");
    expect(src).toMatch(/const h = planHeadline\(s\)/);
    expect(src).not.toMatch(/\{formatINR\(s\.amount\)\}/);
  });
});

describe("a wallet can be paid its own way", () => {
  const src = read("../src/modules/payments/components/SchemeManualPaymentModal.jsx");

  it("the modal knows when it is looking at a wallet", () => {
    expect(src).toMatch(/const isWallet = isWalletScheme\(balance\?\.scheme_type\)/);
  });

  it("the amount is typed wherever the CUSTOMER decides it, not from installments", () => {
    // Two types leave the amount to the customer: a wallet (pays what he likes
    // at today's rate) and Fixed Gold Rate (pays what he likes at the rate
    // frozen when he joined). Only MONTHLY multiplies an instalment.
    expect(src).toMatch(/const amount = freeAmount \? walletAmount : monthly \* form\.months/);
    expect(src).toMatch(/onChange=\{\(ev\) => setForm\(\{ \.\.\.form, walletAmount:/);
  });

  it("the installments selector renders only for a plan sold on installments", () => {
    expect(src).toMatch(/\{!freeAmount && \(/);
  });

  it("a Fixed Gold Rate contribution converts at the customer's OWN locked rate", () => {
    // The whole product: the rate was frozen the day he chose his purity, so
    // the grams his money buys must be quoted against THAT, never today's.
    expect(src).toMatch(/balance\.locked_gold_rate/);
  });


  it("a deposit is bounded by the same range the backend enforces", () => {
    expect(DIGI_MIN).toBe(500);
    expect(DIGI_MAX).toBe(100000);
    expect(src).toMatch(/amount >= DIGI_MIN && amount <= DIGI_MAX/);
  });

  it("a wallet is contributable without remaining months", () => {
    expect(src).toMatch(/can_contribute && \(isWallet \|\| remainingMonths > 0\)/);
  });

  it("nothing is ever 'due' where there are no installments", () => {
    // The schedule panel belongs to instalment plans alone. A wallet has no
    // due dates, and neither does Fixed Gold Rate now that the customer pays
    // what he likes against his locked rate.
    expect(src).toMatch(/\{!freeAmount && \(\(\) => \{/);
  });
});

describe("New Sale says what it is doing", () => {
  const src = read("../src/modules/billing/new-sale/NewSale.jsx");

  it("the whole-bill margin is coloured by its own sign", () => {
    expect(src).toMatch(/const tone = negative/);
    expect(src).toMatch(/border-emerald-200 bg-emerald-50/);
    expect(src).toMatch(/border-danger-line bg-danger-soft\/50/);
  });

  it("the discount field is never locked out — there is only one driver now", () => {
    expect(src).not.toMatch(/disabled=\{priceDriver === "PRICE"\}/);
    expect(src).not.toMatch(/priceDriver/);
  });

  it("the concession is stated instead of left to be worked out", () => {
    expect(src).toMatch(/const comeDown = product \? Math\.max\(0, round2\(askingPrice - sellingPrice\)\) : 0;/);
    expect(src).toMatch(/off the \{money\(askingPrice\)\} asking price/);
  });
});

describe("one bill, one story", () => {
  it("the Payments detail panel reads the same ledger Sales History reads", () => {
    const src = read("../src/modules/payments/Payments.jsx");
    expect(src).toMatch(/billingService\.getSalePayments\(saleId\)/);
    expect(src).toMatch(/ledger\.payments\.map/);
  });
});
