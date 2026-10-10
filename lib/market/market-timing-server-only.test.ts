import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NAME = "20261010120000_market_timing_stripe_events_server_only.sql";
const RECHECK = "20261010140000_market_timing_stripe_events_recheck.sql";
const COLUMN_RECHECK = "20261010145000_market_timing_stripe_events_column_recheck.sql";
const DIR = "supabase/migrations";
const sql = readFileSync(`${DIR}/${NAME}`, "utf8");
const recheck = readFileSync(`${DIR}/${RECHECK}`, "utf8");
const columnRecheck = readFileSync(`${DIR}/${COLUMN_RECHECK}`, "utf8");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const later = files.filter((f) => f > NAME);
const read = (f: string) =>
  readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");

const CLIENT = String.raw`\b(anon|authenticated|PUBLIC)\b`;
// public.x, "public".x, public."x", "public"."x" or bare x / "x".
const objRef = (obj: string) =>
  String.raw`("?public"?\s*\.\s*)?"?${obj}"?(?![\w$])`;

// The object may be anywhere in a multi-table list: GRANT SELECT ON public.deals, public.x TO anon
const CLIENT_GRANT = (obj: string) =>
  new RegExp(
    String.raw`GRANT\s+[^;]*\bON\s+(TABLE\s+)?([^;]*?[\s,])?${objRef(obj)}[^;]*\bTO\b[^;]*${CLIENT}`,
    "i",
  );
// Role membership granted to a client role (GRANT service_role TO anon): no ON clause at all.
const ROLE_GRANT = new RegExp(
  String.raw`\bGRANT\s+(?:(?!\bON\b)[^;])*\bTO\b[^;]*${CLIENT}`,
  "i",
);
// GRANT ... ON ALL TABLES IN SCHEMA public TO anon/authenticated/PUBLIC
const SCHEMA_WIDE_GRANT = new RegExp(
  String.raw`GRANT\s+[^;]*\bON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+[^;]*?"?public"?[^;]*\bTO\b[^;]*${CLIENT}`,
  "i",
);
// ALTER DEFAULT PRIVILEGES ... GRANT ... TO anon/authenticated/PUBLIC
const DEFAULT_PRIV_GRANT = new RegExp(
  String.raw`ALTER\s+DEFAULT\s+PRIVILEGES\b[^;]*\bGRANT\b[^;]*\bTO\b[^;]*${CLIENT}`,
  "i",
);
// security_invoker = false/off/0/no, quoted or not
// Postgres booleans accept any unique prefix: f/fa/fal/fals/false, n/no, of/off, 0 (and the
// true side t/tr/tru/true, y/ye/yes, on, 1). "o" alone is ambiguous and rejected by Postgres.
const BOOL_FALSE = String.raw`(f|fa|fal|fals|false|n|no|of|off|0)`;
const BOOL_TRUE = String.raw`(t|tr|tru|true|y|ye|yes|on|1)`;
const INVOKER_OFF = new RegExp(
  String.raw`market_timing_signals[^;]*security_invoker\s*=\s*['"]?\s*${BOOL_FALSE}\s*['"]?(?![\w])`,
  "i",
);
const INVOKER_ON = new RegExp(
  String.raw`security_invoker\s*=\s*['"]?\s*${BOOL_TRUE}\s*['"]?(?![\w])`,
  "i",
);
const VIEW_DEF = new RegExp(
  String.raw`CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+${objRef("market_timing_signals")}[^;]*?\bAS\b`,
  "gi",
);

