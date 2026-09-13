/**
 * D4 — a staff member created without an email could not sign in at all.
 *
 * The identifier field was rendered as type="email", so the browser refused a
 * phone number ("Please include an '@'") before a single request was sent. The
 * server has always accepted either: auth/service.py matches
 * `User.email == username OR phone_match_condition(username)`. Only the browser
 * was refusing, and Ragu (7894561230, no email) had a real account nobody could
 * use.
 *
 * Two halves, and they must agree: new staff now REQUIRE an email, and the
 * login field accepts whatever the server accepts.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const gate = read("src/_shared/AuthGate.jsx");
const staff = read("src/modules/staff/StaffUsers.jsx");

// Mirrors StaffUsers.validate for the email rule.
const emailError = (email) => {
  if (!email || !email.trim()) return "Email is required — the staff member signs in with it";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email";
  return null;
};

describe("D4 — sign-in identifier", () => {
  it("is not typed as an email, so a phone number reaches the server", () => {
    // The rendered attribute, not the word - the comment above the fix names
    // the old value.
    expect(gate).not.toMatch(/<Input\s+type="email"/);
    expect(gate).toMatch(/<Input\s+type="text"/);
  });

  it("says so in the label, rather than leaving the user guessing", () => {
    expect(gate).toMatch(/Email or phone/);
  });
});

describe("D4 — Add Staff requires an email", () => {
  it("refuses an empty email", () => {
    expect(emailError("")).toMatch(/required/);
    expect(emailError(null)).toMatch(/required/);
    expect(emailError("   ")).toMatch(/required/);
  });

  it("still refuses a malformed one", () => {
    expect(emailError("ram")).toBe("Invalid email");
    expect(emailError("ram@")).toBe("Invalid email");
  });

  it("accepts a real one", () => {
    expect(emailError("ram@dfxsolution.com")).toBeNull();
  });

  it("the form no longer advertises it as optional", () => {
    expect(staff).not.toMatch(/Email <span className="font-normal text-muted">\(optional\)<\/span>/);
    expect(staff).toMatch(/Email \*/);
  });
});

describe("D4 — the password can be read while it is typed", () => {
  it("has a reveal control, like the sign-in screen", () => {
    // The dialog says the password cannot be viewed later, then hid it while
    // the admin typed it.
    expect(staff).toMatch(/showStaffPassword/);
    expect(staff).toMatch(/type=\{showStaffPassword \? "text" : "password"\}/);
    expect(staff).toMatch(/aria-label=\{showStaffPassword \? "Hide password" : "Show password"\}/);
  });
});
