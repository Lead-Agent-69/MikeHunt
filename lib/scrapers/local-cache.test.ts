import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStorageBudgetChecker } from "./storage-budget";
import { withSweepPlan } from "./sweep-plan";
import { withScrapeRunScope } from "./run-scope-context";
import {
  DEFAULT_MAX_DAILY_INSERTS,
  LocalScraperCache,
  classifyColumns,
  listingHash,
  touchIsDue,
  listingIdBatches,
  compactCacheEntries,
} from "./local-cache";

const tempDirs: string[] = [];
describe("local cache compaction", () => {
  it("expires previews and stale synced fingerprints but keeps unsynced inventory and sold evidence", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    const old = {
      hash: "h",
      synced: false,
      lastSeenAt: "2025-01-01T00:00:00Z",
      data: { vin: "queued" },
    };
    const entries = {
      "scan-preview|old": { ...old },
      "dealer|synced": { ...old, synced: true },
      "dealer|queued": { ...old },
      "ebay-sold|old": { ...old },
      "dealer|recent": {
        ...old,
        synced: true,
        lastSeenAt: "2026-10-10T00:00:00Z",
      },
      "dealer|invalid": { ...old, synced: true, lastSeenAt: "unknown" },
    };
    expect(compactCacheEntries(entries, now)).toBe(2);
    expect(Object.keys(entries)).toEqual([
      "dealer|queued",
      "ebay-sold|old",
      "dealer|recent",
      "dealer|invalid",
    ]);
  });
});
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeCache(
  options: ConstructorParameters<typeof LocalScraperCache>[0] = {},
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mikehunt-local-cache-"));
  tempDirs.push(dir);
  const cache = new LocalScraperCache({ path: dir, ...options });
  await cache.load();
  return { cache, dir };
}

function expiryClient(
  options: { readError?: boolean; writeError?: boolean; changed?: number } = {},
) {
  const calls: unknown[][] = [];
  const query: any = {};
  for (const method of ["eq", "lte", "order", "in"])
    query[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    };
  query.limit = async (limit: number) => {
    calls.push(["limit", limit]);
    return {
      data: Array.from({ length: limit }, (_, id) => ({ id: `id-${id}` })),
      error: options.readError ? { message: "read failed" } : null,
    };
  };
  query.select = async () => ({
    data: Array.from({ length: options.changed ?? 1 }, (_, id) => ({
      id: `id-${id}`,
      source: "gov_auction",
      source_deal_id: `lot-${id}`,
    })),
    error: options.writeError ? { message: "write failed" } : null,
  });
  const client = {
    from: vi.fn(() => ({
      select: () => query,
      update: (patch: any) => {
        calls.push(["update", patch]);
        return query;
      },
    })),
  };
  return { client: client as any, calls };
}

describe("bounded auction expiry", () => {
  it("deactivates without deleting, rechecks end time, and persists shared update usage", async () => {
    const { cache, dir } = await makeCache({ maxDailyUpdates: 10 });
    const { client, calls } = expiryClient({ changed: 3 });
    expect(await cache.deactivateEndedAuctions(client)).toBe(3);
    expect(calls).toContainEqual(["limit", 8]);
    expect(calls).toContainEqual(["update", { active: false }]);
    const dates = calls.filter((call) => call[0] === "lte");
    expect(dates).toHaveLength(2);
    expect(dates[0]).toEqual(dates[1]);
    expect(cache.getQuota().updates).toBe(3);
    const reloaded = new LocalScraperCache({ path: dir, maxDailyUpdates: 10 });
    await reloaded.load();
    expect(reloaded.getQuota().updates).toBe(3);
  });
  it("stops at the existing 80 percent budget and in cache-only or paused modes", async () => {
    const { cache } = await makeCache({ maxDailyUpdates: 5 });
    const first = expiryClient({ changed: 4 });
    await cache.deactivateEndedAuctions(first.client);
    const second = expiryClient();
    expect(await cache.deactivateEndedAuctions(second.client)).toBe(0);
    expect(second.client.from).not.toHaveBeenCalled();
    for (const options of [
      { cacheOnly: true },
      { beforeWrite: async () => false },
    ]) {
      const { cache: blocked } = await makeCache(options);
      expect(await blocked.deactivateEndedAuctions(second.client)).toBe(0);
      expect(second.client.from).not.toHaveBeenCalled();
    }
  });
  it("charges only changed rows, not concurrently rescheduled lots", async () => {
    const { cache } = await makeCache();
    expect(
      await cache.deactivateEndedAuctions(expiryClient({ changed: 0 }).client),
    ).toBe(0);
    expect(cache.getQuota().updates).toBe(0);
  });
  it("surfaces database errors without claiming success or resetting quota", async () => {
    const { cache } = await makeCache();
    await expect(
      cache.deactivateEndedAuctions(expiryClient({ readError: true }).client),
    ).rejects.toThrow("Auction expiry read failed");
    await expect(
      cache.deactivateEndedAuctions(expiryClient({ writeError: true }).client),
    ).rejects.toThrow("Auction expiry update failed");
    expect(cache.getQuota().updates).toBe(0);
  });
});

