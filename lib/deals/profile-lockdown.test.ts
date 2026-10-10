import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261010040000_profile_privilege_lockdown.sql", "utf8");

describe("profile privilege lockdown migration", () => {
  it("never grants table-wide write or protected columns to client roles", () => {
    expect(sql).not.toMatch(/GRANT\s+(ALL|INSERT|DELETE|UPDATE\s+ON)[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i);
    const grants = sql.match(/GRANT UPDATE \(([^)]*)\)/g) ?? [];
    expect(grants.length).toBe(2);
    for (const g of grants) {
      expect(g).not.toMatch(/\b(role|plan|plan_started_at|plan_ended_at|stripe_customer_id|stripe_subscription_id|email|id)\b/);
    }
  });

  it("own-row policies carry WITH CHECK", () => {
    expect(sql).toMatch(/CREATE POLICY "own_profile"[\s\S]*?WITH CHECK \(\(SELECT auth\.uid\(\)\) = id\);/);
    expect(sql).toMatch(/CREATE POLICY "Users update own profile"[\s\S]*?WITH CHECK \(\(SELECT auth\.uid\(\)\) = id\);/);
  });

  it("guard triggers protect role/plan/billing columns", () => {
    for (const col of ["role", "plan", "plan_started_at", "plan_ended_at", "stripe_customer_id", "stripe_subscription_id"]) {
      expect(sql).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.user_profiles/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.profiles/);
  });

  it("admin policy reads user_roles, harvest_states_read is dropped", () => {
    expect(sql).toMatch(/"page_views_admin_read"[\s\S]*?FROM public\.user_roles/);
    expect(sql).toContain('DROP POLICY IF EXISTS "harvest_states_read" ON public.harvest_states;');
  });
});
