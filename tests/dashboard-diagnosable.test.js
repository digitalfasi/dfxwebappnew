/**
 * A dashboard that shows nothing must say WHY, and a screenshot of it must be
 * enough to diagnose.
 *
 * Reported as: the same account, the same URL, the same minute — real figures
 * on one laptop, four em dashes on another, and nothing on screen or in the
 * console to explain it. The server was returning ₹46,000 collection and
 * ₹3,76,227.28 sales for that tenant throughout.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const dash = read("../src/modules/dashboard/Dashboard.jsx");

describe("waiting is not the same as not knowing", () => {
  it("a card in flight renders a skeleton, not an em dash", () => {
    expect(dash).toMatch(/loading\s*\?\s*<div className="mt-1\.5 h-7 w-24 animate-pulse/);
    expect(dash).toMatch(/function KpiCard\(\{ title, value, growth, growthOf, danger, onClick, loading = false \}\)/);
  });

  it("the business KPIs pass that flag", () => {
    for (const m of [/Sales`\} value=\{fmtCurrency\(bizSales\)\} loading=\{bizLoading\}/,
                     /Gold Sold`\} value=\{fmtGrams\(goldSold\)\} loading=\{bizLoading\}/,
                     /Profit`\} value=\{fmtProfit\(profit\)\} loading=\{bizLoading\}/]) {
      expect(dash).toMatch(m);
    }
  });

  it("a superseded response clears the loading flag it no longer owns", () => {
    expect(dash).toMatch(/if \(bizReq\.current !== key\) return;\r?\n\s*setBizLoading\(false\);/);
  });
});

describe("a failure states itself", () => {
  it("the wait is bounded well under the 45s default", () => {
    const ms = Number(dash.match(/const DASHBOARD_TIMEOUT_MS = (\d+)/)[1]);
    expect(ms).toBeLessThanOrEqual(15000);
    expect(dash).toMatch(/timeoutMs: DASHBOARD_TIMEOUT_MS/);
  });

  it("the reason is captured and shown", () => {
    expect(dash).toMatch(/lastFailureReason = err\?\.status \? `HTTP \$\{err\.status\}`/);
    expect(dash).toMatch(/\{bizReason \? <span/);
  });

  it("the banner carries the build, so a screenshot identifies the bundle", () => {
    expect(dash).toMatch(/build \{BUILD_SHA\}/);
  });
});

describe("the running build is visible without devtools", () => {
  it("utils exports it from the value next.config inlines", () => {
    const utils = read("../src/_shared/utils.js");
    expect(utils).toMatch(/export const BUILD_SHA = process\.env\.NEXT_PUBLIC_BUILD_SHA \|\| "dev"/);
  });

  it("next.config reads the stamp archive.sh writes", () => {
    const cfg = read("../next.config.mjs");
    expect(cfg).toMatch(/DEPLOY_SHA/);
    expect(cfg).toMatch(/NEXT_PUBLIC_BUILD_SHA: BUILD_SHA/);
  });

  it("the sidebar shows it", () => {
    expect(read("../src/_shared/Sidebar.jsx")).toMatch(/\{BUILD_SHA\}/);
  });
});
