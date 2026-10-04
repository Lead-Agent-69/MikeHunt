import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("next best buy honesty", () => {
  it("does not invent a score, an 88% offer, or a turn-time by make", () => {
    const route = readFileSync("app/api/deals/best-buy/route.ts", "utf8");
    const spotlight = readFileSync(
      "components/deal/NextBestBuySpotlight.tsx",
      "utf8",
    );
    const page = readFileSync("app/(dashboard)/best-buy/page.tsx", "utf8");

    expect(route).not.toContain("?? 85");
    expect(route).not.toContain("ask * 0.88");
    expect(route).not.toContain("calculateLiquidityScore");
    expect(route).toContain("One listing to check first.");
    expect(spotlight).toContain(
      "Not a buy until condition and the all-in price are checked.",
    );
    expect(spotlight).not.toContain("Highest Margin Flip");
    expect(page).not.toContain("Automated Opportunity Engine");
    expect(page).not.toContain("Fast Turn");
    expect(page).not.toContain("every 18 days");
    expect(page).not.toContain("useState<number>(15000)");
  });
});
