/**
 * Job-level failure log end to end: a scraper that swallows its own fetch errors and returns 0 used
 * to be recorded as "success, 0 deals". The orchestrator now writes the run's outcome and error
 * counts (captured inside the fetch layer) onto its scraper_runs row, plus error samples.
 */
import { describe, expect, it } from "vitest";
import { ScraperRegistry } from "../tools/registry";
import { ConcurrentOrchestrator } from "./concurrent";
import { recordError, recordResponse } from "../ops/run-telemetry";

function fakeSupabase() {
  const updates: any[] = [];
  const inserts: Record<string, any[]> = {};
  let n = 0;
  const sb: any = {
    from: (table: string) => ({
      insert: (rows: any) => {
        inserts[table] = [
          ...(inserts[table] ?? []),
          ...(Array.isArray(rows) ? rows : [rows]),
        ];
        const res = { data: { id: `run-${++n}` }, error: null };
        return {
          select: () => ({ single: async () => res }),
          then: (r: any) => r({ error: null }),
        };
      },
      update: (patch: any) => {
        updates.push(patch);
        const chain: any = {
          eq: () => chain,
          then: (r: any) => r({ error: null }),
        };
        return chain;
      },
    }),
  };
  return { sb, updates, inserts };
}

describe("orchestrator writes honest run outcomes", () => {
  it("blocked vs ok vs failed, per source, concurrently", async () => {
    const registry = new ScraperRegistry();
    const base = {
      type: "marketplace" as const,
      priority: "medium" as const,
      frequencyMinutes: 60,
      requiresAuth: false,
      stealthRequired: false,
      enabled: true,
      estimatedDealsPerRun: 1,
    };
    registry.register({
      ...base,
      id: "walled",
      name: "Walled",
      fn: async () => {
        // adapter catches its own 403s and returns 0 (the old "success, 0 deals")
        recordResponse("https://walled.example/a", 403);
        await new Promise((r) => setTimeout(r, 5));
        recordResponse("https://walled.example/b", 403);
        return 0;
      },
    });
    registry.register({
      ...base,
      id: "fine",
      name: "Fine",
      fn: async () => {
        recordResponse("https://fine.example/a", 200);
        return 7;
      },
    });
    registry.register({
      ...base,
      id: "drifted",
      name: "Drifted",
      fn: async () => {
        recordResponse("https://drifted.example/a", 200);
        recordError("parse_empty", { url: "https://drifted.example/a" });
        return 0;
      },
    });
    const orch = new ConcurrentOrchestrator(registry, {
      logToConsole: false,
      concurrency: 3,
      supabaseUrl: "http://localhost:54321",
      supabaseKey: "test",
      scanModes: { fine: "incremental" },
    });
    const fake = fakeSupabase();
    (orch as any).supabase = fake.sb;
    const results = await orch.run();
    expect(results).toHaveLength(3);
    const byOutcome = Object.fromEntries(
      fake.updates.filter((u) => u.outcome).map((u) => [u.outcome, u]),
    );
    expect(byOutcome.blocked).toMatchObject({
      error_counts: { http_403: 2 },
      requests: 2,
      deals_found: 0,
    });
    expect(byOutcome.ok).toMatchObject({
      deals_found: 7,
      scan_mode: "incremental",
    });
    expect(byOutcome.failed).toMatchObject({
      error_counts: { parse_empty: 1 },
    });
    expect(fake.inserts.scraper_errors?.length).toBe(3);
    expect(registry.get("walled")!.enabled).toBe(true);
  });
});
