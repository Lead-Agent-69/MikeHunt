import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARKET_CANDIDATE_FIELDS } from "./candidate-projection";

const migration = readFileSync(
  "supabase/migrations/20261105094153_market_candidate_projection.sql",
  "utf8",
);
const legacy = readFileSync(
  "supabase/tests/market-candidate-legacy-select.txt",
  "utf8",
);
describe("Market candidate projection contract", () => {
  it("keeps every original response field without returning the source blobs", () => {
    expect(MARKET_CANDIDATE_FIELDS.split(",").sort()).toEqual(
      legacy
        .split(",")
        .map((field) => field.trim().split(":")[0])
        .sort(),
    );
    expect(MARKET_CANDIDATE_FIELDS.split(",")).not.toContain("options");
    expect(MARKET_CANDIDATE_FIELDS.split(",")).not.toContain("deal_analysis");
  });
  it("expands each guarded JSON root once and preserves evidence JSON types", () => {
    expect(migration.match(/jsonb_to_record\(/g)).toHaveLength(2);
    for (const root of ["options", "deal_analysis"])
      expect(migration).toContain(
        `case when jsonb_typeof(d.${root}) = 'object' then d.${root} else '{}'::jsonb end`,
      );
    for (const field of [
      '"priceEvidence"',
      "valuation",
      '"acquisitionPriceMissing"',
      '"priceImplausible"',
      "roi",
    ])
      expect(migration).toContain(`${field} jsonb`);
    expect(migration).toContain("d.*,");
  });
  it("is a non-materialized, server-only invoker view", () => {
    expect(migration).toContain("with (security_invoker = true)");
    expect(migration).toContain(
      "revoke all on public.market_candidate_projection from public, anon, authenticated, service_role;",
    );
    expect(migration).toContain(
      "grant select on public.market_candidate_projection to service_role;",
    );
    expect(migration).not.toMatch(
      /create\s+(materialized|index)|security\s+definer/i,
    );
  });
});
