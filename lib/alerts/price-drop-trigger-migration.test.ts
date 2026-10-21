import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261021101500_fix_price_drop_alert_format.sql";

describe("price-drop alert trigger migration", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("formats a one-decimal percentage without unsupported printf syntax", () => {
    expect(sql).toContain("to_char(drop_pct, 'FM999999990.0')");
    expect(sql).toContain("'Price dropped $%s (%s%%)'");
    expect(sql).toContain("prev_price > 0");
    expect(sql).not.toContain("%.1f");
  });

  it("keeps the trigger function on a fixed search path", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.record_price_drop_alert\(\)[\s\S]*SET search_path = pg_catalog, public/,
    );
  });
});
