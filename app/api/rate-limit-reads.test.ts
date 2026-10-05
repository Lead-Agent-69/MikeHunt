import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const FILES = [
  "app/api/deals/route.ts",
  "app/api/deals/map/route.ts",
  "app/api/deals/best-buy/route.ts",
  "app/api/flash-deals/route.ts",
  "app/api/sold/route.ts",
  "app/api/state-counts/route.ts",
  "app/api/dealer-network/route.ts",
  "app/api/dealers/search/route.ts",
  "app/api/geographic/arbitrage/route.ts",
  "app/api/transport/quote/route.ts",
  "app/api/deal/max-bid/route.ts",
  "app/api/parts/teardown/route.ts",
  "app/api/scrape/plan/route.ts",
  "app/api/market/explore/route.ts",
  "app/api/market/heatmap/route.ts",
  "app/api/market/pulse/route.ts",
  "app/api/market/ticker/route.ts",
];

describe("public read-heavy routes are rate-limited", () => {
  it.each(FILES)("%s calls rateLimit", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toContain("rateLimit");
    expect(src).toContain("tooManyRequests");
  });
});
