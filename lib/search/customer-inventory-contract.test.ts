import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BUYER_COLLECTIONS = [
  "app/api/alerts/profit-sniper/route.ts",
  "app/api/arbitrage/route.ts",
  "app/api/dashboard/summary/route.ts",
  "app/api/deal-check/route.ts",
  "app/api/deals/route.ts",
  "app/api/deals/[id]/similar/route.ts",
  "app/api/deals/[id]/sources/route.ts",
  "app/api/deals/best-buy/route.ts",
  "app/api/deals/lane/route.ts",
  "app/api/deals/map/route.ts",
  "app/api/deals/near/route.ts",
  "app/api/discover/hero/route.ts",
  "app/api/feed/route.ts",
  "app/api/find-similar/route.ts",
  "app/api/market/analyst/route.ts",
  "app/api/market/compare/route.ts",
  "app/api/market/depreciation/route.ts",
  "app/api/market/explore/route.ts",
  "app/api/market/heatmap/route.ts",
  "app/api/market/overview/route.ts",
  "app/api/market/snapshot/route.ts",
  "app/api/market/ticker/route.ts",
  "app/api/mcp/route.ts",
  "app/api/mispricing/route.ts",
  "app/api/parts/teardown/route.ts",
  "app/api/public/v1/deals/route.ts",
  "app/api/reco/for-you/route.ts",
  "app/api/recommendations/route.ts",
  "app/api/scan/route.ts",
  "app/api/scan/facets/route.ts",
  "app/api/state-counts/route.ts",
  "app/api/stats/verticals/route.ts",
  "app/api/value/[vin]/route.ts",
] as const;

const POLICY_ENTRY =
  /applyBuyableInventory|applyInventoryViewScope|new DealsService\(/;

describe("buyer inventory route contract", () => {
  it.each(BUYER_COLLECTIONS)(
    "%s enters through the canonical buyable-inventory policy",
    (relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source).toMatch(POLICY_ENTRY);
    },
  );

  it("keeps shared view and service abstractions on the same policy", () => {
    for (const relativePath of [
      "lib/data/deals-service.ts",
      "lib/search/inventory-view-scope.ts",
      "lib/deals/similar-deals.ts",
      "lib/scoring/market-intelligence.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).toContain("applyBuyableInventory");
    }
  });
});
