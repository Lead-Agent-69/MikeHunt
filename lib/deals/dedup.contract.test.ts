// Contract for cross-source dedup on `deals`, written against the CURRENT schema.
//
// deals.duplicate_of_id + duplicate_confidence link copies to one canonical row; upsertDeals runs
// public.dedupe_deals (20261010220000) on the rows it wrote: exact VIN (check-digit valid only),
// then fuzzy cross-source. VIN conflicts (same VIN, different make or years 2+ apart) are FLAGGED in
// quality_flags ('vin_conflict'), never merged. lib/deals/dedup.ts (planVinDedup) is the pure TS
// mirror of the VIN step. The old detect_duplicates_by_vin now delegates to dedupe_deals.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DEALS_SERVER_ONLY_COLUMNS } from "./deals-public-columns";
import samples from "./__fixtures__/prod-deal-samples.json";
import { latestFunctionSql } from "./__fixtures__/migration-sql";
import { planVinDedup } from "./dedup";
import { groupSameCar } from "@/lib/data-quality/canonical-groups";

const dealsRowType = () => {
  const src = readFileSync("types/supabase.ts", "utf8");
  const start = src.indexOf("      deals: {");
  const row = src.slice(start, src.indexOf("Insert: {", start));
  return row;
};

describe("dedup: schema and SQL", () => {
  it("deals has duplicate_of_id and duplicate_confidence, both server-only", () => {
    const row = dealsRowType();
    expect(row).toMatch(/duplicate_of_id: string \| null/);
    expect(row).toMatch(/duplicate_confidence: number \| null/);
    expect(DEALS_SERVER_ONLY_COLUMNS).toEqual(
      expect.arrayContaining(["duplicate_of_id", "duplicate_confidence"]),
    );
  });

  it("conflicts and sanity reasons live in quality_flags (no extra vin_conflict / dedup_reason column)", () => {
    const row = dealsRowType();
    expect(row).toMatch(/quality_flags: string\[\] \| null/);
    expect(row).not.toMatch(/\bvin_conflict\b/);
    expect(row).not.toMatch(/\bdedup_reason\b/);
  });

  it("detect_duplicates_by_vin now delegates to dedupe_deals (no VIN-only grouping left)", () => {
    const { file, sql } = latestFunctionSql("detect_duplicates_by_vin");
    expect(file).toBe("20261010221000_dedupe_ren_nits.sql");
    expect(sql).toContain("PERFORM public.dedupe_deals(");
    expect(sql).not.toMatch(/GROUP BY vin\s/);
    // Ren #307 P3: same VIN normalization as vin_check_digit_ok / normalizeVin.
    expect(sql).toContain("upper(regexp_replace(d.vin, '[\\s-]', '', 'g'))");
    expect(sql).not.toContain("btrim(d.vin)");
  });

  it("Ren #307 nits: no function-level statement_timeout, one VIN key, conflict rows cleared like flagged rows", () => {
    const { file, sql } = latestFunctionSql("dedupe_deals");
    expect(file).toBe("20261010221000_dedupe_ren_nits.sql");
    expect(sql).not.toMatch(/statement_timeout/i);
    expect(sql).not.toContain("btrim(d.vin)");
    for (const col of [
      "true_net_profit = NULL",
      "recommended_max_bid = NULL",
      "sell_estimate = NULL",
      "deal_verdict = 'pass'",
    ])
      expect(sql).toContain(col);
    const mig = readFileSync(
      "supabase/migrations/20261010221000_dedupe_ren_nits.sql",
      "utf8",
    );
    expect(mig).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_market_pulse\(\) FROM PUBLIC, anon, authenticated;/,
    );
    // every get_market_pulse caller uses the service-role client
    for (const f of [
      "app/api/market/pulse/route.ts",
      "app/api/market/ticker/route.ts",
      "app/api/mcp/route.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      if (src.includes('rpc("get_market_pulse")'))
        expect(src).toContain("createServerComponentClient()");
    }
  });

  it("dedupe_deals: earliest-seen active row is canonical, confidence 1.0, conflicts flagged", () => {
    const { sql } = latestFunctionSql("dedupe_deals");
    expect(sql).toMatch(
      /ORDER BY coalesce\(d\.active, false\) DESC, d\.first_seen_at ASC, d\.id ASC/,
    );
    expect(sql).toContain("ELSE 1.000 END");
    expect(sql).toContain("public.vin_check_digit_ok(d.vin)");
    expect(sql).toContain(
      "count(DISTINCT lower(btrim(d.make))) > 1 OR max(d.year) - min(d.year) >= 2",
    );
    expect(sql).toContain(
      "array_append(coalesce(d.quality_flags, '{}'), 'vin_conflict')",
    );
  });

  it("upsertDeals runs dedupe_deals on the rows it wrote (VIN-only fallback before the migration)", () => {
    const src = readFileSync("lib/scrapers/pipeline.ts", "utf8");
    expect(src).toContain('sb.rpc("dedupe_deals", { p_ids: ids })');
    expect(src).toContain('rpc("detect_duplicates_by_vin", {');
    expect(src).toContain("vin_filter: vins");
  });

  it("public readers hide non-canonical rows (filter duplicate_of_id)", () => {
    const hits = ["app", "lib"].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
        .filter((f) =>
          /\.is\(\s*["']duplicate_of_id["']/.test(
            readFileSync(join(dir, f), "utf8"),
          ),
        )
        .map((f) => `${dir}/${f}`),
    );
    for (const f of [
      "lib/data/deals-service.ts", // /api/deals list, search, hot
      "app/api/scan/route.ts", // search
      "app/api/feed/route.ts",
      "app/api/reco/for-you/route.ts",
      "app/api/recommendations/route.ts",
      "app/api/dashboard/summary/route.ts",
      "app/api/stats/verticals/route.ts",
    ])
      expect(hits).toContain(f);
  });
});

