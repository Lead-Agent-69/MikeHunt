import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("discover personal flip lead", () => {
  it("keeps Discover off ask-based flip profit for personal buyers", () => {
    const route = readFileSync("app/api/discover/hero/route.ts", "utf8");
    const hero = readFileSync("components/discovery/DiscoverHero.tsx", "utf8");
    const spotlight = readFileSync(
      "components/deal/NextBestBuySpotlight.tsx",
      "utf8",
    );
    const gate = readFileSync("lib/buyer/flip-lead.ts", "utf8");

    // #8/#9 already removed profit totals and invented buy copy. Do not put them back.
    expect(route).not.toContain("true_net_profit");
    expect(route).not.toContain("totalProfit");
    expect(route).toContain("This does not sum profit");
    expect(hero).toContain("This is not money you can make.");
    expect(hero).not.toContain("Sold-comp profit");
    expect(spotlight).not.toContain("deal.trueNetProfit");
    expect(spotlight).not.toContain("showFlipMoney");
    expect(spotlight).toContain(
      "Not a buy until condition and the all-in price are checked.",
    );
    // Reseller/dealer is the only mode allowed to keep a flip lead later.
    expect(gate).toContain("export function isFlipBuyerMode");
    expect(gate).toContain("export function isSoldCompAnchored");
  });
});