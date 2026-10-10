// Test helper: the body of the LATEST migration that (re)defines a SQL function, which is what
// Postgres ends up running after all migrations apply.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function latestFunctionSql(
  name: string,
  dir = "supabase/migrations",
): { file: string; sql: string } {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\$\\$;`,
    "i",
  );
  let hit: { file: string; sql: string } | null = null;
  for (const f of files) {
    const m = readFileSync(join(dir, f), "utf8").match(re);
    if (m) hit = { file: f, sql: m[0] };
  }
  if (!hit) throw new Error(`no migration defines ${name}`);
  return hit;
}