// ---- coming dedup layer ------------------------------------------------------------------------
type DedupRow = {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  created_at: string;
  duplicate_of_id?: string | null;
};
type DedupPlan = {
  canonical: string[];
  pointers: Array<{ id: string; duplicate_of_id: string }>;
  conflicts: Array<{ vin: string; ids: string[]; reason: string }>;
};
const loadPlanner = async (): Promise<(rows: DedupRow[]) => DedupPlan> =>
  planVinDedup;

// Built from the real prod 2016 F-250 row (VIN 1FT7W2BT8GED11804). The second and third rows are
// constructed: a re-listing of the same truck on another source, and a same-VIN row whose
// make/model disagree (what a mistyped or recycled VIN looks like).
const f250 = samples.rows.normal_f250;
const original: DedupRow = {
  id: f250.id,
  vin: f250.vin,
  year: f250.year,
  make: f250.make,
  model: f250.model,
  created_at: f250.first_seen_at,
};
const relist: DedupRow = {
  ...original,
  id: "00000000-0000-4000-8000-000000000002",
  created_at: "2026-10-05T00:00:00Z",
};
const conflict: DedupRow = {
  ...original,
  id: "00000000-0000-4000-8000-000000000003",
  make: "Chevrolet",
  model: "Silverado 2500HD",
  created_at: "2026-10-06T00:00:00Z",
};

