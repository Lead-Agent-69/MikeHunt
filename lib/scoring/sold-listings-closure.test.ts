import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Anything that can read sold_listings (vin, source_url, source_item_id) must stay server-only:
// views built on it (also views on those views), SECURITY DEFINER functions that read any of them
// (also functions switched to definer later with ALTER FUNCTION), and schema-wide grants that would
// re-open the table. Companion to sold-listings-server-only.test.ts (Ren P2 on #282).
const BASE = "20261010146000_sold_listings_server_only.sql";
const RECHECK = "20261010148000_sold_listings_view_closure_recheck.sql";
const DIR = "supabase/migrations";
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const read = (f: string) =>
  readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");
const recheck = readFileSync(`${DIR}/${RECHECK}`, "utf8");

const CLIENT = String.raw`\b(anon|authenticated|PUBLIC)\b`;
const bare = (name: string) =>
  name
    .replace(/"/g, "")
    .replace(/^public\./i, "")
    .toLowerCase();
const objName = (name: string) =>
  String.raw`(?<![\w$."])("?public"?\s*\.\s*)?"?${bare(name)}"?(?![\w$])`;
const mentions = (text: string, names: Set<string>) =>
  Array.from(names).some((n) => new RegExp(objName(n), "i").test(text));

type Fn = { name: string; stmt: string; secdef: boolean };

function views(body: string) {
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)([^;]*);/gi;
  return Array.from(body.matchAll(re)).map((m) => ({ name: m[1], def: m[2] }));
}

function functions(body: string): Fn[] {
  const out: Fn[] = [];
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)\s*\(/gi;
  for (const m of Array.from(body.matchAll(re))) {
    const rest = body.slice(m.index ?? 0);
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
      const end = rest.search(/\bEND\s*;/i); // BEGIN ATOMIC ... END;
      stmt = rest.slice(0, end < 0 ? undefined : end + 4);
    }
    out.push({ name: m[1], stmt, secdef: /SECURITY\s+DEFINER/i.test(stmt) });
  }
  return out;
}

