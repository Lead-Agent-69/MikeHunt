import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalScraperCache, listingHash, stableListingId } from "./local-cache";
import { resetColumnProbeCache } from "@/lib/data-quality/optional-columns";

// Ren #312 P3: the fallback id must never merge distinct listings; P2: fetched_at is volatile.
describe("stableListingId fallbacks (Ren #312 P3)", () => {
  const base = { source: "independent_dealer", year: 2016, make: "Honda", model: "Civic", title: "2016 Honda Civic" };

  it("keeps the site's own id", () => {
    expect(stableListingId({ ...base, source_deal_id: "lot-1" })).toBe("lot-1");
  });

  it("same listing with tracking params / fragment / www / trailing slash → one id", () => {
    const a = stableListingId({ ...base, source_url: "https://dealer.example/vdp/123/" });
    const b = stableListingId({
      ...base,
      source_url: "https://www.dealer.example/vdp/123?utm_source=x&fbclid=y&gclid=z#gallery",
    });
    expect(a).toBe(b);
  });

  it("the same VIN listed by two dealers (two URLs) stays two rows", () => {
    const vin = "1FT7W2BT8GED11804";
    expect(stableListingId({ ...base, vin, source_url: "https://a.example/1" })).not.toBe(
      stableListingId({ ...base, vin, source_url: "https://b.example/9" }),
    );
  });

  it("a placeholder VIN is not an identity", () => {
    for (const vin of ["N/A", "0", "UNKNOWN", "12345678901234567"]) {
      expect(stableListingId({ ...base, vin, mileage: 50000 })).not.toBe(
        stableListingId({ ...base, vin, mileage: 91000 }),
      );
    }
  });

  it("a valid VIN without a URL is a stable identity", () => {
    const vin = "1FT7W2BT8GED11804";
    expect(stableListingId({ ...base, vin, mileage: 1 })).toBe(
      stableListingId({ ...base, vin: "1ft7w2bt8-ged11804", mileage: 2 }),
    );
  });

  it("two same-title cars with no URL or VIN don't merge (mileage, city, zip, photo differ)", () => {
    const one = stableListingId({ ...base, mileage: 50000, location_state: "TX" });
    expect(one).not.toBe(stableListingId({ ...base, mileage: 72000, location_state: "TX" }));
    expect(one).not.toBe(
      stableListingId({ ...base, mileage: 50000, location_state: "TX", location_city: "Austin" }),
    );
    expect(one).not.toBe(
      stableListingId({ ...base, mileage: 50000, location_state: "TX", images: ["https://img/2.jpg"] }),
    );
  });

  it("a price change keeps the same id", () => {
    expect(stableListingId({ ...base, mileage: 50000, ask_price: 9000 })).toBe(
      stableListingId({ ...base, mileage: 50000, ask_price: 8500 }),
    );
  });
});

describe("listingHash ignores fetched_at (Ren #312 P2)", () => {
  it("an unchanged row with a new fetched_at hashes the same", () => {
    const row = { source: "x", source_deal_id: "1", ask_price: 9000 };
    expect(listingHash({ ...row, fetched_at: "2026-10-10T01:00:00Z" })).toBe(
      listingHash({ ...row, fetched_at: "2026-10-10T09:00:00Z" }),
    );
  });
});

describe("touch path before 20261010230000 is applied (Ren #312 P2)", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    vi.useRealTimers();
    resetColumnProbeCache();
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("still bumps last_seen_at (without fetched_at) when the column doesn't exist yet", async () => {
    resetColumnProbeCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-05T00:00:00.000Z"));
    const dir = await mkdtemp(path.join(os.tmpdir(), "mh-lc-312-"));
    dirs.push(dir);
    const cache = new LocalScraperCache({ path: dir, touchIntervalMs: 3600_000 });
    await cache.load();
    const patches: any[] = [];
    const stored = new Map<string, any>();
    const client: any = {
      from: () => ({
        select: (cols: string) => ({
          limit: async () =>
            cols.includes("fetched_at")
              ? { error: { code: "42703", message: 'column deals.fetched_at does not exist' } }
              : { error: null },
          eq: (_c: string, source: string) => ({
            in: async (_i: string, ids: string[]) => ({
              data: ids.map((id) => stored.get(`${source}|${id}`)).filter(Boolean),
              error: null,
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: () => ({
            in: async () => {
              patches.push(patch);
              return { data: null, error: null };
            },
          }),
        }),
        upsert: (batch: any[]) => ({
          select: async () => {
            for (const r of batch) stored.set(`${r.source}|${r.source_deal_id}`, { ...r, id: r.source_deal_id });
            return { data: batch.map((r) => ({ ...r, id: r.source_deal_id, updated_at: new Date().toISOString() })), error: null };
          },
        }),
      }),
    };
    const r = { source: "test", source_deal_id: "a", ask_price: 1, year: 2020, make: "Honda", model: "Civic" };
    await cache.persistRows([r], client, "*");
    vi.setSystemTime(new Date("2026-10-05T02:00:00.000Z"));
    const due = await cache.persistRows([r], client, "*");
    expect(due.touches).toBe(1);
    expect(patches).toEqual([{ last_seen_at: "2026-10-05T02:00:00.000Z" }]);
  });
});
