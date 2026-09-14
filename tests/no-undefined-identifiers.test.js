/**
 * Nothing on a screen may reference an identifier that does not exist.
 *
 * This is here because it has now happened twice, and both times the screen was
 * DEAD - not wrong, unreachable - while every other gate stayed green:
 *
 *   - `rawGoldBuyerReady` was declared above the four states it read, so it
 *     threw "Cannot access 'eP' before initialization" and New Sale redirected
 *     to Gold Rate.
 *   - `effectiveProfitAmount` was left referenced after its declaration was
 *     removed in a refactor. ReferenceError on every render, same result.
 *
 * Neither is a syntax error, so `next build` compiles them happily, and neither
 * is caught by a source-text assertion, because the text being looked for is
 * right there. Only scope analysis catches them, so that is what this does.
 */
import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath, not .pathname - this project sits under a path with spaces and
// .pathname hands them back percent-encoded, which no fs call can open.
const ROOT = fileURLToPath(new URL("../src", import.meta.url));

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.jsx?$/.test(full) ? [full] : [];
  });

const linter = new Linter();
const CONFIG = {
  parserOptions: { ecmaVersion: 2022, sourceType: "module", ecmaFeatures: { jsx: true } },
  env: { browser: true, es2022: true, node: true },
  rules: {
    "no-undef": "error",
    "no-use-before-define": ["error", { variables: true, functions: false, classes: false }],
  },
};

describe("every screen only uses identifiers that exist", () => {
  const files = walk(ROOT);

  it("finds the source to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.slice(f.indexOf("src")), f]))("%s", (_label, file) => {
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    const found = linter.verify(source, CONFIG, file).filter((m) => {
      // A rule this config does not load (the react-hooks plugin) reports
      // itself as missing; that is not a finding about the code.
      if (m.ruleId === "no-undef") return true;
      if (m.ruleId !== "no-use-before-define") return false;
      // Reading a later variable from inside a FUNCTION BODY is fine: the body
      // runs on a click, long after every state exists. Only a declaration
      // evaluated eagerly while the component renders can actually throw, and
      // that is a top-level const/let at the component's own indentation.
      // Without this the check flags every handler that reads state declared
      // below it - and a test that cries wolf is a test people learn to skip.
      return /^ {2}(const|let) /.test(lines[m.line - 1] || "");
    });
    expect(found.map((m) => `${m.line}:${m.column} ${m.message}`).join("\n")).toBe("");
  });
});
