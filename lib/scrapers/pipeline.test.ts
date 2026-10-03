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
