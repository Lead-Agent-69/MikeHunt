import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeAuctionEndAt } from "./pipeline";

describe("normalizeAuctionEndAt", () => {
  it("normalizes valid auction dates to ISO strings", () => {
    expect(normalizeAuctionEndAt("2026-07-01T17:00:00Z")).toBe(
      "2026-07-01T17:00:00.000Z",
    );
  });

  it("accepts Date instances", () => {
    expect(normalizeAuctionEndAt(new Date("2026-07-01T17:00:00Z"))).toBe(
      "2026-07-01T17:00:00.000Z",
    );
  });

  it("returns null for empty or invalid auction dates", () => {
    expect(normalizeAuctionEndAt("")).toBeNull();
    expect(normalizeAuctionEndAt("not a date")).toBeNull();
  });
});

describe("scoped persistence receipts", () => {
  it("reports accepted rows rather than attempted rows", () => {
    const pipeline = readFileSync("lib/scrapers/pipeline.ts", "utf8");
    const sources = readFileSync("lib/scrapers/sources/index.ts", "utf8");

    expect(pipeline).toContain("return returnedRows.length");
    expect(sources).toContain("const saved = allDeals.length");
    expect(sources).toContain("return saved");
  });
});

describe("auctionEndedLongAgo", () => {
  const NOW = Date.parse("2026-10-10T02:00:00Z");
  it("is false for fixed-price rows and live or just-ended auctions", async () => {
    const { auctionEndedLongAgo } = await import("./pipeline");
    expect(auctionEndedLongAgo(null, NOW)).toBe(false);
    expect(auctionEndedLongAgo("2026-10-11T00:00:00Z", NOW)).toBe(false);
    expect(auctionEndedLongAgo("2026-10-09T22:00:00Z", NOW)).toBe(false); // 4h ago, grace
    expect(auctionEndedLongAgo("garbage", NOW)).toBe(false);
  });
  it("is true once the auction closed more than 6h ago", async () => {
    const { auctionEndedLongAgo } = await import("./pipeline");
    expect(auctionEndedLongAgo("2026-10-09T18:00:00Z", NOW)).toBe(true);
    expect(auctionEndedLongAgo(new Date("2026-10-01T00:00:00Z"), NOW)).toBe(
      true,
    );
  });
});
