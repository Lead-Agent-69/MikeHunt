// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const scrape = vi.hoisted(() => vi.fn());
const flip = vi.hoisted(() => ({ on: false }));
const tables = vi.hoisted(() => ({ rows: {} as Record<string, any[]> }));
const auth = vi.hoisted(() => ({ user: null as null | { id: string }, single: {} as Record<string, any> }));

vi.mock("@/lib/save-from-url/scrape-listing", () => ({ scrapeOrParseListing: scrape }));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => flip.on,
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: auth.user }, error: null }),
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
      const exact: [string, unknown][] = [];
      for (const m of ["select", "ilike", "gte", "lte", "gt", "limit", "order"])
        q[m] = () => q;
      // Exact lookups (self row by id / source_url) are honoured; other filters are ignored.
      q.eq = (k: string, v: unknown) => {
        if (k === "id" || k === "source_url") exact.push([k, v]);
        return q;
      };
      q.maybeSingle = async () => ({ data: auth.single[table] ?? null, error: null });
      q.then = (ok: any, bad: any) =>
        Promise.resolve({
          data: (tables.rows[table] || []).filter((r) => exact.every(([k, v]) => r[k] === v)),
          error: null,
        }).then(ok, bad);
      return q;
    },
  }),
}));

import { POST } from "./route";

// Seen 2h ago: live per lib/deals/freshness (terms-gated sources must be re-seen within 24h).
const seen = new Date(Date.now() - 2 * 3_600_000).toISOString();
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
    auth.user = null;
    auth.single = {};
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
    expect(read.priceRating).toBe("good");
    expect(read.fairValue.value).toBe(15350); // median retail ask, no 0.95 haircut
    expect(read.fairValue.kind).toBe("ask");
    expect(read.profit).toBeNull(); // personal desk
    expect(read.live.state).toBe("live"); // page fetched just now
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
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

  it("personal desk: a typical-priced car is not Pass, and no sell state leaks", async () => {
    tables.rows = {
      deals: [
        ask("a", 15000), ask("b", 15500), ask("c", 16000), ask("d", 15200),
        ask("t1", 18000, "TX"), ask("t2", 18200, "TX"), ask("t3", 18400, "TX"),
      ],
    };
    const res = await post({ make: "Honda", model: "Civic", year: 2018, mileage: 71000, price: 15350, zip: "60432", homeState: "TX" });
    const { read, desk } = await res.json();
    expect(desk).toBe("personal");
    expect(read.verdict).not.toBe("pass");
    expect(read.priceRating).toBe("fair");
    expect(read.resale.state).toBeNull();
    expect(JSON.stringify({ ...read, vehicle: undefined })).not.toMatch(/\bTX\b/);
  });

  it("stale asks are not comps", async () => {
    const old = new Date(Date.now() - 100 * 3_600_000).toISOString();
    tables.rows = {
      deals: [ask("a", 15000), ask("b", 15500), { ...ask("c", 16000), last_seen_at: old }],
    };
    const res = await post({ make: "Honda", model: "Civic", year: 2018, mileage: 71000, price: 9000, zip: "60432" });
    const { read } = await res.json();
    expect(read.verdict).toBe("not_enough_data");
    expect(read.comps.asks).toBe(2);
  });

  it("flip desk uses the saved home server-side; the body's homeState only overrides it", async () => {
    flip.on = true;
    // Two WI asks: WI is not a sell market on its own comps, only as the buyer's home.
    tables.rows.deals.push(ask("w1", 18000, "WI"), ask("w2", 18200, "WI"), ask("x1", 18000, "TX"), ask("x2", 18200, "TX"));
    auth.user = { id: "u1" };
    auth.single = { user_profiles: { home_state: "WI", home_zip: "53703" }, user_preferences: null };
    const saved = await (await post({ make: "Honda", model: "Civic", year: 2018, mileage: 71000, price: 9000, zip: "60432" })).json();
    expect(saved.read.resale.state).toBe("WI");
    auth.user = null;
    const signedOut = await (await post({ make: "Honda", model: "Civic", year: 2018, mileage: 71000, price: 9000, zip: "60432" })).json();
    expect(signedOut.read.resale.state).toBe("IL"); // no saved home: no default state either
    auth.user = { id: "u1" };
    const override = await (await post({ make: "Honda", model: "Civic", year: 2018, mileage: 71000, price: 9000, zip: "60432", homeState: "IL" })).json();
    expect(override.read.resale.state).toBe("IL");
  });
});

