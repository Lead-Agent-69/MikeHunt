// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "user-a" } } })),
);
const scrapeOrParseListing = vi.hoisted(() => vi.fn(async () => null));

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/save-from-url/scrape-listing", () => ({ scrapeOrParseListing }));
vi.mock("@/lib/scrapers/pipeline", () => ({ upsertDeals: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => {
    const c: any = {};
    for (const m of ["from", "select", "eq", "upsert", "insert", "update"])
      c[m] = () => c;
    c.maybeSingle = async () => ({ data: null });
    return c;
  },
}));

import { POST } from "./route";

function post(ip: string) {
  return POST(
    new NextRequest("https://x.test/api/save-from-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://listings.example/car/1" }),
      headers: { "content-type": "application/json", "x-real-ip": ip },
    }),
  );
}

describe("POST /api/save-from-url per-user rate limit", () => {
  beforeEach(() => scrapeOrParseListing.mockClear());

  it("allows 10/min per user, then 429s even when the IP changes", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await post(`198.51.100.${i}`);
      expect(res.status).toBe(422); // reached the extractor (mocked miss)
    }
    const blocked = await post("203.0.113.77");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();
    expect(scrapeOrParseListing).toHaveBeenCalledTimes(10);
  });

  it("keeps a separate bucket for another user", async () => {
    getServerUser.mockResolvedValueOnce({ data: { user: { id: "user-b" } } });
    const res = await post("198.51.100.1");
    expect(res.status).toBe(422);
  });

  it("still 401s a guest before counting", async () => {
    getServerUser.mockResolvedValueOnce({ data: { user: null } } as any);
    const res = await post("198.51.100.1");
    expect(res.status).toBe(401);
  });
});
