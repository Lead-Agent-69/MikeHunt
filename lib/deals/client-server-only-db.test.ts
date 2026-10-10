import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Server-only DB objects (20261010030000 / 20261010040000): client roles have no grants, so a
// browser ('use client') caller would 42501 at runtime. Keep them behind service-role API routes.
const SERVER_ONLY_RPCS = [
  "count_by_state",
  "dealer_inventory",
  "find_duplicate_vins",
  "landing_proof",
  "discover_deals",
  "mirror_user_profile_to_profiles",
  "rls_auto_enable",
];
const SERVER_ONLY_TABLES = [
  "source_health",
  "harvest_states",
  "top_deals",
  "price_history",
  "source_url_cache",
  "scraper_runs",
  "app_secrets",
];

const ROOTS = ["app", "components", "hooks", "lib"];
const EXT = /\.(ts|tsx|js|jsx|mjs)$/;

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (name === "node_modules" || name.startsWith(".")) return [];
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return EXT.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

function clientFiles(): string[] {
  return ROOTS.flatMap(walk).filter((f) => {
    const head = readFileSync(f, "utf8").slice(0, 400);
    return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(head);
  });
}

describe("'use client' files never touch server-only DB objects", () => {
  const files = clientFiles();

  it("finds client components to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(SERVER_ONLY_RPCS)("no client .rpc('%s')", (fn) => {
    const re = new RegExp(`\\.rpc\\(\\s*["'\`]${fn}["'\`]`);
    const hits = files.filter((f) => re.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  it.each(SERVER_ONLY_TABLES)("no client .from('%s')", (t) => {
    const re = new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]`);
    const hits = files.filter((f) => re.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
