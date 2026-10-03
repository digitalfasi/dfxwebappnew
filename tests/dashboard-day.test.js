/**
 * D1 — the dashboard read zero for today, and it was RIGHT.
 *
 * The senior did a full day's business, opened the dashboard at 00:52 IST and
 * saw zeroes. The shop's day had rolled over to 14 September while he worked,
 * so everything he had just done belonged to the 13th. "Today's collection Rs 0"
 * was the truthful answer for the 14th — but the card never said WHICH day it
 * meant, so he had no way to check, and refreshing never changed it.
 *
 * Nothing here changes the arithmetic. These test what the screen SAYS.
 *
 * D7 — a refusal is not a failure. A staff member whose grants do not cover the
 * alert sources was shown "Alerts unavailable", which reads as an outage.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(process.cwd(), "src/modules/dashboard/Dashboard.jsx"), "utf8");

// Mirrors formatGrowth: a comparison against a period with no business is not
// information.
const formatGrowth = (value, current) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const now = Number(current);
  if (n <= -100 && Number.isFinite(now) && now === 0) return null;
  return `${n > 0 ? "+" : ""}${n}%`;
};

describe("D1 — the -100% badge beside zero", () => {
  it("is suppressed when today has no business", () => {
    expect(formatGrowth(-100, 0)).toBeNull();
  });

  it("still shows a real fall", () => {
    expect(formatGrowth(-40, 6000)).toBe("-40%");
  });

  it("still shows a rise", () => {
    expect(formatGrowth(252.2, 162000)).toBe("+252.2%");
  });

  it("keeps -100% when money actually moved", () => {
    // Defensive: a -100% against a non-zero current is a real statement.
    expect(formatGrowth(-100, 5)).toBe("-100%");
  });
});

describe("D1 — the page says which day it is talking about", () => {
  it("names the business day and the timezone", () => {
    expect(src).toMatch(/periodWindowLabel/);
    expect(src).toMatch(/since 12:00 AM IST/);
  });

  it("builds the day from the IST calendar, not the browser's", () => {
    expect(src).toMatch(/const d = istToday\(\)/);
  });

  it("refetches when the shop's day rolls over, and on focus", () => {
    expect(src).toMatch(/drawnFor/);
    expect(src).toMatch(/visibilitychange/);
    expect(src).toMatch(/addEventListener\("focus"/);
  });

  it("still refreshes its data through reload()", () => {
    // The visible Refresh button was removed from Quick Actions at the owner's
    // request (2026-10-04); the page still re-fetches on a new day / stale tab.
    expect(src).toMatch(/const reload = useCallback/);
    expect(src).toMatch(/reloadToken/);
  });
});

describe("D7 — a refusal is not an outage", () => {
  it("tells a 403 apart from a failure", () => {
    expect(src).toMatch(/CARDS_REFUSED/);
    expect(src).toMatch(/err\.status === 403/);
  });

  it("hides the Action Center rather than reporting a fault", () => {
    expect(src).toMatch(/!cards\.__refused/);
  });

  it("still reports a genuine failure", () => {
    // The two must not collapse into silence — that would hide real outages.
    expect(src).toMatch(/cards\.__failed/);
    expect(src).toMatch(/Alerts unavailable/);
  });
});
