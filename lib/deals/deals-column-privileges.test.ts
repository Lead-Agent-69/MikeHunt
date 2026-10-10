import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEALS_PUBLIC_COLUMNS,
  DEALS_SERVER_ONLY_COLUMNS,
} from "./deals-public-columns";

const MIGRATION = "supabase/migrations/20261010020000_deals_column_grants.sql";
const sql = readFileSync(MIGRATION, "utf8");

function grantedColumns(): string[] {
  const m = sql.match(
    /GRANT SELECT \(([^)]*)\) ON public\.deals TO anon, authenticated;/,
  );
  expect(m).not.toBeNull();
  return m![1]
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function guardColumns(): string[] {
  const i = sql.indexOf("c.column_name = ANY (ARRAY[");
  expect(i).toBeGreaterThan(-1);
  const end = sql.indexOf("]", i);
  return Array.from(sql.slice(i, end).matchAll(/'([a-z_]+)'/g), (m) => m[1]);
}

describe("deals column grants migration", () => {
  it("revokes table-wide SELECT from anon and authenticated, leaves service_role alone", () => {
    expect(sql).toContain(
      "REVOKE SELECT ON public.deals FROM anon, authenticated;",
    );
    expect(sql).not.toMatch(/GRANT SELECT ON public\.deals TO/i);
    expect(sql).not.toMatch(/REVOKE[^;]*service_role/i);
  });

  it("grants exactly DEALS_PUBLIC_COLUMNS (Ren's list)", () => {
    expect(grantedColumns()).toEqual([...DEALS_PUBLIC_COLUMNS]);
  });

  it("never grants a server-only column", () => {
    for (const c of DEALS_SERVER_ONLY_COLUMNS) {
      expect(DEALS_PUBLIC_COLUMNS as readonly string[]).not.toContain(c);
    }
    for (const c of [
      "embedding",
      "lat",
      "lng",
      "location",
      "location_zip",
      "pricing_breakdown",
      "options",
      "dealer_id",
      "source_deal_id",
      "duplicate_of_id",
      "duplicate_confidence",
      "flash_alert_sent",
      "images_cached",
      "kbb_trade_in",
      "kbb_retail",
      "cargurus_price",
      "mmr_value",
      "estimated_transport_cost",
      "estimated_repair_cost",
      "true_net_profit",
      "profit_score",
      "deal_analysis",
    ]) {
      expect(DEALS_SERVER_ONLY_COLUMNS as readonly string[]).toContain(c);
    }
  });

  it("guard block fails the migration if any server-only column stays selectable", () => {
    expect(guardColumns().sort()).toEqual(
      [...DEALS_SERVER_ONLY_COLUMNS].sort(),
    );
    expect(sql).toContain(
      "has_column_privilege(r.rolname, 'public.deals', c.column_name, 'SELECT')",
    );
    expect(sql).toContain("RAISE EXCEPTION");
  });

  it("revokes discover_deals and top_deals from anon / authenticated", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.discover_deals(text, numeric, integer, text[]) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.discover_deals(text, numeric, integer, text[]) TO service_role;",
    );
    expect(sql).toContain(
      "REVOKE SELECT ON public.top_deals FROM anon, authenticated",
    );
  });

  it("is the newest migration (applies after every deals column add)", () => {
    const all = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(all[all.length - 1]).toBe(MIGRATION.split("/").pop());
  });
});

describe("no anon / browser select of non-granted deals columns", () => {
  it("demandIndex counts via the server client on a granted column", () => {
    const src = readFileSync("lib/hotFunctions/demandIndex.ts", "utf8");
    expect(src).not.toContain("getSupabaseClient");
    expect(src).toMatch(/select\("id", \{ count: "exact", head: true \}\)/);
  });

  it.each([
    "app/(dashboard)/lane/page.tsx",
    "app/(dashboard)/auctions/page.tsx",
  ])("%s goes through /api/deals/lane", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/from\(["']deals["']\)/);
    expect(src).toContain("/api/deals/lane");
  });

  it("scan realtime handlers read only granted columns", () => {
    const src = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    const start = src.indexOf('.channel("scan-realtime")');
    const end = src.indexOf(".subscribe();", start);
    expect(start).toBeGreaterThan(-1);
    const used = Array.from(
      src.slice(start, end).matchAll(/\bd\.([a-z_]+)/g),
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) {
      expect(DEALS_PUBLIC_COLUMNS as readonly string[]).toContain(c);
    }
  });
});
