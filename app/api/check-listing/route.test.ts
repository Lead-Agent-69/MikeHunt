// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const scrape = vi.hoisted(() => vi.fn());
const flip = vi.hoisted(() => ({ on: false }));
const tables = vi.hoisted(() => ({ rows: {} as Record<string, any[]> }));

vi.mock("@/lib/save-from-url/scrape-listing", () => ({ scrapeOrParseListing: scrape }));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => flip.on,
}));
vi.mock("@/lib/vehicle/nhtsa", () => ({
  decodeVin: async () => ({ year: 2018, make: "HONDA", model: "Civic", trim: "EX" }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from(table: string) {
      const q: any = {};
      for (const m of ["select", "eq", "ilike", "gte", "lte", "gt", "limit", "order"])
        q[m] = () => q;
      q.then = (ok: any, bad: any) =>
        Promise.resolve({ data: tables.rows[table] || [], error: null }).then(ok, bad);
      return q;
    },
  }),
}));

import { POST } from "./route";

const seen = new Date(Date.now() - 86_400_000).toISOString();
const ask = (id: string, price: number, state = "IL") => ({
  id,
  year: 2018,
  make: "Honda",
  model: "Civic",
  mileage: 70000,
  ask_price: price,
  source: "craigslist",
  source_url: `https://x.example/${id}`,
  location_state: state,
  last_seen_at: seen,
  condition: "clean_title",
});
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/check-listing", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/check-listing", () => {
  beforeEach(() => {
    scrape.mockReset();
    flip.on = false;
    tables.rows = {
      deals: [ask("a", 15000), ask("b", 15500), ask("c", 16000), ask("d", 15200)],
    };
  });

  it("reads a pasted listing link and returns one card", async () => {
    scrape.mockResolvedValueOnce({ year: 2018, make: "Honda", model: "Civic", ask_price: 9000, mileage: 71000, location_state: "IL" });
    const res = await post({ q: "https://dealer.example/2018-civic" });
    expect(res.status).toBe(200);
    const { read, desk } = await res.json();
    expect(desk).toBe("personal");
    expect(read.verdict).toBe("buy");
    expect(read.fairValue.value).toBeGreaterThan(9000);
    expect(read.profit.net).toBeNull(); // personal desk
  });

  it("flip desk gets profit and resale", async () => {
    flip.on = true;
    const res = await post({ q: "2018 Honda Civic 71k mi $9,000 60432" });
    const { read } = await res.json();
    expect(read.profit.net).toBeGreaterThan(0);
    expect(read.resale.value).toBeGreaterThan(0);
  });

  it("VIN fills the car; price is still required", async () => {
    const res = await post({ q: "1HGCV1F30LA000000" });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("NEED_PRICE");
    const ok = await post({ vin: "1HGCV1F30LA000000", price: 9000, zip: "60432" });
    expect((await ok.json()).read.vehicle).toMatchObject({ make: "HONDA", model: "Civic", state: "IL" });
  });

  it("an unreadable page says so instead of guessing", async () => {
    scrape.mockResolvedValueOnce(null);
    const res = await post({ url: "https://blocked.example/car" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("PAGE_UNREADABLE");
  });

  it("too few comps: not enough data", async () => {
    tables.rows = { deals: [ask("a", 15000)] };
    const res = await post({ make: "Honda", model: "Civic", year: 2018, price: 9000, zip: "60432" });
    expect((await res.json()).read.verdict).toBe("not_enough_data");
  });
});
