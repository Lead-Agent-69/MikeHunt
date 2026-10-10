import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ingestCondition, normalizeAuctionEndAt } from "./pipeline";

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

describe("ingestCondition", () => {
  it("stores unknown condition as null, never a run_drive default", () => {
    expect(ingestCondition({})).toEqual({
      condition: null,
      titleSource: undefined,
    });
    expect(ingestCondition({ condition: "mystery" }).condition).toBeNull();
    expect(ingestCondition({ condition: "certified" }).condition).toBeNull();
    const src = readFileSync("lib/scrapers/pipeline.ts", "utf8");
    expect(src).not.toMatch(/\?\?\s*"run_drive"/);
  });

  it("keeps provenance only when there is a condition", () => {
    expect(
      ingestCondition({
        condition: "salvage_title",
        title_source: "source_default",
      }),
    ).toEqual({ condition: "salvage_title", titleSource: "source_default" });
    expect(
      ingestCondition({ condition: "Clean Title", title_source: "listing" }),
    ).toEqual({ condition: "clean_title", titleSource: "listing" });
    expect(
      ingestCondition({
        condition: "certified",
        title_source: "source_default",
      }),
    ).toEqual({ condition: null, titleSource: undefined });
    expect(
      ingestCondition({
        condition: "clean_title",
        title_source: "bogus" as any,
      }),
    ).toEqual({ condition: "clean_title", titleSource: undefined });
  });
});
