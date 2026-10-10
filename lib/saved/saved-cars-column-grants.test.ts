import { readFileSync, readdirSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasUseClientDirective } from "@/lib/testing/use-client-directive";

const MIGRATION =
  "supabase/migrations/20261010070000_saved_cars_column_grants.sql";
const sql = readFileSync(MIGRATION, "utf8");
const SENSITIVE = ["snapshot", "profit_at_save"];

describe("saved_cars column grants", () => {
  it("revokes table-wide SELECT and all writes from client roles", () => {
    expect(sql).toMatch(
      /REVOKE SELECT ON public\.saved_cars FROM anon, authenticated;/,
    );
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON public\.saved_cars FROM anon, authenticated;/,
    );
  });

  it("grants only a non-sensitive SELECT column list, and no writes", () => {
    const grants = Array.from(sql.matchAll(/^\s*GRANT\b[^;]*;/gim)).map(
      (m) => m[0],
    );
    expect(grants).toHaveLength(1);
    const grant = grants[0].match(
      /GRANT SELECT \(([\s\S]*?)\) ON public\.saved_cars TO authenticated;/,
    );
    expect(grant).not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    for (const c of SENSITIVE) expect(cols).not.toContain(c);
    expect(cols).toContain("id");
  });

  it("self-checks privileges with has_column_privilege / has_table_privilege", () => {
    expect(sql).toMatch(/ARRAY\['anon', 'authenticated'\]/);
    expect(sql).toMatch(/ARRAY\['snapshot', 'profit_at_save'\]/);
    expect(sql).toMatch(
      /has_column_privilege\(r, 'public\.saved_cars', c, 'SELECT'\)/,
    );
    expect(sql).toMatch(/ARRAY\['INSERT', 'UPDATE', 'DELETE'\]/);
    expect(sql).toMatch(/has_table_privilege\(r, 'public\.saved_cars', p\)/);
    expect(sql).toMatch(
      /has_table_privilege\('anon', 'public\.saved_cars', 'SELECT'\)/,
    );
  });

  it("no later migration re-grants saved_cars to anon / authenticated / PUBLIC", () => {
    const name = MIGRATION.split("/").pop()!;
    const later = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && f > name)
      .sort();
    const toClient = String.raw`\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b`;
    for (const f of later) {
      const body = readFileSync(`supabase/migrations/${f}`, "utf8");
      // Table-wide (no column list) SELECT / ALL / writes back to a client role.
      expect(body, f).not.toMatch(
        new RegExp(
          String.raw`GRANT\s+(?:(?:SELECT|ALL(?:\s+PRIVILEGES)?|INSERT|UPDATE|DELETE)\s*,?\s*)+ON\s+(TABLE\s+)?(public\.)?saved_cars\b[^;]*` +
            toClient,
          "i",
        ),
      );
      // Any column grant naming a sensitive column.
      for (const c of SENSITIVE) {
        expect(body, f).not.toMatch(
          new RegExp(
            String.raw`GRANT\s+[^;]*\([^)]*\b${c}\b[^)]*\)[^;]*ON\s+(TABLE\s+)?(public\.)?saved_cars\b`,
            "i",
          ),
        );
      }
      // Or a schema-wide grant that would sweep saved_cars back in.
      expect(body, f).not.toMatch(
        new RegExp(
          String.raw`GRANT\s+(SELECT|ALL)[^;]*ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public[^;]*` +
            toClient,
          "i",
        ),
      );
    }
  });
});

describe("no browser / non-service-role reader of saved_cars", () => {
  const walk = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = `${dir}/${e.name}`;
          if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
          return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\./.test(e.name)
            ? [p]
            : [];
        })
      : [];
  const touchesSavedCars = (src: string) =>
    /from\(\s*["'`]saved_cars["'`]\s*\)/.test(src);
  const usesServiceRole = (src: string) =>
    /createServerComponentClient\s*\(|SUPABASE_SERVICE_ROLE_KEY/.test(src);

  it("hooks/ and components/ never touch saved_cars (with or without a directive)", () => {
    const offenders = ["hooks", "components"]
      .flatMap(walk)
      .filter((f) => touchesSavedCars(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  // Server helpers that take an injected client instead of building one, and why that's safe.
  const INJECTED_CLIENT_OK: Record<string, string> = {
    "lib/intelligence/interest-profile.ts":
      "buildInterestProfile(sb) is only called from app/api/feed with createServerComponentClient(), and reads granted columns only",
  };

  it("client app/ and lib/ modules never touch saved_cars", () => {
    const offenders = ["app", "lib"].flatMap(walk).filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!touchesSavedCars(src) || f in INJECTED_CLIENT_OK) return false;
      // A client module: has the directive, or doesn't use the service-role client (so it would
      // run on the anon / session client that just lost these privileges).
      return hasUseClientDirective(src) || !usesServiceRole(src);
    });
    expect(offenders).toEqual([]);
  });

  it("injected-client helpers are only fed the service-role client", () => {
    const feed = readFileSync("app/api/feed/route.ts", "utf8");
    expect(feed).toMatch(/const supabase = createServerComponentClient\(\)/);
    expect(feed).toMatch(/buildInterestProfile\(supabase,/);
    const callers = ["app", "lib"]
      .flatMap(walk)
      .filter((f) => /buildInterestProfile\(/.test(readFileSync(f, "utf8")))
      .filter((f) => f !== "lib/intelligence/interest-profile.ts");
    expect(callers).toEqual(["app/api/feed/route.ts"]);
  });
});
