import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION =
  "supabase/migrations/20261010030000_supabase_advisor_rls_hardening.sql";
const sql = readFileSync(MIGRATION, "utf8");

describe("supabase advisor + RLS hardening migration", () => {
  it("revokes anon/authenticated EXECUTE on the flagged SECURITY DEFINER functions", () => {
    for (const fn of [
      "count_by_state(text, text)",
      "dealer_inventory()",
      "find_duplicate_vins(integer)",
      "landing_proof()",
      "mirror_user_profile_to_profiles()",
      "rls_auto_enable()",
    ]) {
      const esc = fn.replace(/[()]/g, "\\$&");
      expect(sql).toMatch(
        new RegExp(
          `REVOKE EXECUTE ON FUNCTION public\\.${esc}\\s+FROM PUBLIC, anon, authenticated;`,
        ),
      );
    }
    expect(sql).not.toMatch(
      /GRANT\s+EXECUTE[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i,
    );
  });

  it("makes source_health security_invoker and removes client grants", () => {
    expect(sql).toContain(
      "ALTER VIEW public.source_health SET (security_invoker = true);",
    );
    expect(sql).toContain(
      "REVOKE ALL ON public.source_health FROM anon, authenticated;",
    );
  });

  it("wraps every auth.<fn>() in a policy as (SELECT auth.<fn>())", () => {
    const policies = sql
      .split("CREATE POLICY")
      .slice(1)
      .map((p) => p.split(";")[0]);
    expect(policies.length).toBe(40);
    for (const p of policies) {
      expect(p).not.toMatch(/(?<!SELECT )auth\.(uid|jwt|role|email)\(\)/);
    }
  });

  it("never grants anything back to client roles", () => {
    expect(sql).not.toMatch(
      /\bGRANT\b[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i,
    );
  });

  it("is wrapped in a single transaction", () => {
    expect(sql).toMatch(/^BEGIN;$/m);
    expect(sql).toMatch(/^COMMIT;$/m);
  });
});
