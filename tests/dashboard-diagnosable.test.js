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
  it("dashboard reads carry their own, shorter ceiling", () => {
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

describe("a dead session is named as one", () => {
  const api = readFileSync(new URL("../src/_shared/apiClient.js", import.meta.url), "utf8");

  // The hole that left a browser looking signed in while every call 401'd:
  // refresh kept SUCCEEDING, so notifySessionExpired() was never reached, and
  // the retry's own 401 was simply thrown to the caller as a data error.
  it("a second 401, after a successful refresh, ends the session", () => {
    expect(api).toMatch(/catch \(retryError\) \{/);
    expect(api).toMatch(/retryError instanceof ApiError && retryError\.status === 401/);
    const block = api.slice(api.indexOf("catch (retryError)"), api.indexOf("throw retryError"));
    expect(block).toMatch(/tokenStore\.clear\(\)/);
    expect(block).toMatch(/notifySessionExpired\(\)/);
  });

  it("the dashboard says signed-out rather than could-not-load on a 401", () => {
    expect(dash).toMatch(/Your session is no longer valid/);
  });

  it("the build shows next to the role, where no viewport can hide it", () => {
    const top = readFileSync(new URL("../src/_shared/TopBar.jsx", import.meta.url), "utf8");
    expect(top).toMatch(/\{BUILD_SHA\}/);
  });
});

describe("no panel may silently show dashes", () => {
  it("Schemes has the same three states as Store Business", () => {
    expect(dash).toMatch(/const \[schemeLoading, setSchemeLoading\] = useState\(true\)/);
    expect(dash).toMatch(/const \[schemeFailed, setSchemeFailed\] = useState\(false\)/);
    expect(dash).toMatch(/schemeFailed \|\| coreFailed/);
  });

  it("its KPIs show the skeleton while in flight", () => {
    expect(dash).toMatch(/Collection`\} value=\{fmtCurrency\(paySummary\?\.total_revenue\)\} loading=\{schemeLoading\}/);
    expect(dash).toMatch(/New Enrollments`\} value=\{fmtCount\(newEnroll\)\} loading=\{schemeLoading\}/);
  });

  it("a refused or failed summary is not mistaken for real data", () => {
    expect(dash).toMatch(/const usable = \(v\) => \(v && !v\.__refused && !v\.__failed \? v : null\)/);
  });

  it("the wait is generous but still bounded", () => {
    const ms = Number(dash.match(/const DASHBOARD_TIMEOUT_MS = (\d+)/)[1]);
    expect(ms).toBeGreaterThanOrEqual(20000);
    expect(ms).toBeLessThan(45000);
  });
});

describe("the per-call timeout actually applies", () => {
  const api = readFileSync(new URL("../src/_shared/apiClient.js", import.meta.url), "utf8");

  // rawRequest accepted timeoutMs; apiRequest destructured only
  // {method, body, auth, signal} and dropped it. Every AUTHENTICATED call -
  // which is all of them - therefore ran on the 45s default however short a
  // ceiling the caller asked for. A bound that reads as a bound and is not one
  // at runtime is worse than no bound at all.
  it("apiRequest takes timeoutMs from its caller", () => {
    expect(api).toMatch(/const \{ method = "GET", body, auth = false, signal, timeoutMs \} = options/);
  });

  it("and passes it on every path it can take", () => {
    const fn = api.slice(api.indexOf("export async function apiRequest"), api.indexOf("export async function downloadFile"));
    const calls = [...fn.matchAll(/rawRequest\(path, \{[^}]*\}/g)].map((m) => m[0]);
    expect(calls.length).toBeGreaterThanOrEqual(3); // unauthed, first try, retry
    for (const c of calls) expect(c).toMatch(/timeoutMs/);
  });
});

describe("Outstanding Amount and Pending Dues cannot dash silently", () => {
  it("both show the skeleton while their call is in flight", () => {
    expect(dash).toMatch(/Outstanding Amount" value=\{fmtCurrency\(outstanding\)\} loading=\{coreLoading\}/);
    expect(dash).toMatch(/Pending Dues" value=\{fmtCurrency\(pendingDues\)\} loading=\{coreLoading\}/);
  });

  it("a failure there raises the banner in both panels", () => {
    expect(dash).toMatch(/\{\(bizFailed \|\| coreFailed\) && \(/);
    expect(dash).toMatch(/\{\(schemeFailed \|\| coreFailed\) && \(/);
  });

  it("they carry the dashboard ceiling instead of the 45s default", () => {
    expect(dash).toMatch(/listSales\(\{ limit: 5, timeoutMs: DASHBOARD_TIMEOUT_MS \}\)/);
    expect(dash).toMatch(/getEnrollments\("", \{ timeoutMs: DASHBOARD_TIMEOUT_MS \}\)/);
  });

  it("a refused all-time summary is not read as zero dues", () => {
    expect(dash).toMatch(/const payAllOk = payAll && !payAll\.__refused && !payAll\.__failed/);
  });
});
