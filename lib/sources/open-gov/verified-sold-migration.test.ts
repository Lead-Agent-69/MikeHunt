import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020010916_verified_sold_evidence.sql",
  ),
  "utf8",
);

describe("verified sold evidence migration", () => {
  it("keeps government rows attributed and separate from retail evidence", () => {
    expect(sql).toMatch(/basis IN \('sold', 'removed', 'last_bid'\)/);
    expect(sql).toMatch(/sale_channel IS NULL OR attribution IS NOT NULL/);
    expect(sql).toMatch(/basis = 'sold' AND sale_channel IS NULL/);
    expect(sql).toMatch(/gov_impound_auction[\s\S]*gov_norfolk_impound/);
  });

  it("preserves the existing server-only boundary", () => {
    expect(sql).toMatch(/sold_listings RLS must remain enabled/);
    expect(sql).toMatch(/sold_listings must remain server-only/);
    expect(sql).toMatch(/has_table_privilege\('anon'/);
    expect(sql).toMatch(/has_table_privilege\('authenticated'/);
  });
});
