import { readFileSync, readdirSync, type Dirent } from "node:fs";
import { describe, expect, it } from "vitest";

// sold_listings holds vin, source_url and source_item_id. Every reader and writer is server-side
// (service-role client), so client roles get no access and the table has no policies.
const NAME = "20261010146000_sold_listings_server_only.sql";
const DIR = "supabase/migrations";
const sql = readFileSync(`${DIR}/${NAME}`, "utf8");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const later = files.filter((f) => f > NAME);
const read = (f: string) =>
  readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");

const CLIENT = String.raw`\b(anon|authenticated|PUBLIC)\b`;
const OBJ = String.raw`("?public"?\s*\.\s*)?"?sold_listings"?(?![\w$])`;
const CLIENT_GRANT = new RegExp(
  String.raw`GRANT\s+[^;]*\bON\s+(TABLE\s+)?([^;]*?[\s,])?${OBJ}[^;]*\bTO\b[^;]*${CLIENT}`,
  "i",
);
const POLICY = new RegExp(String.raw`CREATE\s+POLICY[^;]*\bON\s+${OBJ}`, "i");
const RLS_OFF = new RegExp(
  String.raw`ALTER\s+TABLE[^;]*${OBJ}[^;]*DISABLE\s+ROW\s+LEVEL\s+SECURITY`,
  "i",
);

describe("sold_listings server-only migration", () => {
  it("drops the public read policy, revokes client roles and grants service_role", () => {
    expect(sql).toContain(
      'DROP POLICY IF EXISTS "sold_public_read" ON public.sold_listings;',
    );
    expect(sql).toContain(
      "REVOKE ALL ON public.sold_listings FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.sold_listings TO service_role;",
    );
    expect(sql).toContain(
      "ALTER TABLE public.sold_listings ENABLE ROW LEVEL SECURITY;",
    );
  });

  it("self-checks table + column privileges, service_role access, RLS and zero policies", () => {
    expect(sql).toContain(
      "ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']",
    );
    expect(sql).toMatch(/has_table_privilege\(r, 'public\.sold_listings', p\)/);
    expect(sql).toMatch(
      /has_any_column_privilege\(r, 'public\.sold_listings', p\)/,
    );
    expect(sql).toMatch(
      /has_table_privilege\('service_role', 'public\.sold_listings', p\)/,
    );
    expect(sql).toContain("relrowsecurity");
    expect(sql).toMatch(
      /FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sold_listings'[\s\S]*IF n <> 0 THEN/,
    );
  });

  it("later migrations never re-open sold_listings to client roles", () => {
    for (const f of later) {
      const body = read(f);
      expect(body, f).not.toMatch(CLIENT_GRANT);
      expect(body, f).not.toMatch(POLICY);
      expect(body, f).not.toMatch(RLS_OFF);
    }
  });

  it("no client-side code reads sold_listings directly", () => {
    // Browser bundles only get the anon key; a direct read there would now return nothing.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) {
          if (e.name !== "node_modules") walk(p);
        } else if (/\.(tsx?|jsx?|mjs)$/.test(e.name)) {
          const src = readFileSync(p, "utf8");
          const clientFile =
            !p.startsWith("app/") || /^\s*["']use client["']/m.test(src);
          if (clientFile && src.includes("sold_listings")) offenders.push(p);
        }
      }
    };
    ["components", "hooks", "extension", "public", "app"].forEach(walk);
    expect(offenders).toEqual([]);
  });
});
