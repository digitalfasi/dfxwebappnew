/**
 * Sales History must be able to show more than its first page, and a filtered
 * view must be the whole filtered result - not a subset of one page.
 *
 * Three defects sat together here:
 *   - `Page 1 of N` was a literal string. `setPage` appeared 0 times in the
 *     file, so everything past the first 100 bills was unreachable.
 *   - category / sub-category / purity filtered in the browser over those 100
 *     rows, while the backend has accepted all three as query params the whole
 *     time. Filtering by 22K searched one page and read as the whole answer.
 *   - the Outstanding tile said "Whole period, not just this page" under every
 *     condition, including a filtered one, while the gold tile beside it
 *     correctly switched to a filtered figure. An unfiltered total next to
 *     filtered rows looks reconciled and is not.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const screen = read("src/modules/billing/sale-history/SalesHistory.jsx");
const service = read("src/modules/billing/billingService.js");

// Mirrors billingService.listSales param assembly.
function buildParams({ page = 1, limit = 100, category = "", subcategory = "", purity = "" } = {}) {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (category) p.set("category", category);
  if (subcategory) p.set("subcategory", subcategory);
  if (purity) p.set("purity", purity);
  return p;
}

describe("Sales History paging", () => {
  it("asks the server for the page it is on", () => {
    expect(buildParams({ page: 3 }).get("page")).toBe("3");
    expect(service).toMatch(/page: String\(page\)/);
    expect(screen).toMatch(/args = \{ limit: PAGE_LIMIT, page,/);
  });

  it("has real page state and both controls", () => {
    expect(screen).toMatch(/const \[page, setPage\] = useState\(1\)/);
    expect(screen).toMatch(/setPage\(\(p\) => Math\.max\(1, p - 1\)\)/);
    expect(screen).toMatch(/setPage\(\(p\) => Math\.min\(totalPages, p \+ 1\)\)/);
  });

  it("no longer renders a hardcoded page number", () => {
    expect(screen).not.toMatch(/>Page 1 of \{totalPages\}</);
  });

  it("returns to page 1 when the query is narrowed", () => {
    // Applying a filter while on page 4 would otherwise land on an empty page 4.
    expect(screen).toMatch(/setPage\(1\);\s*\}, \[query, period, dateFrom, dateTo, fCat, fSub, fPurity\]/);
  });
});

describe("Sales History filtering", () => {
  it("sends all three filters to the server", () => {
    const p = buildParams({ category: "Ring", subcategory: "Casting", purity: "22K" });
    expect([p.get("category"), p.get("subcategory"), p.get("purity")]).toEqual(["Ring", "Casting", "22K"]);
    for (const k of ["category", "subcategory", "purity"]) {
      expect(service.includes(`params.set("${k}"`)).toBe(true);
    }
    expect(screen).toMatch(/args\.purity = fPurity/);
  });

  it("does not re-filter the rows in the browser", () => {
    // The whole defect: filtering what had already been truncated to 100.
    expect(screen).toMatch(/const rows = bills;/);
    expect(screen).not.toMatch(/bills\.filter\(\(b\) => \{/);
  });

  it("both KPI tiles describe the same set", () => {
    expect(screen).toMatch(/const totalGoldSold = periodGoldWeight;/);
    expect(screen).toMatch(/filtersActive \? "Filtered view · whole result"/);
  });
});
