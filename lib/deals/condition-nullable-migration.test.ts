import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITE_TYPE_DEFAULTS } from "@/lib/scrapers/curated-sites";

const sql = readFileSync(
  "supabase/migrations/20261010060000_deals_condition_nullable_dealer_inventory.sql",
  "utf8",
);
const fn = sql.slice(
  sql.indexOf("CREATE OR REPLACE FUNCTION public.dealer_inventory()"),
  sql.indexOf("$$;") + 3,
);

describe("deals condition nullable + dealer_inventory migration", () => {
  it("drops NOT NULL on deals.condition inside one transaction", () => {
    expect(sql).toContain(
      "ALTER TABLE public.deals ALTER COLUMN condition DROP NOT NULL;",
    );
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });

  it("dealer_inventory buckets on the exact enum and never counts run_drive as clean", () => {
    expect(fn).not.toMatch(/run_drive/);
    expect(fn).not.toMatch(/ILIKE/i);
    expect(fn).toContain("x.cond = 'clean_title'");
    expect(fn).toContain("x.cond = 'rebuilt_title'");
    expect(fn).toContain("x.cond = 'salvage_title'");
    expect(fn).toContain("x.cond = 'parts_only'");
  });

  it("keeps dealer_inventory service-role only (no client grants)", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.dealer_inventory() FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).not.toMatch(
      /GRANT[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i,
    );
  });

  it("independent dealers no longer assume a run_drive condition", () => {
    expect(SITE_TYPE_DEFAULTS.independent_dealer.condition).toBeUndefined();
  });
});