// ALTER FUNCTION name(...) ... SECURITY DEFINER
function alteredToDefiner(body: string) {
  const re = /ALTER\s+FUNCTION\s+([\w."]+)\s*(\([^)]*\))?([^;]*);/gi;
  return Array.from(body.matchAll(re))
    .filter((m) => /SECURITY\s+DEFINER/i.test(m[3]))
    .map((m) => m[1]);
}

const granted = (body: string, kind: "view" | "function", name: string) =>
  new RegExp(
    String.raw`GRANT\s+[^;]*\bON\s+${kind === "view" ? String.raw`(TABLE\s+)?` : String.raw`(FUNCTION|ROUTINE)\s+`}([^;]*?[\s,])?${objName(name)}[^;]*\bTO\b[^;]*${CLIENT}`,
    "i",
  ).test(body);

const revokedFrom = (body: string, kind: "view" | "function", name: string) =>
  Array.from(
    body.matchAll(
      new RegExp(
        String.raw`REVOKE\s+[^;]*\bON\s+${kind === "view" ? String.raw`(TABLE\s+)?` : String.raw`(FUNCTION|ROUTINE)\s+`}${objName(name)}[^;]*\bFROM\b([^;]*);`,
        "gi",
      ),
    ),
  )
    .map((m) => m[m.length - 1])
    .join(" ");

const INVOKER_ON =
  /security_invoker\s*=\s*['"]?\s*(t|tr|tru|true|y|ye|yes|on|1)\s*['"]?(?![\w])/i;

// GRANT ... ON ALL TABLES/FUNCTIONS/ROUTINES IN SCHEMA public TO client, and default privileges
// that hand future tables/views/functions to client roles.
const SCHEMA_WIDE = new RegExp(
  String.raw`GRANT\s+[^;]*\bON\s+ALL\s+(TABLES|FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA\s+[^;]*?"?public"?[^;]*\bTO\b[^;]*${CLIENT}`,
  "i",
);
const DEFAULT_PRIV = new RegExp(
  String.raw`ALTER\s+DEFAULT\s+PRIVILEGES\b[^;]*\bGRANT\b[^;]*\bTO\b[^;]*${CLIENT}`,
  "i",
);

type Finding = string;

/** Walk every migration in order: grow the set of objects that read sold_listings, and report any
 *  client-reachable one created or altered after the server-only migration. */
function audit(): { closure: Set<string>; findings: Finding[] } {
  const closure = new Set<string>(["sold_listings"]);
  const fnDefs = new Map<string, Fn>();
  const revoked = new Map<string, string>(); // function -> roles revoked so far
  const everDefiner = new Set<string>();
  const findings: Finding[] = [];
  for (const f of files) {
    const body = read(f);
    const isLater = f > BASE;
    // views: fixpoint inside the file so a view on a view in the same file is caught
    const vs = views(body);
    let grew = true;
    const exposedViews = new Set<string>();
    while (grew) {
      grew = false;
      for (const v of vs) {
        const n = bare(v.name);
        if (!closure.has(n) && mentions(v.def, closure)) {
          closure.add(n);
          grew = true;
          if (isLater) exposedViews.add(v.name);
        }
      }
    }
    for (const fn of functions(body)) fnDefs.set(bare(fn.name), fn);
    for (const [n] of Array.from(fnDefs)) {
      const r = revokedFrom(body, "function", n);
      if (r) revoked.set(n, `${revoked.get(n) ?? ""} ${r}`);
    }
    if (!isLater) {
      for (const fn of functions(body))
        if (fn.secdef) everDefiner.add(bare(fn.name));
      alteredToDefiner(body).forEach((n) => everDefiner.add(bare(n)));
      continue;
    }

    if (SCHEMA_WIDE.test(body))
      findings.push(`${f}: schema-wide GRANT to a client role`);
    if (DEFAULT_PRIV.test(body))
      findings.push(`${f}: ALTER DEFAULT PRIVILEGES grants a client role`);

    for (const name of Array.from(exposedViews)) {
      const v = vs.find((x) => x.name === name)!;
      if (granted(body, "view", name)) {
        findings.push(
          `${f}: view ${name} reads sold_listings and is granted to a client role`,
        );
      } else if (!INVOKER_ON.test(v.def)) {
        const r = revokedFrom(body, "view", name);
        if (!/\banon\b/i.test(r) || !/\bauthenticated\b/i.test(r)) {
          findings.push(
            `${f}: view ${name} reads sold_listings, is not security_invoker and is not revoked from anon/authenticated`,
          );
        }
      }
    }

    const definerNow = new Set<string>([
      ...functions(body)
        .filter((fn) => fn.secdef)
        .map((fn) => bare(fn.name)),
      ...alteredToDefiner(body).map(bare),
    ]);
    for (const n of Array.from(definerNow)) {
      const def = fnDefs.get(n);
      if (!def || !mentions(def.stmt, closure)) continue;
      if (granted(body, "function", n)) {
        findings.push(
          `${f}: SECURITY DEFINER function ${n} reads sold_listings and is granted to a client role`,
        );
        continue;
      }
      const r = revoked.get(n) ?? "";
      if (
        !["PUBLIC", "anon", "authenticated"].every((x) =>
          new RegExp(String.raw`\b${x}\b`, "i").test(r),
        )
      ) {
        findings.push(
          `${f}: SECURITY DEFINER function ${n} reads sold_listings and is not revoked from PUBLIC/anon/authenticated`,
        );
      }
    }
    // a definer function that reads the closure must never be granted to a client role later
    for (const n of Array.from(everDefiner)) {
      const def = fnDefs.get(n);
      if (
        !definerNow.has(n) &&
        def &&
        mentions(def.stmt, closure) &&
        granted(body, "function", n)
      ) {
        findings.push(
          `${f}: SECURITY DEFINER function ${n} reads sold_listings and is granted to a client role`,
        );
      }
    }
    definerNow.forEach((n) => everDefiner.add(n));
  }
  return { closure, findings };
}

describe("sold_listings dependency closure stays server-only", () => {
  it("no later migration exposes sold_listings through views, views on views, definer functions or schema-wide grants", () => {
    const { findings } = audit();
    expect(findings).toEqual([]);
  });

  it("closure recheck migration walks pg_depend recursively and checks definer functions over the closure", () => {
    const body = recheck.replace(/--[^\n]*/g, "");
    expect(body).not.toMatch(/\b(GRANT|REVOKE|ALTER|CREATE|DROP|COMMENT)\b/i);
    expect(body.match(/WITH RECURSIVE closure\(oid\) AS/g)?.length).toBe(2);
    expect(body).toMatch(
      /FROM closure c\s+JOIN pg_depend d ON d\.refobjid = c\.oid AND d\.refclassid = 'pg_class'::regclass\s+JOIN pg_rewrite rw ON rw\.oid = d\.objid\s+WHERE d\.classid = 'pg_rewrite'::regclass/,
    );
    expect(body).toMatch(/has_table_privilege\(r, obj, 'SELECT'\)/);
    expect(body).toMatch(/WHERE p2\.prosecdef/);
    expect(body).toMatch(
      /p2\.prosrc ~\* \('\\m' \|\| cl\.relname \|\| '\\M'\)/,
    );
    expect(body).toMatch(
      /d\.classid = 'pg_proc'::regclass[\s\S]*d\.refobjid = c\.oid/,
    );
    expect(body).toMatch(/has_function_privilege\(r, obj, 'EXECUTE'\)/);
    expect(body).toMatch(/ARRAY\['anon', 'authenticated'\]/);
  });
});
