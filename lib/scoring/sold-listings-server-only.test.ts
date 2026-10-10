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
// A view or SECURITY DEFINER function over sold_listings hands rows back without the table grants.
type Exposure = { kind: "view" | "function"; name: string };
const nameRe = (name: string) =>
  name
    .split(".")
    .map((part) => String.raw`"?${part.replace(/"/g, "")}"?`)
    .join(String.raw`\s*\.\s*`);
const bare = (name: string) => name.replace(/"/g, "").replace(/^public\./i, "");
const objName = (name: string) =>
  String.raw`("?public"?\s*\.\s*)?${nameRe(bare(name))}(?![\w$])`;

function exposures(body: string): Exposure[] {
  const out: Exposure[] = [];
  const view =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)([^;]*);/gi;
  for (const m of Array.from(body.matchAll(view))) {
    if (/sold_listings/i.test(m[2])) out.push({ kind: "view", name: m[1] });
  }
  const fn = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)\s*\(/gi;
  for (const m of Array.from(body.matchAll(fn))) {
    const start = m.index ?? 0;
    const rest = body.slice(start);
    const tag = rest.match(/\$(\w*)\$/);
    let stmt: string;
    if (tag && /^[^;]*$/.test(rest.slice(0, tag.index))) {
      const open = (tag.index ?? 0) + tag[0].length;
      const close = rest.indexOf(tag[0], open);
      const tail = rest.slice(close + tag[0].length);
      stmt =
        rest.slice(0, close + tag[0].length) +
        tail.slice(0, tail.indexOf(";") + 1);
    } else {
      // BEGIN ATOMIC ... END;
      const end = rest.search(/\bEND\s*;/i);
      stmt = rest.slice(0, end < 0 ? undefined : end + 4);
    }
    if (/SECURITY\s+DEFINER/i.test(stmt) && /sold_listings/i.test(stmt)) {
      out.push({ kind: "function", name: m[1] });
    }
  }
  return out;
}

function exposureGranted(body: string, e: Exposure): boolean {
  const on =
    e.kind === "view"
      ? String.raw`ON\s+(TABLE\s+)?([^;]*?[\s,])?${objName(e.name)}`
      : String.raw`ON\s+FUNCTION\s+([^;]*?[\s,])?${objName(e.name)}`;
  return new RegExp(
    String.raw`GRANT\s+[^;]*\b${on}[^;]*\bTO\b[^;]*${CLIENT}`,
    "i",
  ).test(body);
}

function exposureRevoked(body: string, e: Exposure): boolean {
  const on =
    e.kind === "view"
      ? String.raw`ON\s+(TABLE\s+)?${objName(e.name)}`
      : String.raw`ON\s+FUNCTION\s+${objName(e.name)}`;
  const revokes = Array.from(
    body.matchAll(
      new RegExp(String.raw`REVOKE\s+[^;]*\b${on}[^;]*\bFROM\b([^;]*);`, "gi"),
    ),
  ).map((m) => m[m.length - 1]);
  const from = revokes.join(" ");
  const roles =
    e.kind === "view"
      ? ["anon", "authenticated"]
      : ["PUBLIC", "anon", "authenticated"];
  return roles.every((r) => new RegExp(String.raw`\b${r}\b`, "i").test(from));
}

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

  it("later migrations add no client-reachable view or SECURITY DEFINER function over sold_listings", () => {
    for (const f of later) {
      const body = read(f);
      for (const e of exposures(body)) {
        expect(
          exposureGranted(body, e),
          `${f}: ${e.kind} ${e.name} granted to a client role`,
        ).toBe(false);
        if (e.kind === "view") {
          // A security_invoker view runs as the caller, so the table revoke still applies.
          const def = body.match(
            new RegExp(
              String.raw`VIEW\s+(IF\s+NOT\s+EXISTS\s+)?${objName(e.name)}[^;]*?\bAS\b`,
              "i",
            ),
          );
          const invoker =
            def &&
            /security_invoker\s*=\s*['"]?\s*(t|tr|tru|true|y|ye|yes|on|1)\s*['"]?(?![\w])/i.test(
              def[0],
            );
          if (!invoker) {
            expect(
              exposureRevoked(body, e),
              `${f}: view ${e.name} not revoked from anon/authenticated`,
            ).toBe(true);
          }
        } else {
          // Functions default to EXECUTE for PUBLIC, and Supabase default privileges add anon/authenticated.
          expect(
            exposureRevoked(body, e),
            `${f}: function ${e.name} not revoked from PUBLIC/anon/authenticated`,
          ).toBe(true);
        }
      }
    }
  });

  it("self-check walks pg_depend for views and SECURITY DEFINER functions over sold_listings", () => {
    expect(sql).toMatch(
      /FROM pg_depend d\s+JOIN pg_rewrite rw ON rw\.oid = d\.objid\s+WHERE d\.classid = 'pg_rewrite'::regclass\s+AND d\.refobjid = 'public\.sold_listings'::regclass/,
    );
    expect(sql).toMatch(/has_table_privilege\(r, obj, 'SELECT'\)/);
    expect(sql).toMatch(/WHERE p2\.prosecdef/);
    expect(sql).toMatch(/p2\.prosrc ILIKE '%sold_listings%'/);
    expect(sql).toMatch(
      /d\.classid = 'pg_proc'::regclass[\s\S]*d\.refobjid = 'public\.sold_listings'::regclass/,
    );
    expect(sql).toMatch(/has_function_privilege\(r, obj, 'EXECUTE'\)/);
  });

  it("no client-side or anon-key code reads sold_listings", () => {
    // Browser bundles and anon-key/cookie clients run as anon or authenticated, which now get nothing.
    const ANON_CLIENT = [
      /^\s*["']use client["']/m,
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
      /\b(createBrowserClient|createClientComponentClient|getSupabaseClient)\b/,
      /import\s*\{[^}]*\bgetSupabase\b[^}]*\}\s*from\s*["']@\/lib\/supabase["']/,
      /from\s*["']@\/lib\/supabase\/server["']/,
    ];
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
        } else if (
          /\.(tsx?|jsx?|mjs)$/.test(e.name) &&
          !/\.test\.[jt]sx?$/.test(e.name)
        ) {
          const src = readFileSync(p, "utf8");
          if (!src.includes("sold_listings")) continue;
          const alwaysClient = /^(components|hooks|extension|public)\//.test(p);
          if (alwaysClient || ANON_CLIENT.some((re) => re.test(src)))
            offenders.push(p);
        }
      }
    };
    ["components", "hooks", "extension", "public", "app", "lib"].forEach(walk);
    expect(offenders).toEqual([]);
  });
});
