import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("read-only data audit", () => {
  const script = readFileSync("scripts/audit-data-quality.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20261023112321_inventory_quality_rollup_v1.sql",
    "utf8",
  );
  it("fails on query errors instead of silently reporting a clean audit", () => {
    expect(script).toContain("if (qualityResult.error)");
    expect(script).toContain("if (sourceResult.error)");
    expect(script).toContain("process.exitCode = 1");
  });
  it("uses bounded service-only rollups instead of downloading inventory", () => {
    expect(script).toContain('db.rpc("inventory_quality_rollup_v1")');
    expect(script).toContain('db.rpc("scrape_health_inventory_rollup_v2"');
    expect(script).not.toContain('.from("deals")');
    expect(script).not.toContain("fetchAllRows");
    expect(script).not.toContain("find_duplicate_vins");
    expect(migration).toContain("with base as (");
    expect(migration).toContain(
      "revoke all on function public.inventory_quality_rollup_v1()",
    );
    expect(migration).toContain("to service_role");
  });
  it("reports evidence gaps even below the former display thresholds", () => {
    expect(script).not.toContain("percentage > 50");
    expect(script).not.toContain("percentage > 30");
    expect(script).toContain("This is not verification of title");
    expect(script).not.toContain("No data quality issues found!");
  });
});
