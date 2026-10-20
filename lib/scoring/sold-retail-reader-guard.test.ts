import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RETAIL_READERS = [
  "app/api/arbitrage/route.ts",
  "app/api/market/sold/route.ts",
  "app/api/sold/route.ts",
  "app/api/system/status/route.ts",
  "lib/scoring/market-value.ts",
];

describe("retail sold evidence readers", () => {
  it.each(RETAIL_READERS)(
    "%s keeps government auctions out of retail valuation math",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("withRetailSold");
      expect(source).toContain("applyRetailSoldScope");
    },
  );
});
