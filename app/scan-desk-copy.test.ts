import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");

describe("Scan flip copy by buyer desk", () => {
  it("derives flipDesk from ?mode= or the saved buyer intent (unknown = personal)", () => {
    expect(scan).toMatch(
      /const flipDesk = isFlipBuyerMode\(\s*urlParams\.get\("mode"\) \|\| savedBuyerIntent\?\.buyerMode,?\s*\)/,
    );
  });

  it("shows Lane Mode and the Profit Simulator to flip desks only", () => {
    expect(scan).toMatch(
      /\{flipDesk && \(\s*<button\s+onClick=\{\(\) => setIsLaneModeOpen\(true\)\}/,
    );
    expect(scan).toMatch(
      /\{flipDesk && \(\s*<button\s+type="button"\s+onClick=\{\(\) => setIsSimulatorOpen\(true\)\}/,
    );
    expect(scan).toContain("{flipDesk && isSimulatorOpen && (");
    expect(scan).toContain("isOpen={flipDesk && isLaneModeOpen}");
  });

  it("drops profit sort and the Min Profit filter for non-flip desks", () => {
    expect(scan).toContain('...(flipDesk || sort === "profit"');
    expect(scan).toMatch(
      /\{flipDesk && \(\s*<FilterSelect\s+label="Min Profit"/,
    );
    expect(scan).toContain('label={flipDesk ? "Price & profit" : "Price"}');
  });

  it("gives the review strip price-first wording for non-flip desks", () => {
    expect(scan).toContain("flipDesk={flipDesk}");
    expect(scan).toContain('label: "Avg asking"');
    expect(scan).toContain('"Check the price"');
    expect(scan).toMatch(/flipDesk\s*\?\s*\[\s*"2",\s*"Verify max bid"/);
    expect(scan).not.toContain("resale comps");
  });
});
