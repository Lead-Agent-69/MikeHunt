import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_MAX_DAILY_INSERTS,
  LocalScraperCache,
  classifyColumns,
  listingHash,
  touchIsDue,
  listingIdBatches,
} from "./local-cache";

const tempDirs: string[] = [];
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

function fakeSupabase(initial: Record<string, any>[] = []) {
  const rows = new Map(
    initial.map((row) => [`${row.source}|${row.source_deal_id}`, { ...row }]),
  );
  const writes: Record<string, any>[][] = [];
  const touches: { source: string; ids: string[]; patch: any }[] = [];
  const reads: string[][] = [];
  return {
    rows,
    writes,
    touches,
    reads,
    client: {
      from: () => ({
        update: (patch: Record<string, any>) => ({
          eq: (_column: string, source: string) => ({
            in: async (_idColumn: string, ids: string[]) => {
              touches.push({ source, ids, patch });
              for (const id of ids) {
                const stored = rows.get(`${source}|${id}`);
                if (stored) Object.assign(stored, patch);
              }
              return { data: null, error: null };
            },
          }),
        }),
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
        upsert: (batch: Record<string, any>[]) => ({
          select: async () => {
            writes.push(batch);
            const result = batch.map((row) => {
              const persisted = {
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
    expect(left.paused || right.paused).toBe(true);
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
