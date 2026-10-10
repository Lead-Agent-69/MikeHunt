import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");

describe("Deal detail buyer math for non-flip modes", () => {
  it("derives the flip flag from the saved-mode desk", () => {
    expect(page).toContain('const flipBuyerMath = store.userType === "dealer";');
  });

  it("does not say 'bid' to personal / DIY / parts buyers", () => {
    expect(page).not.toContain("buyer math before you bid.");
    expect(page).toContain('{flipBuyerMath ? "bid" : "buy"}');
    expect(page).toContain(
      '`${flipBuyerMath ? "Tighten before bidding" : "Check before you buy"}:',
    );
  });

  it("hides the Resale line and resale gap outside flip desks", () => {
    expect(page).toMatch(
      /\{flipBuyerMath && \(\s*<>\s*<span className="text-\[var\(--t4\)\]">Resale<\/span>/,
    );
    expect(page).toContain('flipBuyerMath && !resaleBasis ? "market value" : null');
  });
});
