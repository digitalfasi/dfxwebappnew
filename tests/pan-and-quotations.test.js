/**
 * Tests for High-Value Bill PAN Compliance Field (>= Rs 2,00,000)
 * and Quotations History UI.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ns = read("../src/modules/billing/new-sale/NewSale.jsx");
const billingSvc = read("../src/modules/billing/billingService.js");
const custSvc = read("../src/modules/customers/customerService.js");
const qHist = read("../src/modules/billing/quotations/QuotationsHistory.jsx");
const sHist = read("../src/modules/billing/sale-history/SalesHistory.jsx");
const app = read("../src/App.jsx");
const modAccess = read("../src/_shared/moduleAccess.js");

describe("Task 1: High-Value Bill PAN Compliance (>= Rs 2,00,000)", () => {
  it("renders PAN input dynamically when billTotal >= 200000", () => {
    expect(ns).toMatch(/billTotal\s*>=\s*200000/);
    expect(ns).toMatch(/PAN Number/);
  });

  it("limits PAN to 10 characters and forces uppercase", () => {
    expect(ns).toMatch(/maxLength=\{10\}/);
    expect(ns).toMatch(/toUpperCase\(\)/);
  });

  it("field is explicitly optional for compliance", () => {
    expect(ns).toMatch(/ABCDE1234F \(Optional\)/);
    expect(ns).toMatch(/Recommended for jewellery purchases of ₹2,00,000 and above/);
  });

  it("passes panNumber safely to billingService.createSale", () => {
    expect(ns).toMatch(/panNumber:\s*panNumber\.trim\(\)\.toUpperCase\(\)/);
    expect(billingSvc).toMatch(/if\s*\(panNumber\)\s*body\.pan_number\s*=\s*panNumber/);
  });

  it("updates customer PAN if customer profile exists", () => {
    expect(custSvc).toMatch(/pan_number:\s*panNumber/);
  });
});

describe("Task 2: Quotations History UI", () => {
  it("billingService exposes listQuotations", () => {
    expect(billingSvc).toMatch(/listQuotations/);
    expect(billingSvc).toMatch(/\/billing\/quotations/);
  });

  it("billingService exposes quotation PDF endpoints", () => {
    expect(billingSvc).toMatch(/openQuotationPdf/);
    expect(billingSvc).toMatch(/downloadQuotationPdf/);
  });

  it("QuotationsHistory displays quotation number, date, customer, contact, and total", () => {
    expect(qHist).toMatch(/Quotation No\./);
    expect(qHist).toMatch(/Date/);
    expect(qHist).toMatch(/Customer/);
    expect(qHist).toMatch(/Contact/);
    expect(qHist).toMatch(/Estimated Total/);
  });

  it("QuotationsHistory provides print and download PDF actions", () => {
    expect(qHist).toMatch(/openQuotationPdf/);
    expect(qHist).toMatch(/downloadQuotationPdf/);
  });

  it("SalesHistory provides tabs to toggle between Sales Invoices and Quotations", () => {
    expect(sHist).toMatch(/Quotations/);
    expect(sHist).toMatch(/Sales Invoices/);
    expect(sHist).toMatch(/<QuotationsHistory/);
  });

  it("App.jsx and moduleAccess include quotations-history route", () => {
    expect(app).toMatch(/"quotations-history":/);
    expect(modAccess).toMatch(/"quotations-history":\s*"billing_sales_history"/);
    expect(modAccess).toMatch(/"quotations-history":\s*"billing"/);
  });
});
