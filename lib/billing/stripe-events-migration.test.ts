import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NAME = "20261010100000_stripe_events.sql";
const sql = readFileSync(`supabase/migrations/${NAME}`, "utf8");

describe("stripe_events migration", () => {
  it("is server-only: RLS on, client grants revoked, service_role only", () => {
    expect(sql).toContain(
      "ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;",
    );
    expect(sql).toContain(
      "REVOKE ALL ON public.stripe_events FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, DELETE ON public\.stripe_events TO service_role;/,
    );
    expect(sql).not.toMatch(/CREATE POLICY/i);
  });

  it("self-checks anon/authenticated x S/I/U/D and service_role INSERT", () => {
    expect(sql).toMatch(/ARRAY\['anon', 'authenticated'\]/);
    expect(sql).toMatch(/ARRAY\['SELECT', 'INSERT', 'UPDATE', 'DELETE'\]/);
    expect(sql).toMatch(
      /has_table_privilege\('service_role', 'public\.stripe_events', 'INSERT'\)/,
    );
  });

  it("no migration re-grants stripe_events to client roles or adds a policy for them", () => {
    const files = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const body = readFileSync(`supabase/migrations/${f}`, "utf8");
      expect(body, f).not.toMatch(
        /GRANT\s+[^;]*\bON\s+(TABLE\s+)?(public\.)?stripe_events\b[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i,
      );
      expect(body, f).not.toMatch(
        /CREATE\s+POLICY[^;]*\bON\s+(public\.)?stripe_events\b/i,
      );
      if (f > NAME) {
        expect(body, f).not.toMatch(
          /DISABLE\s+ROW\s+LEVEL\s+SECURITY[^;]*stripe_events|stripe_events[^;]*DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
        );
      }
    }
  });
});
