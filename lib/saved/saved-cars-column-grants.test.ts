import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261010030000_saved_cars_column_grants.sql";
const sql = readFileSync(MIGRATION, "utf8");

describe("saved_cars column grants", () => {
  it("revokes table-wide SELECT from client roles", () => {
    expect(sql).toMatch(
      /REVOKE SELECT ON public\.saved_cars FROM anon, authenticated;/,
    );
  });

  it("never grants snapshot or profit_at_save to a client role", () => {
    const grant = sql.match(
      /GRANT SELECT \(([\s\S]*?)\) ON public\.saved_cars/,
    );
    expect(grant).not.toBeNull();
    const cols = grant![1].split(",").map((c) => c.trim());
    expect(cols).not.toContain("snapshot");
    expect(cols).not.toContain("profit_at_save");
    expect(cols).toContain("id");
  });

  it("no browser code reads saved_cars directly (it would lose snapshot)", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
        return /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)
          ? [p]
          : [];
      });
    const offenders = ["app", "components", "hooks"]
      .flatMap((d) => {
        try {
          return walk(d);
        } catch {
          return [];
        }
      })
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return (
          /["']use client["']/.test(src) &&
          /from\(["']saved_cars["']\)/.test(src)
        );
      });
    expect(offenders).toEqual([]);
  });
});