function fakeSupabase(
  initial: Record<string, any>[] = [],
  hooks: {
    beforeTouch?: (rows: Map<string, Record<string, any>>) => void;
    beforeUpsert?: (rows: Map<string, Record<string, any>>) => void;
    touchError?: string;
    count?: number | null;
  } = {},
) {
  const rows = new Map(
    initial.map((row) => [`${row.source}|${row.source_deal_id}`, { ...row }]),
  );
  const writes: Record<string, any>[][] = [];
  const touches: { source: string; ids: string[]; patch: any }[] = [];
  const reads: string[][] = [];
  const touchOptions: unknown[] = [];
  const upsertOptions: unknown[] = [];
  return {
    rows,
    writes,
    touches,
    reads,
    touchOptions,
    upsertOptions,
    client: {
      from: () => ({
        update: (patch: Record<string, any>, options?: { count?: string }) => {
          const equal = new Map<string, string>();
          const bounds = new Map<string, string>();
          const query: any = {
            abortSignal: () => query,
            eq: (key: string, value: string) => {
              equal.set(key, value);
              return query;
            },
            lte: (key: string, value: string) => {
              bounds.set(key, value);
              return query;
            },
            in: async (_idColumn: string, ids: string[]) => {
              const source = equal.get("source")!;
              touches.push({ source, ids, patch });
              touchOptions.push(options);
              hooks.beforeTouch?.(rows);
              let changed = 0;
              for (const id of ids) {
                const stored = rows.get(`${source}|${id}`);
                if (
                  stored &&
                  !hooks.touchError &&
                  Array.from(equal).every(([k, v]) => stored[k] === v) &&
                  Array.from(bounds).every(
                    ([k, v]) => Date.parse(stored[k]) <= Date.parse(v),
                  )
                ) {
                  Object.assign(stored, patch);
                  changed++;
                }
              }
              return {
                data: null,
                error: hooks.touchError ? { message: hooks.touchError } : null,
                count:
                  options?.count === "exact"
                    ? Object.prototype.hasOwnProperty.call(hooks, "count")
                      ? hooks.count
                      : changed
                    : null,
              };
            },
          };
          return query;
        },
        select: () => {
          let source = "";
          return {
            eq: (_column: string, value: string) => {
              source = value;
              return {
                in: async (_idColumn: string, ids: string[]) => {
                  reads.push(ids);
                  return {
                    data: ids
                      .map((id) => rows.get(`${source}|${id}`))
                      .filter(Boolean),
                    error: null,
                  };
                },
              };
            },
          };
        },
        upsert: (
          batch: Record<string, any>[],
          options?: { ignoreDuplicates?: boolean },
        ) => ({
          select: async () => {
            writes.push(batch);
            upsertOptions.push(options);
            hooks.beforeUpsert?.(rows);
            const result = batch
              .filter(
                (row) =>
                  !options?.ignoreDuplicates ||
                  !rows.has(`${row.source}|${row.source_deal_id}`),
              )
              .map((row) => {
                const persisted = {
                  ...rows.get(`${row.source}|${row.source_deal_id}`),
                  ...row,
                  id: row.id || `${row.source}-${row.source_deal_id}`,
                };
                rows.set(`${row.source}|${row.source_deal_id}`, persisted);
                return {
                  ...persisted,
                  updated_at: row.updated_at || new Date().toISOString(),
                };
              });
            return { data: result, error: null };
          },
        }),
      }),
    } as any,
  };
}

const row = (id: string, ask_price = 10000) => ({
  source: "test",
  source_deal_id: id,
  ask_price,
  year: 2020,
  make: "Honda",
  model: "Civic",
  mileage: 50000,
  active: true,
  options: { fuel: "gas" },
});

