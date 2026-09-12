/**
 * Never report an outcome that did not happen.
 *
 * Recording a purchase and publishing it to the catalogue are two separate
 * calls. The publish was wrapped in `.catch(() => {})` and the toast then said
 * "Purchase recorded and published to catalogue" regardless. The item sat in
 * stock, absent from the catalogue, and nobody found out until a customer
 * could not see it.
 *
 * The purchase genuinely IS recorded when this happens, so the message has to
 * carry both halves - one succeeded, one did not.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(
  path.join(process.cwd(), "src/modules/procurement/inventory/Inventory.jsx"), "utf8");

// Mirrors the toast decision.
const message = ({ addToCatalogue, publishFailed }) =>
  publishFailed
    ? `Purchase recorded, but publishing to the catalogue failed — ${publishFailed}`
    : addToCatalogue
      ? "Purchase recorded and published to catalogue"
      : "Purchase recorded";

describe("catalogue publish reporting", () => {
  it("reports the failure instead of claiming success", () => {
    const m = message({ addToCatalogue: true, publishFailed: "500" });
    expect(m).toMatch(/publishing to the catalogue failed/);
    expect(m).not.toMatch(/and published to catalogue/);
  });

  it("still confirms the purchase, because the purchase did succeed", () => {
    expect(message({ addToCatalogue: true, publishFailed: "500" })).toMatch(/^Purchase recorded,/);
  });

  it("is unchanged on the happy path", () => {
    expect(message({ addToCatalogue: true, publishFailed: "" }))
      .toBe("Purchase recorded and published to catalogue");
    expect(message({ addToCatalogue: false, publishFailed: "" })).toBe("Purchase recorded");
  });

  it("no longer swallows the publish error", () => {
    expect(src).not.toMatch(/publishToCatalogue\(created\.id\)\.catch\(\(\) => \{\}\)/);
    expect(src).toMatch(/publishFailed = e\?\.message/);
  });

  it("the component actually branches on it", () => {
    expect(src).toMatch(/if \(publishFailed\)/);
    expect(src).toMatch(/but publishing to the catalogue failed/);
  });
});
