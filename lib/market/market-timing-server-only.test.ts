import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const NAME = "20261010120000_market_timing_stripe_events_server_only.sql";
const DIR = "supabase/migrations";
const sql = readFileSync(`${DIR}/${NAME}`, "utf8");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const later = files.filter((f) => f > NAME);
const read = (f: string) =>
  readFileSync(`${DIR}/${f}`, "utf8").replace(/--[^\n]*/g, "");

const CLIENT_GRANT = (obj: string) =>
  new RegExp(
    String.raw`GRANT\s+[^;]*\bON\s+(TABLE\s+)?(public\.)?${obj}\b[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b`,
    "i",
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

  it("no migration grants market_timing_signals or stripe_events to client roles", () => {
    for (const f of files) {
      const body = read(f);
      expect(body, f).not.toMatch(CLIENT_GRANT("market_timing_signals"));
      expect(body, f).not.toMatch(CLIENT_GRANT("stripe_events"));
      expect(body, f).not.toMatch(
        /CREATE\s+POLICY[^;]*\bON\s+(public\.)?stripe_events\b/i,
      );
    }
  });

  it("later migrations keep security_invoker, keep RLS, and re-revoke if they drop the view", () => {
    for (const f of later) {
      const body = read(f);
      expect(body, f).not.toMatch(
        /market_timing_signals[^;]*security_invoker\s*=\s*(false|off|0)\b/i,
      );
      expect(body, f).not.toMatch(
        /market_timing_signals[^;]*RESET\s*\([^)]*security_invoker/i,
      );
      if (/DROP\s+VIEW[^;]*market_timing_signals/i.test(body)) {
        // A dropped + recreated view picks up Supabase default client grants again.
        expect(body, f).toMatch(
          /REVOKE\s+ALL\s+ON\s+(TABLE\s+)?(public\.)?market_timing_signals\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
        );
      }
      expect(body, f).not.toMatch(
        /DISABLE\s+ROW\s+LEVEL\s+SECURITY[^;]*stripe_events|stripe_events[^;]*DISABLE\s+ROW\s+LEVEL\s+SECURITY/i,
      );
    }
  });

  it("every migration that (re)defines the view sets security_invoker = true", () => {
    // CREATE OR REPLACE VIEW replaces reloptions, so the option must be restated each time.
    for (const f of files) {
      const defs = read(f).match(
        /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+(public\.)?market_timing_signals\b[^;]*?\bAS\b/gi,
      );
      for (const d of defs ?? []) {
        expect(d, f).toMatch(/security_invoker\s*=\s*true/i);
      }
    }
  });
});
