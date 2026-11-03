import { afterEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  rows: [] as any[],
  error: null as any,
  upsert: vi.fn(async (): Promise<{ error: any }> => ({ error: null })),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: async () => ({ data: db.rows, error: db.error }),
      upsert: db.upsert,
    }),
  }),
}));
import { ScraperStateManager } from "./state";
import { ScraperRegistry } from "./registry";
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  db.rows = [];
  db.error = null;
});

function fixture() {
  const registry = new ScraperRegistry();
  registry.register({
    id: "source",
    name: "Source",
    type: "marketplace",
    priority: "medium",
    frequencyMinutes: 60,
    requiresAuth: false,
    stealthRequired: false,
    fn: async () => 0,
    enabled: true,
    estimatedDealsPerRun: 10,
  });
  return {
    registry,
    manager: new ScraperStateManager({
      supabaseUrl: "https://test.invalid",
      supabaseKey: "synthetic-test-key",
    }),
  };
}

it("restores configured availability after restart without erasing failure history or cooldown", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  db.rows = [
    {
      source_id: "source",
      enabled: false,
      consecutive_failures: 10,
      auto_disable_threshold: 5,
      last_run_at: "2026-11-02T11:00:00Z",
      run_count: 99,
      success_rate: 0.4,
    },
  ];
  const { registry, manager } = fixture();
  await manager.loadState(registry);
  const source = registry.get("source")!;
  expect(source.enabled).toBe(true);
  expect(source.consecutiveFailures).toBe(10);
  expect(source.runCount).toBe(99);
  expect(registry.getDueForRun()).toEqual([]);
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"));
  expect(registry.getDueForRun()).toEqual([source]);
  await manager.saveSourceState(source);
  expect(db.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      enabled: true,
      consecutive_failures: 10,
      run_count: 99,
    }),
    { onConflict: "source_id" },
  );
});

it("does not let stored flags change explicitly configured registry availability", async () => {
  const { registry, manager } = fixture();
  registry.get("source")!.enabled = false;
  db.rows = [
    { source_id: "source", enabled: true },
    { source_id: "unknown", enabled: true },
  ];
  await manager.loadState(registry);
  expect(registry.get("source")!.enabled).toBe(false);
  expect(registry.getAll()).toHaveLength(1);
});

it("reports a failed state write without reporting confirmation", async () => {
  const { registry, manager } = fixture();
  db.upsert.mockResolvedValueOnce({
    error: { message: "Synthetic write failure" },
  });
  expect(await manager.saveSourceState(registry.get("source")!)).toBe(false);
  expect(registry.get("source")!.enabled).toBe(true);
});
