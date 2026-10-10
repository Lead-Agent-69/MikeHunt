import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { primaryJobForPath } from "@/components/layout/nav-items";

const read = (path: string) => readFileSync(path, "utf8");

describe("Auction Lane UI honesty", () => {
  const page = read("app/(dashboard)/lane/page.tsx");

  it("never paints negative/zero profit green", () => {
    expect(page).toContain("profitColor(activeDeal.true_net_profit)");
    expect(page).not.toMatch(
      /text-\[var\(--green\)\]">\s*\{fmt\(activeDeal\.true_net_profit\)\}/,
    );
  });

  it("drops the Live claim and is honest when no comps are on file", () => {
    expect(page).not.toContain("Live Sold Comps");
    expect(page).toContain('"Sold comps"');
    expect(page).toContain("No sold comparisons on file");
    expect(page).not.toContain("No comps found for");
  });

  it("renders missing/zero max bid and resale as an em dash with Needs comps", () => {
    expect(page).toContain("fmtOrDash(activeDeal.recommended_max_bid)");
    expect(page).toContain("fmtOrDash(activeDeal.sell_estimate)");
    expect(page).toContain("fmtOrDash(deal.recommended_max_bid)");
    expect(page).toContain("Needs comps");
  });
});

describe("TopNav active route", () => {
  it("does not highlight Discover on /arbitrage", () => {
    expect(primaryJobForPath("/arbitrage")).not.toBe("Discover");
    expect(primaryJobForPath("/arbitrage")).toBe("Auction Lane");
    expect(primaryJobForPath("/discover")).toBe("Discover");
    expect(primaryJobForPath("/lane")).toBe("Auction Lane");
  });
});
