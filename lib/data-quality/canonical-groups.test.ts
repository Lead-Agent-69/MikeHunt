import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { groupSameCar } from "./canonical-groups";

const ids = (groups: { id?: string | null }[][]) =>
  groups.map((g) => g.map((r) => r.id).sort()).sort();

describe("groupSameCar", () => {
  it("merges VIN matches and duplicate_of_id links, keeps the rest apart", () => {
    const rows = [
      { id: "a", vin: "1C6SRFFT9KN678617" },
      { id: "b", vin: "1c6srfft9kn678617" },
      { id: "c", vin: null, duplicate_of_id: "a" },
      { id: "d", vin: null },
      { id: "e", vin: "SHORT" },
      { id: "f", vin: "SHORT" },
    ];
    expect(ids(groupSameCar(rows))).toEqual([
      ["a", "b", "c"],
      ["d"],
      ["e"],
      ["f"],
    ]);
  });

  it("groups copies of a canonical row even when the canonical isn't in the pool", () => {
    const rows = [
      { id: "x", duplicate_of_id: "root" },
      { id: "y", duplicate_of_id: "root" },
    ];
    expect(ids(groupSameCar(rows))).toEqual([["x", "y"]]);
  });

  it("never VIN-merges a VIN conflict", () => {
    const rows = [
      { id: "a", vin: "1FTFW1EF5FFA00001", quality_flags: ["vin_conflict"] },
      { id: "b", vin: "1FTFW1EF5FFA00001", quality_flags: ["vin_conflict"] },
    ];
    expect(ids(groupSameCar(rows))).toEqual([["a"], ["b"]]);
  });
});

describe("dedup migration", () => {
  const sql = readFileSync(
    "supabase/migrations/20261010220000_deals_cross_source_dedup.sql",
    "utf8",
  );
  it("links, never deletes or deactivates", () => {
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.deals/i);
    expect(sql).not.toMatch(/SET\s+active\s*=/i);
    expect(sql).toContain("duplicate_of_id = s.canon_id");
  });
  it("flags VIN conflicts instead of merging", () => {
    expect(sql).toContain("'vin_conflict'");
    expect(sql).toContain("count(DISTINCT d.year) > 1");
  });
  it("fuzzy rules: cross-host, 3% price, 2% miles, >= 1,000 miles, different VINs never match", () => {
    expect(sql).toContain("b.host IS DISTINCT FROM a.host");
    expect(sql).toContain("0.03 * greatest(a.price, b.price)");
    expect(sql).toContain("0.02 * greatest(a.miles, b.miles)");
    expect(sql).toContain("d.mileage >= 1000");
    expect(sql).toContain("(a.vin IS NULL OR b.vin IS NULL OR a.vin = b.vin)");
  });
  it("is service_role only and adds no index", () => {
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.dedupe_deals(uuid[]) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.dedupe_deals(uuid[]) TO service_role;",
    );
    expect(sql).not.toMatch(/CREATE\s+INDEX/i);
  });
  it("counts canonical rows only", () => {
    expect(sql).toContain(
      "d.active AND d.location_state IS NOT NULL AND d.duplicate_of_id IS NULL",
    );
    expect(sql).toContain(
      "first_seen_at, auction_end_at, options, duplicate_of_id, quality_flags",
    );
  });
});

describe("readers use canonical rows", () => {
  for (const f of [
    "app/api/feed/route.ts",
    "app/api/reco/for-you/route.ts",
    "app/api/recommendations/route.ts",
    "app/api/dashboard/summary/route.ts",
    "app/api/discover/hero/route.ts",
    "app/api/stats/verticals/route.ts",
    "app/api/market/ticker/route.ts",
  ]) {
    it(f, () => {
      expect(readFileSync(f, "utf8")).toContain('.is("duplicate_of_id", null)');
    });
  }
  it("valuation comps count a linked copy once", () => {
    expect(readFileSync("lib/scoring/market-value.ts", "utf8")).toContain(
      "!r.duplicate_of_id &&",
    );
  });
  it("Discover groups copies under one card", () => {
    expect(readFileSync("app/api/discover/route.ts", "utf8")).toContain(
      "groupSameCar(rows)",
    );
  });
  it("the pipeline runs dedupe_deals on the rows it wrote, VIN-only fallback before the migration", () => {
    const src = readFileSync("lib/scrapers/pipeline.ts", "utf8");
    expect(src).toContain('sb.rpc("dedupe_deals", { p_ids: ids })');
    expect(src).toContain('"detect_duplicates_by_vin"');
  });
});
