// /api/feed guest paging bounds (Ren's lineage review): max page size, offset cap, 30/min per IP.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ calls: [] as unknown[][], rows: [] as any[] }));

function query() {
  const q: any = {};
  for (const m of [
    "select",
    "eq",
    "gt",
    "not",
    "neq",
    "order",
    "limit",
    "range",
    "in",
    "is",
    "or",
    "ilike",
    "gte",
    "lte",
    "lt",
  ])
    q[m] = (...args: unknown[]) => {
      db.calls.push([m, ...args]);
      return q;
    };
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: db.rows, error: null });
  return q;
}

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/cache", () => ({
  cached: (_k: string, _t: number, run: () => unknown) => run(),
}));
vi.mock("@/lib/intelligence/interest-profile", () => ({
  buildInterestProfile: async () => ({}),
}));
vi.mock("@/lib/intelligence/interest-patterns", () => ({
  scoreInterest: () => ({ affinity: 0, reason: "" }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: () => query() }),
}));

import { GET, FEED_MAX_OFFSET, FEED_MAX_LIMIT, FEED_GUEST_RATE } from "./route";

const req = (qs: string, ip: string) =>
  new NextRequest(`https://app.test/api/feed?${qs}`, {
    headers: { "x-real-ip": ip },
  });
const range = () =>
  db.calls.find((c) => c[0] === "range") as [string, number, number];

describe("GET /api/feed guest bounds", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    getServerUser.mockResolvedValue({ data: { user: null }, error: null });
    db.calls = [];
    db.rows = [];
  });

  it("caps the page size", async () => {
    const res = await GET(req("offset=0&limit=500", "10.0.0.1"));
    expect(res.status).toBe(200);
    expect(range()).toEqual(["range", 0, FEED_MAX_LIMIT - 1]);
  });

  it("clamps a huge offset and stops at the cap without a database read", async () => {
    const res = await GET(req("offset=99999999&limit=12", "10.0.0.2"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [],
      nextOffset: null,
      capped: true,
    });
    expect(range()).toBeUndefined();
  });

  it("the last page before the cap is trimmed to the cap and ends paging", async () => {
    const res = await GET(
      req(`offset=${FEED_MAX_OFFSET - 5}&limit=12`, "10.0.0.3"),
    );
    expect(range()).toEqual([
      "range",
      FEED_MAX_OFFSET - 5,
      FEED_MAX_OFFSET - 1,
    ]);
    expect((await res.json()).nextOffset).toBeNull();
  });

  it("rate-limits a guest IP at 30 requests a minute; another IP is unaffected", async () => {
    for (let i = 0; i < FEED_GUEST_RATE.limit; i++)
      expect((await GET(req("offset=0", "10.0.0.9"))).status).toBe(200);
    const blocked = await GET(req("offset=0", "10.0.0.9"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect((await GET(req("offset=0", "10.0.0.10"))).status).toBe(200);
  });

  it("signed-in users are not on the guest limit", async () => {
    getServerUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    for (let i = 0; i < FEED_GUEST_RATE.limit + 5; i++)
      expect((await GET(req("offset=0", "10.0.0.11"))).status).toBe(200);
  });
});
