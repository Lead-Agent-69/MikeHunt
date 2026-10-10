import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The similar RPCs return flip economics; the route redacts per desk server-side (service role),
// so PostgREST callers (anon / authenticated) must not be able to execute them directly.
const sql = readFileSync(
  path.resolve(
    __dirname,
    "../../supabase/migrations/20261010010000_similar_deals_prefiltered.sql",
  ),
  "utf8",
);
const code = sql.replace(/--.*$/gm, "");

describe("similar RPC grants", () => {
  it("revokes PUBLIC/anon/authenticated and grants only service_role on the filtered RPC", () => {
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.similar_deals_by_id_filtered\([^)]*\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    const grants = code.match(/GRANT EXECUTE ON FUNCTION[^;]*;/g) ?? [];
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) {
      expect(g).toMatch(/TO service_role;$/);
      expect(g).not.toMatch(/\b(anon|authenticated|PUBLIC)\b/);
    }
  });

  it("also closes the legacy similar_deals_by_id", () => {
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.similar_deals_by_id\(UUID, INT, FLOAT\) FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("is SECURITY INVOKER with a pinned search_path that still resolves pgvector", () => {
    expect(code).toMatch(/SECURITY INVOKER/);
    expect(code).not.toMatch(/SECURITY DEFINER/);
    expect(code).toMatch(/SET search_path = public, extensions, pg_temp/);
  });

  it("never returns embedding, coordinates, raw location, options, ZIP or pricing breakdown", () => {
    const returns = code.slice(
      code.indexOf("RETURNS TABLE"),
      code.indexOf("LANGUAGE sql"),
    );
    // Word boundaries so location_state / location_city (allowed) don't false-match `location`.
    for (const col of [
      "embedding",
      "lat",
      "lng",
      "location",
      "options",
      "location_zip",
      "pricing_breakdown",
    ])
      expect(returns).not.toMatch(new RegExp(`\\b${col}\\b`));
    expect(returns).toMatch(/\blocation_state\b/);
  });
});
