import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("/find never prints a profit when comps are unverified", () => {
  const page = read("app/(dashboard)/find/page.tsx");
  const card = read("components/shared/DealCard.tsx");

  it("find header + cards share one needsComps rule", () => {
    expect(page).toContain("function needsComps(");
    expect(page).toContain("— Needs comps");
    expect(page).toContain("needsComps={needsComps(");
    expect(page).toContain('deal.dealAnalysis?.sellBasis !== "comps"');
    // must tolerate the API withholding profit (null)
    expect(page).toContain("potentialProfit == null");
    expect(page).not.toMatch(/potentialProfit\.toLocaleString\(\)/);
  });

  it("DealCard renders an em dash, not a signed number, when needsComps", () => {
    expect(card).toContain("needsComps = false");
    expect(card).toMatch(/needsComps \? \(/);
    expect(card).toContain("!needsComps && recommendedMaxBid != null");
  });
});