describe("LocalScraperCache", () => {
  const pendingDealer = (id: string) => ({
    ...row(id),
    source: "independent_dealer",
    source_url: `https://billsmithauto.com/vehicle/${id}`,
    location_state: "IL",
    images: ["https://billsmithauto.com/photos/car.jpg"],
    last_seen_at: new Date(Date.now() - 3600_000).toISOString(),
    updated_at: new Date(Date.now() - 3600_000).toISOString(),
  });
  it("recovers fresh cached dealers after restart without changing their observation time", async () => {
    const { cache, dir } = await makeCache({ cacheOnly: true });
    const db = fakeSupabase();
    const snapshot = pendingDealer("recover");
    await cache.persistRows([snapshot], db.client, "*");
    const resumed = new LocalScraperCache({ path: dir });
    await resumed.load();
    expect(await resumed.publishPendingDealers(db.client, ["MO"])).toBe(0);
    expect(await resumed.publishPendingDealers(db.client, ["IL"])).toBe(1);
    expect(db.rows.get("independent_dealer|recover")?.last_seen_at).toBe(
      snapshot.last_seen_at,
    );
    expect(db.upsertOptions).toContainEqual({
      onConflict: "source,source_deal_id",
      ignoreDuplicates: true,
    });
    expect(await resumed.publishPendingDealers(db.client, ["IL"])).toBe(0);
  });
  it("never overwrites, touches, or reactivates existing records during recovery", async () => {
    const { cache } = await makeCache();
    const old = pendingDealer("existing");
    const current = {
      ...old,
      ask_price: 14000,
      active: false,
      updated_at: new Date().toISOString(),
    };
    const db = fakeSupabase([current]);
    const result = await cache.persistRows([old], db.client, "*", {
      insertOnly: true,
    });
    expect(result).toMatchObject({ inserts: 0, updates: 0, touches: 0 });
    expect(db.writes).toHaveLength(0);
    expect(db.rows.get("independent_dealer|existing")).toEqual(current);
    expect(await cache.publishPendingDealers(db.client, ["IL"])).toBe(0);
    expect(db.reads).toHaveLength(1);
  });
  it("does not renew a synced observation even when its touch interval has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    const { cache } = await makeCache();
    const db = fakeSupabase();
    const snapshot = pendingDealer("synced");
    await cache.persistRows([snapshot], db.client, "*");
    vi.setSystemTime(new Date("2026-10-20T13:00:00Z"));
    const recovered = await cache.persistRows([snapshot], db.client, "*", {
      insertOnly: true,
    });
    expect(recovered).toMatchObject({ saved: 0, touches: 0, updates: 0 });
    expect(db.touches).toHaveLength(0);
    expect(db.rows.get("independent_dealer|synced")?.last_seen_at).toBe(
      snapshot.last_seen_at,
    );
  });

  it("protects a newer row inserted between lookup and the recovery write", async () => {
    const { cache } = await makeCache();
    const old = pendingDealer("race");
    const current = { ...old, ask_price: 15000, active: false };
    const db = fakeSupabase([], {
      beforeUpsert: (rows) => rows.set("independent_dealer|race", current),
    });
    const result = await cache.persistRows([old], db.client, "*", {
      insertOnly: true,
    });
    expect(result.saved).toBe(0);
    expect(cache.getQuota().inserts).toBe(0);
    expect(db.rows.get("independent_dealer|race")).toEqual(current);
  });
  it("does no recovery database work at the intake limit or in cache-only mode", async () => {
    const { cache } = await makeCache({ maxDailyInserts: 1 });
    const db = fakeSupabase();
    await cache.persistRows([pendingDealer("first")], db.client, "*");
    await cache.persistRows([pendingDealer("queued")], db.client, "*");
    const reads = db.reads.length;
    expect(await cache.publishPendingDealers(db.client, ["IL"])).toBe(0);
    expect(db.reads).toHaveLength(reads);
    const { cache: offline } = await makeCache({ cacheOnly: true });
    await offline.persistRows([pendingDealer("offline")], db.client, "*");
    expect(await offline.publishPendingDealers(db.client, ["IL"])).toBe(0);
    expect(db.reads).toHaveLength(reads);
  });
  it("keeps storage and paused-write protections during pending recovery", async () => {
    for (const guards of [
      { allowInsert: async () => false },
      { beforeWrite: async () => false },
    ]) {
      const { cache, dir } = await makeCache({ cacheOnly: true });
      const db = fakeSupabase();
      await cache.persistRows([pendingDealer("guarded")], db.client, "*");
      const resumed = new LocalScraperCache({ path: dir, ...guards });
      await resumed.load();
      expect(await resumed.publishPendingDealers(db.client, ["IL"])).toBe(0);
      expect(db.writes).toHaveLength(0);
      expect((await resumed.records("independent_dealer"))[0].cacheSynced).toBe(
        false,
      );
    }
  });
  const marketPlan = {
    states: ["MO", "IL"],
    demandStates: ["MO"],
    zipsByState: { MO: ["63101"] },
  };
  it("reserves market-sweep intake for located inventory while retaining unlocated payloads", async () => {
    const { cache } = await makeCache({ maxDailyInserts: 1 });
    const db = fakeSupabase();
    const result = await withSweepPlan(marketPlan, () =>
      cache.persistRows(
        [
          row("unknown"),
          { ...row("invalid"), location_state: "XX" },
          { ...row("local"), location_state: "MO" },
        ],
        db.client,
        "*",
      ),
    );
    expect(result).toMatchObject({ inserts: 1, updates: 0 });
    expect(db.writes.flat().map((item) => item.source_deal_id)).toEqual([
      "local",
    ]);
    expect(cache.getQuota().inserts).toBe(1);
    expect(await cache.records("test")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_deal_id: "unknown",
          cacheSynced: false,
        }),
        expect.objectContaining({
          source_deal_id: "invalid",
          location_state: "XX",
          cacheSynced: false,
        }),
      ]),
    );
  });
  it("keeps existing unlocated listings updatable and accepts real border locations", async () => {
    const { cache } = await makeCache();
    const db = fakeSupabase([row("existing")]);
    const result = await withSweepPlan(marketPlan, () =>
      cache.persistRows(
        [row("existing", 9000), { ...row("border"), location_state: "IL" }],
        db.client,
        "*",
      ),
    );
    expect(result).toMatchObject({ inserts: 1, updates: 1 });
    expect(db.rows.get("test|existing")?.ask_price).toBe(9000);
    expect(db.rows.get("test|border")?.location_state).toBe("IL");
  });
  it("does not change explicit buyer searches, even inside a sweep context", async () => {
    const { cache } = await makeCache();
    const db = fakeSupabase();
    const result = await withSweepPlan(marketPlan, () =>
      withScrapeRunScope({ state: "MO" }, () =>
        cache.persistRows([row("explicit")], db.client, "*"),
      ),
    );
    expect(result.inserts).toBe(1);
  });
  it("leaves non-demand and direct collection unchanged without leaking context", async () => {
    const { cache } = await makeCache();
    const db = fakeSupabase();
    await withSweepPlan(marketPlan, () =>
      cache.persistRows([row("deferred")], db.client, "*"),
    );
    expect(
      (await cache.persistRows([row("direct")], db.client, "*")).inserts,
    ).toBe(1);
    for (const plan of [
      { ...marketPlan, demandStates: undefined },
      { ...marketPlan, demandStates: [] },
      { ...marketPlan, demandStates: ["TX"] },
      { ...marketPlan, states: ["XX"], demandStates: ["XX"] },
    ]) {
      const result = await withSweepPlan(plan, () =>
        cache.persistRows(
          [row(`baseline-${JSON.stringify(plan)}`)],
          db.client,
          "*",
        ),
      );
      expect(result.inserts).toBe(1);
    }
    expect(db.rows.has("test|deferred")).toBe(false);
  });
  it("publishes a deferred observation only after the source supplies a real location", async () => {
    const { cache } = await makeCache();
    const db = fakeSupabase();
    await withSweepPlan(marketPlan, () =>
      cache.persistRows([row("later")], db.client, "*"),
    );
    expect(cache.getQuota().inserts).toBe(0);
    expect((await cache.records("test"))[0].location_state).toBeUndefined();
    const result = await withSweepPlan(marketPlan, () =>
      cache.persistRows(
        [{ ...row("later"), location_state: "MO" }],
        db.client,
        "*",
      ),
    );
    expect(result.inserts).toBe(1);
    expect(db.rows.get("test|later")?.location_state).toBe("MO");
  });
  const observed = (id: string) => ({
    ...row(id),
    source_url: `https://dealer.example/${id}`,
    images: ["https://dealer.example/car.jpg"],
    last_seen_at: "2026-10-17T00:00:00.000Z",
    updated_at: "2026-10-17T00:00:00.000Z",
    deal_analysis: { profit: 1000 },
  });
  it("spends its last full update on a seller price change while touching model-only observations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    const { cache } = await makeCache({ maxDailyUpdates: 1 });
    const db = fakeSupabase([observed("model"), observed("price")]);
    const result = await cache.persistRows(
      [
        {
          ...observed("model"),
          last_seen_at: new Date().toISOString(),
          deal_analysis: { profit: 500 },
        },
        { ...observed("price"), ask_price: 9000 },
      ],
      db.client,
      "*",
    );
    expect(result).toMatchObject({ updates: 1, touches: 1 });
    expect(Array.from(result.priceChangedKeys)).toEqual(["test|price"]);
    expect(db.writes[0][0].source_deal_id).toBe("price");
    expect(db.rows.get("test|model")?.deal_analysis).toEqual({ profit: 1000 });
    expect(db.rows.get("test|model")?.last_seen_at).toBe(
      new Date().toISOString(),
    );
    expect(
      (await cache.records("test")).find((r) => r.source_deal_id === "model"),
    ).toMatchObject({
      cacheSynced: false,
      deal_analysis: { profit: 500 },
    });
    expect(cache.getQuota()).toMatchObject({ updates: 1, touches: 1 });
    vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
    const next = await cache.persistRows(
      [
        {
          ...observed("model"),
          last_seen_at: new Date().toISOString(),
          deal_analysis: { profit: 500 },
        },
      ],
      db.client,
      "*",
    );
    expect(next).toMatchObject({ updates: 1, inserts: 0 });
    expect(next.priceChangedKeys.size).toBe(0);
    expect(db.rows.get("test|model")?.deal_analysis).toEqual({ profit: 500 });
  });
  it.each(["concurrent", "failure", "unknown", "missing", "newer observation"])(
    "never confirms a deferred model update after %s",
    async (mode) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
      const { cache } = await makeCache({ maxDailyUpdates: 1 });
      const hooks: Parameters<typeof fakeSupabase>[1] =
        mode === "failure"
          ? { touchError: "offline" }
          : mode === "unknown"
            ? { count: null }
            : {};
      const db = fakeSupabase([observed("model"), observed("burn")], hooks);
      await cache.persistRows(
        [{ ...observed("burn"), ask_price: 9000 }],
        db.client,
        "*",
      );
      hooks.beforeTouch = (rows) => {
        if (mode === "missing") rows.delete("test|model");
        if (mode === "concurrent")
          Object.assign(rows.get("test|model")!, {
            ask_price: 3000,
            updated_at: new Date().toISOString(),
          });
        if (mode === "newer observation")
          rows.get("test|model")!.last_seen_at = "2026-10-19T00:00:30.000Z";
      };
      const result = await cache.persistRows(
        [
          {
            ...observed("model"),
            last_seen_at: new Date().toISOString(),
            deal_analysis: { profit: 500 },
          },
        ],
        db.client,
        "*",
      );
      expect(result).toMatchObject({ updates: 0, touches: 0 });
      expect(result.priceChangedKeys.size).toBe(0);
      expect(
        (await cache.records("test")).find((r) => r.source_deal_id === "model"),
      ).toMatchObject({ cacheSynced: false, deal_analysis: { profit: 500 } });
      expect(cache.getQuota().touches).toBe(1);
    },
  );
  it("does not freshen a changed price or replay an old buffered observation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
    const { cache } = await makeCache({ maxDailyUpdates: 1 });
    const db = fakeSupabase([observed("model"), observed("burn")]);
    await cache.persistRows(
      [{ ...observed("burn"), ask_price: 9000 }],
      db.client,
      "*",
    );
    for (const incoming of [
      {
        ...observed("model"),
        last_seen_at: new Date().toISOString(),
        ask_price: 2000,
      },
      { ...observed("model"), deal_analysis: { profit: 500 } },
    ])
      expect(
        (await cache.persistRows([incoming], db.client, "*")).touches,
      ).toBe(0);
    expect(db.touches).toHaveLength(0);
    expect(db.rows.get("test|model")?.last_seen_at).toBe(
      observed("model").last_seen_at,
    );
  });
  it.each(["paused", "touch budget"])(
    "respects the %s gate for verified observations",
    async (gate) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
      let writable = true;
      const { cache } = await makeCache({
        maxDailyUpdates: 1,
        maxDailyTouches: gate === "touch budget" ? 0 : 100,
        beforeWrite: async () => writable,
      });
      const db = fakeSupabase([observed("model"), observed("burn")]);
      await cache.persistRows(
        [{ ...observed("burn"), ask_price: 9000 }],
        db.client,
        "*",
      );
      if (gate === "paused") writable = false;
      const result = await cache.persistRows(
        [
          {
            ...observed("model"),
            last_seen_at: new Date().toISOString(),
            deal_analysis: { profit: 500 },
          },
        ],
        db.client,
        "*",
      );
      expect(result).toMatchObject({ touches: 0, updates: 0 });
      expect(db.touches).toHaveLength(0);
      expect(
        (await cache.records("test")).find((r) => r.source_deal_id === "model")
          ?.cacheSynced,
      ).toBe(false);
    },
  );
  it("preserves database insertion dates during mixed inserts and price updates", async () => {
    const { cache } = await makeCache();
    const original = "2026-09-01T00:00:00Z";
    const db = fakeSupabase([
      { ...row("existing"), created_at: original, first_seen_at: original },
    ]);
    const result = await cache.persistRows(
      ["existing", "new"].map((id) => ({
        ...row(id, 9000),
        created_at: "2026-10-19T00:00:00Z",
        first_seen_at: "2026-10-19T00:00:00Z",
        last_seen_at: "2026-10-19T00:00:00Z",
      })),
      db.client,
      "*",
    );
    expect(result).toMatchObject({ inserts: 1, updates: 1 });
    for (const written of db.writes.flat()) {
      expect(written).not.toHaveProperty("created_at");
      expect(written).not.toHaveProperty("first_seen_at");
      expect(written.last_seen_at).toBe("2026-10-19T00:00:00Z");
    }
    expect(db.rows.get("test|existing")).toMatchObject({
      ask_price: 9000,
      created_at: original,
      first_seen_at: original,
    });
  });

  it("strips insertion dates from buffered observations before later replay", async () => {
    const { cache, dir } = await makeCache({ cacheOnly: true });
    const db = fakeSupabase();
    await cache.persistRows(
      [
        {
          ...row("buffered"),
          created_at: "2020-01-01",
          first_seen_at: "2020-01-01",
        },
      ],
      db.client,
      "*",
    );
    const reloaded = new LocalScraperCache({ path: dir });
    await reloaded.load();
    const buffered = await reloaded.records("test");
    expect(buffered).toHaveLength(1);
    expect(buffered[0]).not.toHaveProperty("created_at");
    expect(buffered[0]).not.toHaveProperty("first_seen_at");
  });

  it("protects existing dates when replaying a legacy cache payload", async () => {
    const { cache } = await makeCache();
    const original = "2026-09-01T00:00:00Z";
    const db = fakeSupabase([
      { ...row("legacy"), created_at: original, first_seen_at: original },
    ]);
    await cache.rememberOnly("test", [
      {
        id: "legacy",
        value: {
          ...row("legacy", 8000),
          created_at: "2026-10-19",
          first_seen_at: "2026-10-19",
        },
      },
    ]);
    const [buffered] = await cache.records("test");
    const { cachedAt, cacheSynced, ...observation } = buffered;
    expect(cachedAt).toEqual(expect.any(String));
    expect(cacheSynced).toBe(false);
    await cache.persistRows([observation], db.client, "*");
    expect(db.writes[0][0]).not.toHaveProperty("created_at");
    expect(db.writes[0][0]).not.toHaveProperty("first_seen_at");
    expect(db.rows.get("test|legacy")).toMatchObject({
      ask_price: 8000,
      created_at: original,
      first_seen_at: original,
    });
  });

  it("refreshes existing prices after insert capacity is exhausted without inserting another car", async () => {
    const onQuota = vi.fn();
    const { cache } = await makeCache({ maxDailyInserts: 1, onQuota });
    const db = fakeSupabase();
    await cache.persistRows([row("existing")], db.client, "*");
    const result = await cache.persistRows(
      [row("existing", 9000), row("new")],
      db.client,
      "*",
    );
    expect(result).toMatchObject({
      saved: 1,
      inserts: 0,
      updates: 1,
      paused: false,
    });
    expect(cache.getQuota()).toMatchObject({ inserts: 1, updates: 1 });
    expect(db.rows.get("test|existing")?.ask_price).toBe(9000);
    expect(db.rows.has("test|new")).toBe(false);
    expect(onQuota).toHaveBeenLastCalledWith(expect.anything(), false);
  });
  it("does not mark a missing cached listing fresh and recovers it on the next pass", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    const { cache, dir } = await makeCache();
    const db = fakeSupabase();
    await cache.persistRows([row("missing")], db.client, "*");
    db.rows.delete("test|missing");
    vi.setSystemTime(new Date("2026-10-05T13:00:00Z"));
    const result = await cache.persistRows([row("missing")], db.client, "*");
    expect(result.touches).toBe(0);
    expect(db.touchOptions).toEqual([{ count: "exact" }]);
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(disk.entries["test|missing"]).toMatchObject({
      synced: false,
      data: { ask_price: 10000 },
    });
    expect(
      (await cache.persistRows([row("missing")], db.client, "*")).inserts,
    ).toBe(1);
    expect(cache.getQuota().inserts).toBe(2);
  });

  it("reports only confirmed touches and reclassifies a partially matched batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
    const { cache, dir } = await makeCache();
    const db = fakeSupabase();
    await cache.persistRows([row("a"), row("b")], db.client, "*");
    db.rows.delete("test|b");
    vi.setSystemTime(new Date("2026-10-05T13:00:00Z"));
    expect(
      (await cache.persistRows([row("a"), row("b")], db.client, "*")).touches,
    ).toBe(1);
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    for (const key of ["test|a", "test|b"])
      expect(disk.entries[key].synced).toBe(false);
    expect(
      (await cache.persistRows([row("a"), row("b")], db.client, "*")).inserts,
    ).toBe(1);
  });

  it.each([null, { message: "offline" }])(
    "keeps unconfirmed freshness observations buffered (%s)",
    async (error) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-05T00:00:00Z"));
      const { cache, dir } = await makeCache();
      const db = fakeSupabase();
      await cache.persistRows([row("uncertain")], db.client, "*");
      vi.setSystemTime(new Date("2026-10-05T13:00:00Z"));
      const client = {
        from: () => ({
          update: () => ({
            eq: () => ({ in: async () => ({ error, count: null }) }),
          }),
        }),
      } as any;
      expect(
        (await cache.persistRows([row("uncertain")], client, "*")).touches,
      ).toBe(0);
      const disk = JSON.parse(
        await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
      );
      expect(disk.entries["test|uncertain"]).toMatchObject({
        synced: false,
        data: { ask_price: 10000 },
      });
      expect(cache.getQuota().inserts).toBe(1);
      expect(cache.getQuota().touches).toBe(1);
    },
  );

  it("keeps a newer observation for a synced vehicle when writes are paused", async () => {
    let writable = true;
    const { cache, dir } = await makeCache({
      beforeWrite: async () => writable,
    });
    const db = fakeSupabase();
    await cache.persistRows([row("existing")], db.client, "*");
    writable = false;
    expect(
      (await cache.persistRows([row("existing", 8000)], db.client, "*")).saved,
    ).toBe(0);
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(disk.entries["test|existing"]).toMatchObject({
      synced: false,
      data: { ask_price: 8000 },
    });
    expect(cache.getQuota().inserts).toBe(1);
    expect(cache.getQuota().updates).toBe(0);
  });

  it("keeps a newer synced-vehicle observation after the update budget is exhausted", async () => {
    const { cache, dir } = await makeCache({ maxDailyUpdates: 1 });
    const db = fakeSupabase();
    await cache.persistRows([row("existing")], db.client, "*");
    await cache.persistRows([row("existing", 9000)], db.client, "*");
    expect(
      (await cache.persistRows([row("existing", 8000)], db.client, "*")).saved,
    ).toBe(0);
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(disk.entries["test|existing"]).toMatchObject({
      synced: false,
      data: { ask_price: 8000 },
    });
    const reloaded = new LocalScraperCache({ path: dir, maxDailyUpdates: 1 });
    await reloaded.load();
    expect(reloaded.getQuota().updates).toBe(1);
    expect((await reloaded.records("test"))[0].ask_price).toBe(8000);
  });

  it("durably buffers new and changed rows before a failed classification request", async () => {
    const { cache, dir } = await makeCache();
    const db = fakeSupabase();
    await cache.persistRows([row("existing")], db.client, "*");
    const offline = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: async () => ({ data: null, error: { message: "offline" } }),
          }),
        }),
      }),
    } as any;
    await expect(
      cache.persistRows(
        [row("existing", 8000), row("new", 7000)],
        offline,
        "*",
      ),
    ).rejects.toThrow("Could not classify");
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(disk.entries["test|existing"]).toMatchObject({
      synced: false,
      data: { ask_price: 8000 },
    });
    expect(disk.entries["test|new"]).toMatchObject({
      synced: false,
      data: { ask_price: 7000 },
    });
    expect(cache.getQuota().inserts).toBe(1);
  });

  it("durably buffers observations before a failed upsert without claiming success", async () => {
    const { cache, dir } = await makeCache();
    const db = fakeSupabase();
    await cache.persistRows([row("existing")], db.client, "*");
    const failing = {
      from: () => ({
        ...db.client.from(),
        upsert: () => ({
          select: async () => ({
            data: null,
            error: { message: "write failed" },
          }),
        }),
      }),
    } as any;
    await expect(
      cache.persistRows(
        [row("existing", 8000), row("new", 7000)],
        failing,
        "*",
      ),
    ).rejects.toThrow("Local deal batch failed");
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(disk.entries["test|existing"]).toMatchObject({
      synced: false,
      data: { ask_price: 8000 },
    });
    expect(disk.entries["test|new"]).toMatchObject({
      synced: false,
      data: { ask_price: 7000 },
    });
    expect(cache.getQuota().updates).toBe(0);
  });

  it("releases the serialized writer after a hanging size probe and preserves buffered observations", async () => {
    let clock = 0;
    const check = createStorageBudgetChecker(() => clock);
    const { cache, dir } = await makeCache({
      allowInsert: async (client) => (await check(client)).allowInsert,
    });
    const sb = fakeSupabase();
    const abortSignal = vi.fn().mockReturnValue(new Promise(() => {}));
    const rpc = vi
      .fn()
      .mockReturnValueOnce({ abortSignal })
      .mockReturnValue({
        abortSignal: vi
          .fn()
          .mockResolvedValue({ data: 100_000_000, error: null }),
      });
    const client = { ...sb.client, rpc } as any;
    vi.useFakeTimers();
    const first = cache.persistRows([row("hung-first")], client, "*");
    await vi.waitFor(() => expect(abortSignal).toHaveBeenCalledTimes(1));
    const second = cache.persistRows([row("queued-second")], client, "*");
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all([first, second]);
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(disk.entries["test|hung-first"].synced).toBe(false);
    expect(disk.entries["test|queued-second"].synced).toBe(false);
    expect(cache.getQuota().inserts).toBe(0);
    expect(abortSignal.mock.calls[0][0].aborted).toBe(true);
    clock = 60_000;
    await cache.persistRows(
      [row("hung-first"), row("queued-second")],
      client,
      "*",
    );
    expect(cache.getQuota().inserts).toBe(2);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("buffers size-blocked inserts without losing newer observations, while existing updates continue", async () => {
    let allow = false;
    const { cache, dir } = await makeCache({ allowInsert: async () => allow });
    const sb = fakeSupabase([row("existing")]);
    const first = await cache.persistRows(
      [row("existing", 9000), row("new")],
      sb.client,
      "id",
    );
    expect(first.inserts).toBe(0);
    expect(first.updates).toBe(1);
    expect(sb.rows.has("test|new")).toBe(false);
    await cache.persistRows([row("new", 8000)], sb.client, "id");
    const disk = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(disk.entries["test|new"].synced).toBe(false);
    expect(disk.entries["test|new"].data.ask_price).toBe(8000);
    allow = true;
    expect(
      (await cache.persistRows([row("new", 8000)], sb.client, "id")).inserts,
    ).toBe(1);
  });
  it("bounds long listing-ID reads by encoded URL size and persists all accepted rows", async () => {
    const { cache } = await makeCache({ maxDailyInserts: 1000 });
    const db = fakeSupabase();
    const ids = Array.from(
      { length: 120 },
      (_, i) => `dealer-${i}-${"long-slug-".repeat(20)}`,
    );
    const batches = listingIdBatches(ids);
    expect(batches.flat()).toEqual(ids);
    expect(
      batches.every(
        (batch) =>
          batch.reduce(
            (n, id) => n + encodeURIComponent(JSON.stringify(id)).length + 3,
            0,
          ) <= 3000,
      ),
    ).toBe(true);
    const result = await cache.persistRows(
      ids.map((id) => row(id)),
      db.client,
      "id,source,source_deal_id",
    );
    expect(result.saved).toBe(120);
    expect(db.reads).toEqual(batches);
    expect(listingIdBatches([])).toEqual([]);
  });
  it("hashes listing changes and skips unchanged rows while tracking price changes", async () => {
    const { cache } = await makeCache();
    const db = fakeSupabase();
    const first = await cache.persistRows(
      [row("a")],
      db.client,
      "id, source, source_deal_id, ask_price, updated_at",
    );
    expect(first.inserts).toBe(1);
    expect(first.rows).toHaveLength(1);

    const same = await cache.persistRows(
      [row("a")],
      db.client,
      "id, source, source_deal_id, ask_price, updated_at",
    );
    expect(same.saved).toBe(0);
    expect(db.writes).toHaveLength(1);

    const priceChange = await cache.persistRows(
      [row("a", 9500)],
      db.client,
      "id, source, source_deal_id, ask_price, updated_at",
    );
    expect(priceChange.updates).toBe(1);
    expect(priceChange.priceChangedKeys.has("test|a")).toBe(true);

    const dataChange = await cache.persistRows(
      [{ ...row("a", 9500), mileage: 51000 }],
      db.client,
      "id, source, source_deal_id, ask_price, updated_at",
    );
    expect(dataChange.updates).toBe(1);
    expect(dataChange.priceChangedKeys.size).toBe(0);
    expect(listingHash(row("a"))).not.toBe(listingHash(row("a", 9500)));
  });

  it("writes in batches of at most 50 with a persisted local cache", async () => {
    const { cache, dir } = await makeCache({ batchSize: 50 });
    const db = fakeSupabase();
    const listings = Array.from({ length: 51 }, (_, index) =>
      row(`id-${index}`),
    );
    const result = await cache.persistRows(
      listings,
      db.client,
      "id, source, source_deal_id, ask_price, updated_at",
    );
    expect(result.saved).toBe(51);
    expect(db.writes.map((batch) => batch.length)).toEqual([50, 1]);
    const state = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(Object.keys(state.entries)).toHaveLength(51);
    expect(state.quota.inserts).toBe(51);
  });

  it("keeps cache-only records locally without making Supabase calls", async () => {
    const { cache, dir } = await makeCache({ cacheOnly: true });
    const client = {
      from: vi.fn(() => {
        throw new Error("Supabase must not be called");
      }),
    } as any;
    const result = await cache.persistRows([row("offline")], client, "*");
    expect(result.saved).toBe(0);
    const state = JSON.parse(
      await readFile(path.join(dir, "local-scraper-cache.json"), "utf8"),
    );
    expect(state.entries["test|offline"].synced).toBe(false);
    expect(state.entries["test|offline"].data.ask_price).toBe(10000);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("serializes parallel writes and stops at 80% of the configured daily insert limit", async () => {
    const { cache } = await makeCache({ maxDailyInserts: 5, batchSize: 50 });
    const db = fakeSupabase();
    const [left, right] = await Promise.all([
      cache.persistRows(
        [row("1"), row("2"), row("3")],
        db.client,
        "id, source, source_deal_id, ask_price, updated_at",
      ),
      cache.persistRows(
        [row("4"), row("5"), row("6")],
        db.client,
        "id, source, source_deal_id, ask_price, updated_at",
      ),
    ]);
    expect(left.saved + right.saved).toBe(4);
    expect(cache.getQuota().inserts).toBe(4);
    expect(left.paused || right.paused).toBe(false);
    expect(db.rows.size).toBe(4);
  });

  it("resets the daily quota at the UTC date boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T23:59:00.000Z"));
    const { cache } = await makeCache();
    const db = fakeSupabase();
    await cache.persistRows(
      [row("utc")],
      db.client,
      "id, source, source_deal_id, ask_price, updated_at",
    );
    expect(cache.getQuota().inserts).toBe(1);
    vi.setSystemTime(new Date("2026-10-01T00:01:00.000Z"));
    expect(cache.getQuota()).toMatchObject({
      day: "2026-10-01",
      inserts: 0,
      updates: 0,
    });
  });

  it("bumps last_seen_at for unchanged rows once the touch interval passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
    const { cache } = await makeCache({ touchIntervalMs: 12 * 3600_000 });
    const db = fakeSupabase();
    await cache.persistRows([row("a"), row("b")], db.client, "*");
    expect(db.touches).toHaveLength(0);

    vi.setSystemTime(new Date("2026-10-05T06:00:00.000Z"));
    const early = await cache.persistRows([row("a"), row("b")], db.client, "*");
    expect(early.touches).toBe(0);
    expect(db.touches).toHaveLength(0);

    vi.setSystemTime(new Date("2026-10-05T13:00:00.000Z"));
    const due = await cache.persistRows([row("a"), row("b")], db.client, "*");
    expect(due.touches).toBe(2);
    expect(due.saved).toBe(0);
    expect(db.writes).toHaveLength(1); // no extra full upsert
    expect(db.touches).toEqual([
      {
        source: "test",
        ids: ["a", "b"],
        patch: { last_seen_at: "2026-10-05T13:00:00.000Z" },
      },
    ]);
    expect(cache.getQuota().touches).toBe(2);
  });

  it("touches a matching remote row the cache has never written", async () => {
    const { cache } = await makeCache();
    const remote = { ...row("r"), last_seen_at: "2026-09-01T00:00:00.000Z" };
    const db = fakeSupabase([remote]);
    const result = await cache.persistRows([row("r")], db.client, "*");
    expect(result.saved).toBe(0);
    expect(result.touches).toBe(1);
    expect(db.touches[0].ids).toEqual(["r"]);
  });

  it("stops touching at the daily touch cap", async () => {
    const { cache } = await makeCache({ maxDailyTouches: 1 });
    const db = fakeSupabase([
      { ...row("x"), last_seen_at: "2026-09-01T00:00:00.000Z" },
      { ...row("y"), last_seen_at: "2026-09-01T00:00:00.000Z" },
    ]);
    const result = await cache.persistRows(
      [row("x"), row("y")],
      db.client,
      "*",
    );
    expect(result.touches).toBe(1);
  });

  it("only treats synced entries as touchable", () => {
    const now = Date.parse("2026-10-05T12:00:00.000Z");
    expect(touchIsDue(undefined, 1000, now)).toBe(false);
    expect(
      touchIsDue({ hash: "h", synced: false, lastSeenAt: "" }, 1000, now),
    ).toBe(false);
    expect(
      touchIsDue({ hash: "h", synced: true, lastSeenAt: "" }, 1000, now),
    ).toBe(true);
    expect(
      touchIsDue(
        {
          hash: "h",
          synced: true,
          lastSeenAt: "",
          dbSeenAt: "2026-10-05T11:59:59.500Z",
        },
        1000,
        now,
      ),
    ).toBe(false);
  });

  it("classifies with only the incoming columns, never select *", () => {
    const cols = classifyColumns([
      { source: "a", source_deal_id: "1", ask_price: 1, "bad key": 2 },
      { source: "a", source_deal_id: "2", mileage: 5 },
    ]).split(",");
    expect(cols).toEqual(
      expect.arrayContaining([
        "source",
        "source_deal_id",
        "last_seen_at",
        "ask_price",
        "mileage",
      ]),
    );
    expect(cols).not.toContain("*");
    expect(cols).not.toContain("embedding");
    expect(cols).not.toContain("bad key");
  });

  it("defaults to the free-tier daily budget", async () => {
    const { cache } = await makeCache();
    expect(cache.getQuota().maxInserts).toBe(DEFAULT_MAX_DAILY_INSERTS);
    expect(DEFAULT_MAX_DAILY_INSERTS).toBe(1250);
  });
});
