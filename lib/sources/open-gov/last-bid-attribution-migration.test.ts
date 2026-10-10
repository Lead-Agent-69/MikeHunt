import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261010411000_sold_listings_last_bid_attribution.sql",
  "utf8",
);

describe("20261010411000 last_bid attribution constraint", () => {
  it("adds the constraint in one ALTER inside a transaction", () => {
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS sold_listings_last_bid_attribution,\s*ADD CONSTRAINT sold_listings_last_bid_attribution\s*CHECK \(basis <> 'last_bid' OR attribution IS NOT NULL\)/,
    );
  });
  it("self-check verifies both credit constraints by definition, not just by name", () => {
    expect(sql.match(/pg_get_constraintdef/g)?.length).toBeGreaterThanOrEqual(
      3,
    );
    expect(sql).toContain("sold_listings_gov_attribution");
    expect(sql).toContain("convalidated");
  });
});
