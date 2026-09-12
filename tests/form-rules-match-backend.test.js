/**
 * A form must state the rule the server will apply, before submission.
 *
 * StaffUsers allowed a 6-character password; staff/schema.py requires 8 plus a
 * common-password check. The admin filled the form, submitted, and got a server
 * error for a rule the form had never mentioned - the "fails only after submit"
 * class.
 *
 * And Reports rounds to whole rupees while Sales History shows paise. Both are
 * correct; the same period legitimately reads a few rupees apart. That has to be
 * SAID, or it looks like one of them is wrong.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const staff = read("src/modules/staff/StaffUsers.jsx");
const reports = read("src/modules/reports/ReportsAnalytics.jsx");

// Mirrors app/_shared/core/password_policy.py.
const MIN = 8;
const COMMON = new Set(["123456", "password", "qwerty", "admin123", "abc123"]);
const check = (pw) => {
  if (!pw || pw.length < MIN) return `Password must be at least ${MIN} characters`;
  if (COMMON.has(pw.trim().toLowerCase())) return "common";
  return null;
};

describe("staff password rule", () => {
  it("rejects what the backend rejects, before submitting", () => {
    expect(check("abc123")).toBeTruthy();       // 6 chars - used to be accepted
    expect(check("1234567")).toBeTruthy();      // 7 chars
    expect(check("Priya@123")).toBeNull();      // fine
  });

  it("rejects a common password even at the right length", () => {
    expect(check("password")).toBe("common");
    expect(check("admin123")).toBe("common");
  });

  it("the form no longer allows 6", () => {
    expect(staff).not.toMatch(/password\.length < 6/);
    expect(staff).toMatch(/MIN_PASSWORD_LENGTH = 8/);
    expect(staff).toMatch(/COMMON_PASSWORDS/);
  });

  it("states both rules in the label, not only in the error", () => {
    expect(staff).toMatch(/min \{MIN_PASSWORD_LENGTH\} characters, not a common one/);
  });
});

describe("reports rounding", () => {
  it("uses the shared formatter rather than a local copy", () => {
    expect(reports).toMatch(/import \{ formatINR \} from "@\/_shared\/utils"/);
    expect(reports).toMatch(/const inr = \(n\) => formatINR\(/);
    // The old local copy duplicated Intl options and could drift.
    expect(reports).not.toMatch(/const inr = \(n\) => `₹\$\{Number/);
  });

  it("says the figures are rounded, so they are not reconciled to the paisa", () => {
    expect(reports).toMatch(/Rounded to the nearest rupee/);
  });
});
