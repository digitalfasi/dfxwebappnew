/**
 * Header bell + inbox.
 *
 * The bell used to carry a red dot hard-coded into its markup, lit for every
 * user whether or not anything had happened, and clicking it opened the
 * CAMPAIGNS screen (notifications the shop sends), not anything addressed to
 * the user. These pin the fix: the badge comes from the real unread count,
 * clicking opens a popover, "See all" opens the inbox page, and a staff member
 * can open that page.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { timeAgo, dayGroup, badgeText } from "../src/modules/inbox/inboxFormat.js";
import { canOpen, PAGE_MODULE, ANY_SHOP_USER } from "../src/_shared/moduleAccess";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const topbar = read("src/_shared/TopBar.jsx");
const bell = read("src/_shared/NotificationBell.jsx");

describe("the bell is honest", () => {
  it("TopBar no longer hard-codes a red dot or routes the bell to campaigns", () => {
    expect(topbar).not.toMatch(/bg-danger" \/>/);
    expect(topbar).not.toMatch(/onNavigate\("notifications"\)/);
    expect(topbar).toMatch(/<NotificationBell onNavigate=\{onNavigate\} \/>/);
  });
  it("the badge renders only when there is something unread", () => {
    expect(bell).toMatch(/\{count > 0 && \(\s*<span className="num absolute/);
  });
  it("opens a popover with See all, and marks an opened item read", () => {
    expect(bell).toMatch(/role="dialog"/);
    expect(bell).toMatch(/See all notifications/);
    expect(bell).toMatch(/onNavigate\?\.\("inbox"\)/);
    expect(bell).toMatch(/inboxService\.markRead\(\[item\.key\]\)/);
    expect(bell).toMatch(/Mark all as read/);
  });
  it("closes on outside click and Escape", () => {
    expect(bell).toMatch(/mousedown/);
    expect(bell).toMatch(/e\.key === "Escape"/);
  });
});

describe("badge text", () => {
  it("caps at 99+", () => {
    expect(badgeText(3, false)).toBe("3");
    expect(badgeText(99, false)).toBe("99");
    expect(badgeText(99, true)).toBe("99+");
  });
});

describe("time labels", () => {
  const now = new Date(2026, 8, 23, 18, 0, 0).getTime();
  it("reads naturally", () => {
    expect(timeAgo(new Date(now - 20_000).toISOString(), now)).toBe("just now");
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5 min");
    expect(timeAgo(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("3 h");
    expect(timeAgo(new Date(2026, 8, 22, 12).toISOString(), now)).toBe("Yesterday");
  });
  it("groups by day", () => {
    expect(dayGroup(new Date(2026, 8, 23, 9).toISOString(), now)).toBe("Today");
    expect(dayGroup(new Date(2026, 8, 22, 9).toISOString(), now)).toBe("Yesterday");
    expect(dayGroup(new Date(2026, 8, 10).toISOString(), now)).toBe("Earlier");
  });
});

describe("inbox page access", () => {
  it("every shop user can open it; the server filters what is inside", () => {
    expect(PAGE_MODULE.inbox).toBe(ANY_SHOP_USER);
    expect(canOpen("inbox", "Staff", [])).toBe(true);
    expect(canOpen("inbox", "Admin", [])).toBe(true);
    expect(canOpen("inbox", "Customer", [])).toBe(false);
  });
});
