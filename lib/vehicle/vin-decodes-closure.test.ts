import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 20261010421000: #299/#310's recursive closure check ported to vin_decodes (Ren nits on #315).
// The planted cases under supabase/tests/vin_decodes_closure run against a real Postgres via
// scripts/check-vin-decodes-closure.sh; this test pins the shape of the check and the case set.
const NAME = "20261010421000_vin_decodes_closure_check.sql";
const raw = readFileSync(`supabase/migrations/${NAME}`, "utf8");
const body = raw.replace(/--[^\n]*/g, "");
const cases = readdirSync("supabase/tests/vin_decodes_closure").filter((f) =>
  f.endsWith(".sql"),
);

describe("vin_decodes closure check (20261010421000)", () => {
  it("is check-only and ordered after 20261010420000", () => {
    expect(body).not.toMatch(/\b(GRANT|REVOKE|ALTER|CREATE|DROP|COMMENT)\b/i);
    expect(body).not.toMatch(
      /\bINSERT\s+INTO\b|\bUPDATE\s+[\w."]+\s+SET\b|\bDELETE\s+FROM\b/i,
    );
    expect(readdirSync("supabase/migrations")).toContain(
      "20261010420000_vin_decodes_server_only.sql",
    );
  });

  it("N1: RLS stays on with zero policies on vin_decodes (planted: policy alone, RLS off alone)", () => {
    expect(body).toMatch(
      /IF NOT \(SELECT relrowsecurity FROM pg_class WHERE oid = 'public\.vin_decodes'::regclass\) THEN/,
    );
    expect(body).toMatch(
      /IF EXISTS \(SELECT 1 FROM pg_policy WHERE polrelid = 'public\.vin_decodes'::regclass\) THEN/,
    );
    expect(cases).toContain("must_fail_16_policy_alone.sql");
    expect(cases).toContain("must_fail_17_rls_off_alone.sql");
    // Plant 18: even a service_role-only policy must fail (zero policies, not "no client policies").
    expect(cases).toContain("must_fail_18_service_role_policy.sql");
    expect(
      readFileSync(
        "supabase/tests/vin_decodes_closure/must_fail_18_service_role_policy.sql",
        "utf8",
      ),
    ).toMatch(
      /CREATE POLICY \w+ ON public\.vin_decodes\b[^;]*\bTO service_role\b/i,
    );
  });

  it("checks the table itself: table + column privileges and MAINTAIN (PG17+)", () => {
    expect(body).toContain("has_table_privilege(r, 'public.vin_decodes', p)");
    expect(body).toContain(
      "has_any_column_privilege(r, 'public.vin_decodes', p)",
    );
    expect(body).toContain(
      "pg17 AND has_table_privilege(r, 'public.vin_decodes', 'MAINTAIN')",
    );
  });

  it("walks views on views (views/matviews only) and checks SELECT, column SELECT and MAINTAIN", () => {
    expect(body.match(/WITH RECURSIVE closure\(oid\) AS/g)?.length).toBe(2);
    expect(
      body.match(
        /JOIN pg_class v ON v\.oid = rw\.ev_class AND v\.relkind IN \('v', 'm'\)/g,
      )?.length,
    ).toBe(2);
    expect(body).toContain(
      "IF has_table_privilege(r, obj, 'SELECT') OR has_any_column_privilege(r, obj, 'SELECT') THEN",
    );
    expect(body).toContain("pg17 AND has_table_privilege(r, obj, 'MAINTAIN')");
  });

  it("matches definer functions on schema plus name with search_path resolution and escaped names", () => {
    expect(body).toMatch(/WHERE p2\.prosecdef/);
    expect(body).toMatch(/WHERE cfg LIKE 'search_path=%'\) AS path/);
    expect(body).toContain(
      "(NOT fd.sets_path OR lower(n.nspname) = ANY (fd.path))",
    );
    expect(
      body.match(/regexp_replace\(c[ln]\.(relname|nspname), /g)?.length,
    ).toBe(2);
    expect(body).toMatch(/d\.classid = 'pg_proc'::regclass/);
    expect(body).toMatch(/has_function_privilege\(r, obj, 'EXECUTE'\)/);
    expect(raw).toMatch(/Dynamic SQL/);
    expect(raw).toMatch(/Definer calling invoker/);
  });

  it("ships planted must-fail and must-pass cases for every rule", () => {
    const fail = cases.filter((c) => c.startsWith("must_fail_"));
    const pass = cases.filter((c) => c.startsWith("must_pass_"));
    expect(fail.length).toBeGreaterThanOrEqual(12);
    expect(pass.length).toBeGreaterThanOrEqual(5);
    for (const rule of [
      "view_on_view",
      "matview",
      "column_grant",
      "maintain",
      "escaped_name",
      "path",
      "quoted",
      "begin_atomic",
    ])
      expect(
        fail.some((c) => c.includes(rule)),
        rule,
      ).toBe(true);
    expect(pass.some((c) => c.includes("rule_on_client_table"))).toBe(true);
    expect(pass.some((c) => c.includes("other_schema"))).toBe(true);
  });
});
