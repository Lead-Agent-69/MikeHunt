import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  "supabase/migrations/20261022174249_prioritize_saved_inventory_demand.sql",
  "utf8",
);

describe("saved-inventory scrape demand migration", () => {
  it("prioritizes explicit user intent without returning account identifiers", () => {
    expect(SQL).toContain("JOIN public.saved_cars");
    expect(SQL).toContain("JOIN public.watchlist");
    expect(SQL).toContain("JOIN public.user_saved_searches");
    expect(SQL).toContain("'saved'::text");
    expect(SQL).toContain("'watchlist'::text");
    expect(SQL).toContain("'saved_search'::text");
    expect(SQL).toMatch(
      /RETURNS TABLE\(state text, zip3 text, kind text, weight double precision, users bigint\)/,
    );
  });

  it("keeps the aggregate internal and uses a fixed search path", () => {
    expect(SQL).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.scrape_demand(integer) FROM PUBLIC, anon, authenticated",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.scrape_demand(integer) TO service_role",
    );
    expect(SQL).toContain("scrape_demand must remain service-role only");
  });

  it("only treats active saved intent as refresh demand", () => {
    expect(SQL).toContain(
      "sc.status IN ('active', 'watching', 'price_drop', 'price_increase', 'ending_soon')",
    );
    expect(SQL).toContain("ss.is_active = true");
  });
});
