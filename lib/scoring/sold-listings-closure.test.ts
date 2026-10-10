import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Anything that can read sold_listings (vin, source_url, source_item_id) must stay server-only:
// views and materialized views built on it (also views on those views), SECURITY DEFINER functions
// that read any of them (also functions switched to definer later with ALTER FUNCTION), later
// re-grants of any of those, and schema-wide grants that would re-open the table.
// Companion to sold-listings-server-only.test.ts (Ren P2s on #282, nits on #299).
//
// Known misses (static text matching cannot see them; the hosted self-checks in 20261010148000 /
// 20261010149000 cover what the catalog can show):
//   * Dynamic SQL: a definer function that builds the table/view name at run time and runs it with
//     EXECUTE (format('SELECT ... FROM %I', ...)) has no literal name to match.
//   * Definer calling invoker: a SECURITY DEFINER function that calls a SECURITY INVOKER function
//     which reads sold_listings runs the inner one with the definer's rights. Only bodies that name
//     the table or a closure view are matched, so that call chain is missed.
const BASE = "20261010146000_sold_listings_server_only.sql";
const RECHECK = "20261010148000_sold_listings_view_closure_recheck.sql";
const RECHECK_V2 = "20261010149000_sold_listings_view_closure_recheck_v2.sql";
const DIR = "supabase/migrations";
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const stripComments = (s: string) => s.replace(/--[^\n]*/g, "");
const repoMigrations = () =>
  files.map((name) => ({
    name,
    body: stripComments(readFileSync(`${DIR}/${name}`, "utf8")),
  }));

type Migration = { name: string; body: string };
type Fn = { key: string; stmt: string; secdef: boolean };

const CLIENT = String.raw`\b(anon|authenticated|PUBLIC)\b`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "public.x", "x", "\"Other\".\"x\"" -> "public.x" / "other.x" (schema plus name). */
function keyOf(token: string): string {
  const parts = token
    .split(".")
    .map((p) => p.replace(/"/g, "").trim().toLowerCase());
  return parts.length > 1
    ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
    : `public.${parts[0]}`;
}

/** Regex source for a reference to `key`. A public object may be written bare (search_path); an
 *  object in any other schema must be schema-qualified. other.x never matches public.x. */
function refRe(key: string): string {
  const [schema, name] = key.split(".");
  const n = String.raw`"?${esc(name)}"?(?![\w$"])`;
  const q = String.raw`"?${esc(schema)}"?\s*\.\s*`;
  return schema === "public"
    ? String.raw`(?<![\w$."])(${q})?${n}`
    : String.raw`(?<![\w$."])${q}${n}`;
}
const mentions = (text: string, keys: Set<string>) =>
  Array.from(keys).some((k) => new RegExp(refRe(k), "i").test(text));

// Views and materialized views only. CREATE RULE (also stored in pg_rewrite) never joins the chain:
// a rule on deals that mentions sold_listings does not make deals a sold_listings reader.
function views(body: string) {
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)([^;]*);/gi;
  return Array.from(body.matchAll(re)).map((m) => ({
    key: keyOf(m[1]),
    def: m[2],
  }));
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
    out.push({
      key: keyOf(m[1]),
      stmt,
      secdef: /SECURITY\s+DEFINER/i.test(stmt),
    });
  }
  return out;
}