describe("dedup: VIN planner (lib/deals/dedup.ts)", () => {
  it("same VIN + same vehicle: earliest row is canonical, the later one points at it", async () => {
    const plan = (await loadPlanner())([relist, original]);
    expect(plan.canonical).toEqual([original.id]);
    expect(plan.pointers).toEqual([
      { id: relist.id, duplicate_of_id: original.id },
    ]);
    expect(plan.conflicts).toEqual([]);
  });

  it("same VIN, different make/model: flagged as a conflict, never merged", async () => {
    const plan = (await loadPlanner())([original, conflict]);
    expect(plan.pointers).toEqual([]);
    expect(plan.conflicts).toEqual([
      expect.objectContaining({
        vin: original.vin,
        ids: expect.arrayContaining([original.id, conflict.id]),
      }),
    ]);
  });

  it("pointers never chain: a third copy points at the canonical, not at another duplicate", async () => {
    const third = {
      ...relist,
      id: "00000000-0000-4000-8000-000000000004",
      created_at: "2026-10-07T00:00:00Z",
    };
    const plan = (await loadPlanner())([
      original,
      { ...relist, duplicate_of_id: original.id },
      third,
    ]);
    expect(plan.pointers.every((p) => p.duplicate_of_id === original.id)).toBe(
      true,
    );
  });

  it("is idempotent: re-running on its own output changes nothing", async () => {
    const plan1 = (await loadPlanner())([original, relist]);
    const applied = [original, { ...relist, duplicate_of_id: original.id }];
    const plan2 = (await loadPlanner())(applied);
    expect(plan2.pointers).toEqual(plan1.pointers);
  });

  it("rows without a valid VIN are never grouped", async () => {
    const a = { ...original, vin: null };
    const b = { ...relist, vin: null };
    const bad = {
      ...relist,
      id: "00000000-0000-4000-8000-000000000005",
      vin: samples.rows.bad_check_digit_vin.vin,
    };
    const plan = (await loadPlanner())([
      a,
      b,
      bad,
      { ...bad, id: "00000000-0000-4000-8000-000000000006" },
    ]);
    expect(plan.pointers).toEqual([]);
  });

  it("a year off by one (model year vs listed year) is the same vehicle; off by 2+ is a conflict", async () => {
    const plan = await loadPlanner();
    const offByOne = { ...relist, year: (original.year as number) + 1 };
    expect(plan([original, offByOne]).pointers).toEqual([
      { id: relist.id, duplicate_of_id: original.id },
    ]);
    const offByTwo = { ...relist, year: (original.year as number) + 2 };
    const p2 = plan([original, offByTwo]);
    expect(p2.pointers).toEqual([]);
    expect(p2.conflicts[0].reason).toMatch(/2\+ apart/);
  });
  it("when the canonical row is deleted by retention, the oldest remaining copy is promoted", async () => {
    const third = {
      ...relist,
      id: "00000000-0000-4000-8000-000000000004",
      created_at: "2026-10-07T00:00:00Z",
    };
    // original is gone; relist and third still point at it
    const plan = (await loadPlanner())([
      { ...relist, duplicate_of_id: original.id },
      { ...third, duplicate_of_id: original.id },
    ]);
    expect(plan.canonical).toEqual([relist.id]);
    expect(plan.pointers).toEqual([
      { id: third.id, duplicate_of_id: relist.id },
    ]);
    // and the SQL releases dangling pointers
    expect(latestFunctionSql("dedupe_deals").sql).toContain(
      "NOT EXISTS (SELECT 1 FROM public.deals c WHERE c.id = d.duplicate_of_id)",
    );
  });
  it("public feeds (/api/deals, discover, search) return only canonical rows", () => {
    for (const f of ["lib/data/deals-service.ts", "app/api/scan/route.ts"])
      expect(readFileSync(f, "utf8")).toContain('.is("duplicate_of_id", null)');
    // Discover groups linked copies under one card (the RPC returns duplicate_of_id)
    expect(readFileSync("app/api/discover/route.ts", "utf8")).toContain(
      "groupSameCar(rows)",
    );
    const cards = groupSameCar([
      { id: original.id, vin: original.vin },
      { id: relist.id, vin: null, duplicate_of_id: original.id },
      { id: conflict.id, vin: original.vin, quality_flags: ["vin_conflict"] },
    ]);
    expect(cards.map((g) => g.map((r) => r.id).sort())).toEqual([
      [relist.id, original.id].sort(),
      [conflict.id],
    ]);
  });
  it("conflict rows surface in the admin data-quality view with both source URLs", () => {
    const src = readFileSync("app/api/admin/data-quality/route.ts", "utf8");
    expect(src).toContain("canManageOperations(req)");
    expect(src).toContain('.contains("quality_flags", ["vin_conflict"])');
    expect(src).toContain("source_url");
  });
});