describe("market_timing_signals + stripe_events server-only migration", () => {
  it("revokes client access to market_timing_signals and grants service_role", () => {
    expect(sql).toContain(
      "REVOKE ALL ON public.market_timing_signals FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "GRANT SELECT ON public.market_timing_signals TO service_role;",
    );
  });

  it("self-checks both objects with has_table_privilege, security_invoker and RLS", () => {
    expect(sql).toMatch(/ARRAY\['anon', 'authenticated'\]/);
    expect(sql).toMatch(/ARRAY\['SELECT', 'INSERT', 'UPDATE', 'DELETE'\]/);
    expect(sql).toMatch(
      /has_table_privilege\(r, 'public\.market_timing_signals', p\)/,
    );
    expect(sql).toMatch(/has_table_privilege\(r, 'public\.stripe_events', p\)/);
    expect(sql).toMatch(
      /has_table_privilege\('service_role', 'public\.market_timing_signals', 'SELECT'\)/,
    );
    expect(sql).toMatch(
      /has_table_privilege\('service_role', 'public\.stripe_events', 'INSERT'\)/,
    );
    expect(sql).toContain("'security_invoker=true' = ANY (reloptions)");
    expect(sql).toContain("relrowsecurity");
  });

  it("recheck migration: every client privilege, 0 stripe_events policies, service_role SELECT/INSERT/DELETE", () => {
    const body = recheck.replace(/--[^\n]*/g, "");
    // check-only: no grant/revoke/DDL
    expect(body).not.toMatch(/\b(GRANT|REVOKE|ALTER|CREATE|DROP|COMMENT)\b/i);
    expect(body).toMatch(/ARRAY\['anon', 'authenticated'\]/);
    expect(body).toContain(
      "ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']",
    );
    expect(body).toMatch(/has_table_privilege\(r, 'public\.market_timing_signals', p\)/);
    expect(body).toMatch(/has_table_privilege\(r, 'public\.stripe_events', p\)/);
    expect(body).toMatch(
      /FOREACH p IN ARRAY ARRAY\['SELECT', 'INSERT', 'DELETE'\] LOOP\s+IF NOT has_table_privilege\('service_role', 'public\.stripe_events', p\)/,
    );
    expect(body).toMatch(
      /has_table_privilege\('service_role', 'public\.market_timing_signals', 'SELECT'\)/,
    );
    expect(body).toMatch(
      /FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stripe_events'[\s\S]*IF n <> 0 THEN/,
    );
    expect(body).toContain("relrowsecurity");
    expect(body).toContain("unnest(c.reloptions)");
    expect(body).toContain("lower(split_part(o.opt, '=', 1)) = 'security_invoker'");
    expect(body).toContain(
      "lower(split_part(o.opt, '=', 2)) IN ('true', 'on', '1', 'yes')",
    );
  });

  it("column recheck migration: has_any_column_privilege for S/I/U/REFERENCES, no client role membership", () => {
    const body = columnRecheck.replace(/--[^\n]*/g, "");
    expect(body).not.toMatch(/\b(GRANT|REVOKE|ALTER|CREATE|DROP|COMMENT)\b/i);
    expect(body).toMatch(/ARRAY\['anon', 'authenticated'\]/);
    expect(body).toContain("ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']");
    expect(body).toMatch(
      /has_any_column_privilege\(r, 'public\.market_timing_signals', p\)/,
    );
    expect(body).toMatch(/has_any_column_privilege\(r, 'public\.stripe_events', p\)/);
    expect(body).toMatch(/pg_has_role\(r, g, 'MEMBER'\)/);
    expect(body).toContain(
      "ARRAY['service_role', 'postgres', 'supabase_admin', 'authenticator']",
    );
  });

  it("no migration grants market_timing_signals or stripe_events to client roles", () => {
    for (const f of files) {
      const body = read(f);
      expect(body, f).not.toMatch(CLIENT_GRANT("market_timing_signals"));
      expect(body, f).not.toMatch(CLIENT_GRANT("stripe_events"));
      expect(body, f).not.toMatch(SCHEMA_WIDE_GRANT);
      expect(body, f).not.toMatch(ROLE_GRANT);
      expect(body, f).not.toMatch(DEFAULT_PRIV_GRANT);
      expect(body, f).not.toMatch(
        new RegExp(
          String.raw`CREATE\s+POLICY[^;]*\bON\s+${objRef("stripe_events")}`,
          "i",
        ),
      );
    }
  });

  it("later migrations keep security_invoker, keep RLS, and re-revoke if they drop the view", () => {
    for (const f of later) {
      const body = read(f);
      expect(body, f).not.toMatch(INVOKER_OFF);
      expect(body, f).not.toMatch(
        /market_timing_signals[^;]*RESET\s*\([^)]*security_invoker/i,
      );
      if (/DROP\s+VIEW[^;]*market_timing_signals/i.test(body)) {
        // A dropped + recreated view picks up Supabase default client grants again.
        expect(body, f).toMatch(
          /REVOKE\s+ALL\s+ON\s+(TABLE\s+)?("?public"?\.)?"?market_timing_signals"?\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
        );
      }
      expect(body, f).not.toMatch(
        /DISABLE\s+ROW\s+LEVEL\s+SECURITY[^;]*stripe_events|stripe_events[^;]*DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    }
  });

  it("every migration that (re)defines the view sets security_invoker on", () => {
    // CREATE OR REPLACE VIEW replaces reloptions, so the option must be restated each time.
    let found = 0;
    for (const f of files) {
      const defs = read(f).match(VIEW_DEF);
      for (const d of defs ?? []) {
        found += 1;
        expect(d, f).toMatch(INVOKER_ON);
        expect(d, f).not.toMatch(INVOKER_OFF);
      }
    }
    // never pass on zero matches (e.g. a regex that stops recognising the definitions)
    expect(found).toBeGreaterThan(0);
  });
});