// ALTER FUNCTION name(...) ... SECURITY DEFINER
const alteredToDefiner = (body: string) =>
  Array.from(
    body.matchAll(/ALTER\s+FUNCTION\s+([\w."]+)\s*(\([^)]*\))?([^;]*);/gi),
  )
    .filter((m) => /SECURITY\s+DEFINER/i.test(m[3]))
    .map((m) => keyOf(m[1]));

const onClause = (kind: "view" | "function") =>
  kind === "view" ? String.raw`(TABLE\s+)?` : String.raw`(FUNCTION|ROUTINE)\s+`;
const granted = (body: string, kind: "view" | "function", key: string) =>
  new RegExp(
    String.raw`GRANT\s+[^;]*\bON\s+${onClause(kind)}([^;]*?[\s,])?${refRe(key)}[^;]*\bTO\b[^;]*${CLIENT}`,
    "i",
  ).test(body);
const revokedFrom = (body: string, kind: "view" | "function", key: string) =>
  Array.from(
    body.matchAll(
      new RegExp(
        String.raw`REVOKE\s+[^;]*\bON\s+${onClause(kind)}${refRe(key)}[^;]*\bFROM\b([^;]*);`,
        "gi",
      ),
    ),
  )
    .map((m) => m[m.length - 1])
    .join(" ");

const INVOKER_ON =
  /security_invoker\s*=\s*['"]?\s*(t|tr|tru|true|y|ye|yes|on|1)\s*['"]?(?![\w])/i;
const SCHEMA_WIDE = new RegExp(
  String.raw`GRANT\s+[^;]*\bON\s+ALL\s+(TABLES|FUNCTIONS|ROUTINES)\s+IN\s+SCHEMA\s+[^;]*?"?public"?[^;]*\bTO\b[^;]*${CLIENT}`,
  "i",
);
const DEFAULT_PRIV = new RegExp(
  String.raw`ALTER\s+DEFAULT\s+PRIVILEGES\b[^;]*\bGRANT\b[^;]*\bTO\b[^;]*${CLIENT}`,
  "i",
);

const SOLD = "public.sold_listings";

/** Walk migrations in order: grow the set of objects that read sold_listings, and report any
 *  client-reachable one created, altered or re-granted after the server-only migration. */
function audit(migrations: Migration[]) {
  const closure = new Set<string>([SOLD]);
  const fnDefs = new Map<string, Fn>();
  const revoked = new Map<string, string>(); // function -> roles revoked so far
  const everDefiner = new Set<string>();
  const findings: string[] = [];
  let baseSeen = false;
  let laterSeen = 0;
  for (const { name: f, body } of migrations) {
    if (f === BASE) baseSeen = true;
    const isLater = f > BASE;
    if (isLater) laterSeen += 1;

    // views: fixpoint inside the file so a view on a view in the same file is caught
    const vs = views(body);
    const newInFile = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const v of vs) {
        if (!closure.has(v.key) && mentions(v.def, closure)) {
          closure.add(v.key);
          newInFile.add(v.key);
          grew = true;
        }
      }
    }
    for (const fn of functions(body)) fnDefs.set(fn.key, fn);
    for (const [k] of Array.from(fnDefs)) {
      const r = revokedFrom(body, "function", k);
      if (r) revoked.set(k, `${revoked.get(k) ?? ""} ${r}`);
    }
    const definerNow = new Set<string>([
      ...functions(body)
        .filter((fn) => fn.secdef)
        .map((fn) => fn.key),
      ...alteredToDefiner(body),
    ]);
    if (!isLater) {
      definerNow.forEach((k) => everDefiner.add(k));
      continue;
    }

    if (SCHEMA_WIDE.test(body))
      findings.push(`${f}: schema-wide GRANT to a client role`);
    if (DEFAULT_PRIV.test(body))
      findings.push(`${f}: ALTER DEFAULT PRIVILEGES grants a client role`);

    for (const v of vs.filter((x) => newInFile.has(x.key))) {
      if (granted(body, "view", v.key)) {
        findings.push(
          `${f}: view ${v.key} reads sold_listings and is granted to a client role`,
        );
      } else if (!INVOKER_ON.test(v.def)) {
        const r = revokedFrom(body, "view", v.key);
        if (!/\banon\b/i.test(r) || !/\bauthenticated\b/i.test(r)) {
          findings.push(
            `${f}: view ${v.key} reads sold_listings, is not security_invoker and is not revoked from anon/authenticated`,
          );
        }
      }
    }
    // a bare later GRANT on an existing (revoked) view that reads sold_listings
    for (const k of Array.from(closure)) {
      if (k === SOLD || newInFile.has(k)) continue;
      if (granted(body, "view", k)) {
        findings.push(
          `${f}: existing view ${k} reads sold_listings and is re-granted to a client role`,
        );
      }
    }

    for (const k of Array.from(definerNow)) {
      const def = fnDefs.get(k);
      if (!def || !mentions(def.stmt, closure)) continue;
      if (granted(body, "function", k)) {
        findings.push(
          `${f}: SECURITY DEFINER function ${k} reads sold_listings and is granted to a client role`,
        );
        continue;
      }
      const r = revoked.get(k) ?? "";
      if (
        !["PUBLIC", "anon", "authenticated"].every((x) =>
          new RegExp(String.raw`\b${x}\b`, "i").test(r),
        )
      ) {
        findings.push(
          `${f}: SECURITY DEFINER function ${k} reads sold_listings and is not revoked from PUBLIC/anon/authenticated`,
        );
      }
    }
    // a definer function that reads the closure must never be re-granted to a client role later
    for (const k of Array.from(everDefiner)) {
      const def = fnDefs.get(k);
      if (
        !definerNow.has(k) &&
        def &&
        mentions(def.stmt, closure) &&
        granted(body, "function", k)
      ) {
        findings.push(
          `${f}: existing SECURITY DEFINER function ${k} reads sold_listings and is re-granted to a client role`,
        );
      }
    }
    definerNow.forEach((k) => everDefiner.add(k));
  }
  return { closure, findings, baseSeen, laterSeen };
}

// Fixed fixtures, so the audit is proven against known-bad input on every run (it cannot pass
// just because no later migration happens to exist).
const BASE_FIXTURE: Migration = {
  name: BASE,
  body: "REVOKE ALL ON public.sold_listings FROM PUBLIC, anon, authenticated;",
};
const at = (n: number, body: string): Migration => ({
  name: `2099010100000${n}_fixture.sql`,
  body,
});
const V1 =
  "CREATE VIEW public.v1 AS SELECT vin FROM public.sold_listings; REVOKE ALL ON public.v1 FROM PUBLIC, anon, authenticated;";
const BAD: Record<string, { files: Migration[]; expect: RegExp }> = {
  "view on a view granted to anon": {
    files: [
      at(1, V1),
      at(
        2,
        "CREATE VIEW public.v2 AS SELECT vin FROM v1; GRANT SELECT ON public.v2 TO anon;",
      ),
    ],
    expect: /view public\.v2 .* granted/,
  },
  "bare later re-grant of an existing revoked view": {
    files: [at(1, V1), at(2, "GRANT SELECT ON public.v1 TO authenticated;")],
    expect: /existing view public\.v1 .* re-granted/,
  },
  "bare later re-grant, multi-table list, quoted": {
    files: [
      at(1, V1),
      at(2, 'GRANT SELECT ON public.deals, "public"."v1" TO anon;'),
    ],
    expect: /existing view public\.v1 .* re-granted/,
  },
  "ALTER FUNCTION ... SECURITY DEFINER without revoke": {
    files: [
      at(
        1,
        "CREATE FUNCTION public.f() RETURNS bigint LANGUAGE sql AS $q$ SELECT count(*) FROM public.sold_listings $q$;",
      ),
      at(2, "ALTER FUNCTION public.f() SECURITY DEFINER;"),
    ],
    expect: /SECURITY DEFINER function public\.f .* not revoked/,
  },
  "definer function re-granted later": {
    files: [
      at(
        1,
        "CREATE FUNCTION public.f() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $q$ SELECT count(*) FROM public.sold_listings $q$; REVOKE ALL ON FUNCTION public.f() FROM PUBLIC, anon, authenticated;",
      ),
      at(2, "GRANT EXECUTE ON FUNCTION public.f() TO anon;"),
    ],
    expect: /existing SECURITY DEFINER function public\.f .* re-granted/,
  },
  "schema-wide grant": {
    files: [at(1, "GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;")],
    expect: /schema-wide GRANT/,
  },
};
const GOOD: Record<string, Migration[]> = {
  "a rule on deals that mentions sold_listings does not pull deals into the chain":
    [
      at(
        1,
        "CREATE RULE r AS ON INSERT TO public.deals DO ALSO INSERT INTO public.sold_listings(vin) VALUES (NEW.vin);",
      ),
      at(2, "GRANT SELECT ON public.deals TO anon;"),
    ],
  "other_schema.deals_v is not public.deals_v (schema plus name)": [
    at(
      1,
      "CREATE VIEW public.deals_v AS SELECT vin FROM public.sold_listings; REVOKE ALL ON public.deals_v FROM PUBLIC, anon, authenticated;",
    ),
    at(
      2,
      "CREATE VIEW other.deals_v2 AS SELECT * FROM other.deals_v; GRANT SELECT ON other.deals_v2 TO anon;",
    ),
    at(
      3,
      "CREATE FUNCTION public.g() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $q$ SELECT count(*) FROM other.deals_v $q$; GRANT EXECUTE ON FUNCTION public.g() TO anon;",
    ),
    at(4, "GRANT SELECT ON other.deals_v TO anon;"),
  ],
  "an invoker view on a revoked view": [
    at(1, V1),
    at(
      2,
      "CREATE VIEW public.v2 WITH (security_invoker = on) AS SELECT vin FROM public.v1;",
    ),
  ],
};

describe("sold_listings dependency closure stays server-only", () => {
  it("finds the base migration and audits the real migrations clean", () => {
    expect(files).toContain(BASE);
    const { findings, baseSeen, laterSeen } = audit(repoMigrations());
    expect(baseSeen).toBe(true);
    expect(laterSeen).toBeGreaterThan(0); // at least the recheck migrations follow the base
    expect(findings).toEqual([]);
  });

  for (const [name, c] of Object.entries(BAD)) {
    it(`bad fixture is caught: ${name}`, () => {
      const { findings, baseSeen } = audit([BASE_FIXTURE, ...c.files]);
      expect(baseSeen).toBe(true);
      expect(
        findings.some((x) => c.expect.test(x)),
        findings.join("\n"),
      ).toBe(true);
    });
  }

  for (const [name, migs] of Object.entries(GOOD)) {
    it(`good fixture passes: ${name}`, () => {
      const { findings, baseSeen } = audit([BASE_FIXTURE, ...migs]);
      expect(baseSeen).toBe(true);
      expect(findings).toEqual([]);
    });
  }

  it("closure recheck v1 (20261010148000) walks pg_depend recursively", () => {
    const body = stripComments(readFileSync(`${DIR}/${RECHECK}`, "utf8"));
    expect(body).not.toMatch(/\b(GRANT|REVOKE|ALTER|CREATE|DROP|COMMENT)\b/i);
    expect(body.match(/WITH RECURSIVE closure\(oid\) AS/g)?.length).toBe(2);
    expect(body).toMatch(/has_table_privilege\(r, obj, 'SELECT'\)/);
    expect(body).toMatch(/has_function_privilege\(r, obj, 'EXECUTE'\)/);
  });

  it("closure recheck v2 (20261010149000): views/matviews only, schema plus name, same checks", () => {
    const raw = readFileSync(`${DIR}/${RECHECK_V2}`, "utf8");
    const body = stripComments(raw);
    expect(body).not.toMatch(/\b(GRANT|REVOKE|ALTER|CREATE|DROP|COMMENT)\b/i);
    expect(body.match(/WITH RECURSIVE closure\(oid\) AS/g)?.length).toBe(2);
    expect(
      body.match(
        /JOIN pg_class v ON v\.oid = rw\.ev_class AND v\.relkind IN \('v', 'm'\)/g,
      )?.length,
    ).toBe(2);
    expect(body).toContain(
      "n.nspname || '\\M\"?\\s*\\.\\s*\"?\\m' || n.relname",
    );
    expect(body).toMatch(/n\.nspname = 'public'\s+AND p2\.prosrc ~\*/);
    expect(body).not.toMatch(/~\* \('\\m' \|\| cl\.relname \|\| '\\M'\)/);
    expect(body).toMatch(/has_table_privilege\(r, obj, 'SELECT'\)/);
    expect(body).toMatch(/WHERE p2\.prosecdef/);
    expect(body).toMatch(/has_function_privilege\(r, obj, 'EXECUTE'\)/);
    // known misses are documented in the migration
    expect(raw).toMatch(/Dynamic SQL/);
    expect(raw).toMatch(/Definer calling invoker/);
  });
});
