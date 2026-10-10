// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const scrape = vi.hoisted(() => vi.fn());
const flip = vi.hoisted(() => ({ on: false, boom: false }));
const tables = vi.hoisted(() => ({
  rows: {} as Record<string, any[]>,
  calls: [] as string[],
}));
const auth = vi.hoisted(() => ({
  user: null as null | { id: string },
  single: {} as Record<string, any>,
}));
const limits = vi.hoisted(() => ({
  keys: [] as string[],
  calls: [] as { key: string; limit: number; identity?: string }[],
}));
const vin = vi.hoisted(() => ({ fail: null as Error | null }));

vi.mock("@/lib/save-from-url/scrape-listing", () => ({
  scrapeOrParseListing: scrape,
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => {
    if (flip.boom) throw new Error("db password leaked in stack");
    return flip.on;
  },
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: auth.user }, error: null }),
}));
vi.mock("@/lib/vehicle/nhtsa", () => ({
  decodeVin: async () => {
    if (vin.fail) throw vin.fail;
    return { year: 2018, make: "HONDA", model: "Civic", trim: "EX" };
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (
    _req: unknown,
    o: { key: string; limit: number; identity?: string },
  ) => {
    limits.keys.push(o.key);
    limits.calls.push({ key: o.key, limit: o.limit, identity: o.identity });
    return { allowed: true };
  },
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from(table: string) {
      tables.calls.push(table);
      const q: any = {};
      const exact: [string, unknown][] = [];
      let inIds: unknown[] | null = null;
      for (const m of ["select", "ilike", "gte", "lte", "gt", "limit", "order"])
        q[m] = () => q;
      // Exact lookups (self row by id / source_url, tracked deals by id) are honoured; other
      // filters are ignored.
      q.eq = (k: string, v: unknown) => {
        if (k === "id" || k === "source_url") exact.push([k, v]);
        return q;
      };
      q.in = (k: string, v: unknown[]) => {
        if (k === "id") inIds = v;
        return q;
      };
      q.maybeSingle = async () => ({
        data: auth.single[table] ?? null,
        error: null,
      });
      q.then = (ok: any, bad: any) =>
        Promise.resolve({
          data: (tables.rows[table] || []).filter(
            (r) =>
              exact.every(([k, v]) => r[k] === v) &&
              (!inIds || inIds.includes(r.id)),
          ),
          error: null,
        }).then(ok, bad);
      return q;
    },
  }),
}));

import { invalidate } from "@/lib/cache";
import { POST } from "./route";
import { POST as BATCH } from "./batch/route";

// Seen 2h ago: live per lib/deals/freshness (terms-gated sources must be re-seen within 24h).
const seen = new Date(Date.now() - 2 * 3_600_000).toISOString();
const ask = (
  id: string,
  price: number,
  state = "IL",
  o: Record<string, any> = {},
) => ({
  id,
  year: 2018,
  make: "Honda",
  model: "Civic",
  mileage: 70000,
  ask_price: price,
  source: "craigslist",
  source_deal_id: `cl-${id}`,
  source_url: `https://x.example/${id}`,
  location_state: state,
  last_seen_at: seen,
  condition: "clean_title",
  updated_at: seen,
  ...o,
});
const SIX = () => [
  ask("a", 15000),
  ask("b", 15200),
  ask("c", 15500),
  ask("d", 15800),
  ask("e", 16000),
  ask("f", 16200),
];
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/check-listing", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const batch = (body: unknown) =>
  BATCH(
    new NextRequest("http://localhost/api/check-listing/batch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/check-listing", () => {
  beforeEach(() => {
    scrape.mockReset();
    flip.on = false;
    flip.boom = false;
    auth.user = null;
    auth.single = {};
    limits.keys = [];
    tables.calls = [];
    tables.rows = { deals: SIX() };
    invalidate("check-listing:");
  });

  it("reads a pasted listing link and returns one card", async () => {
    scrape.mockResolvedValueOnce({
      year: 2018,
      make: "Honda",
      model: "Civic",
      ask_price: 9000,
      mileage: 71000,
      location_state: "IL",
      condition: "clean_title",
    });
    const res = await post({ q: "https://dealer.example/2018-civic" });
    expect(res.status).toBe(200);
    const { read, desk } = await res.json();
    expect(desk).toBe("personal");
    expect(read.verdict).toBe("buy");
    expect(read.priceRating).toBe("good");
    expect(read.fairValue.value).toBe(15650); // median retail ask, no 0.95 haircut
    expect(read.fairValue.kind).toBe("ask");
    expect(read.confidence.label).toBe("medium");
    expect(read.profit).toBeNull(); // personal desk
    expect(read.live.state).toBe("live"); // page fetched just now
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(limits.keys).toEqual(["check-listing"]);
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
    const ok = await post({
      vin: "1HGCV1F30LA000000",
      price: 9000,
      zip: "60432",
    });
    expect((await ok.json()).read.vehicle).toMatchObject({
      make: "HONDA",
      model: "Civic",
      state: "IL",
    });
  });

  it("an unreadable page says so instead of guessing", async () => {
    scrape.mockResolvedValueOnce(null);
    const res = await post({ url: "https://blocked.example/car" });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("PAGE_UNREADABLE");
  });

  it("too few comps: not enough data", async () => {
    tables.rows = { deals: [ask("a", 15000)] };
    const res = await post({
      make: "Honda",
      model: "Civic",
      year: 2018,
      price: 9000,
      zip: "60432",
    });
    expect((await res.json()).read.verdict).toBe("not_enough_data");
  });

  it("personal desk: a typical-priced car is not Pass, and no sell state leaks", async () => {
    tables.rows = {
      deals: [
        ...SIX(),
        ask("t1", 18000, "TX"),
        ask("t2", 18200, "TX"),
        ask("t3", 18400, "TX"),
      ],
    };
    const res = await post({
      make: "Honda",
      model: "Civic",
      year: 2018,
      mileage: 71000,
      price: 15650,
      state: "IL",
      title: "clean",
      homeState: "TX",
    });
    const { read, desk } = await res.json();
    expect(desk).toBe("personal");
    expect(read.verdict).toBe("buy");
    expect(read.priceRating).toBe("fair");
    expect(read.resale.state).toBeNull();
    expect(JSON.stringify({ ...read, vehicle: undefined })).not.toMatch(
      /\bTX\b/,
    );
  });

  it("personal desk: low confidence is 'Not enough data' server-side, fair value still shown", async () => {
    tables.rows = { deals: SIX().slice(0, 4) };
    const res = await post({
      make: "Honda",
      model: "Civic",
      year: 2018,
      mileage: 71000,
      price: 9000,
      zip: "60432",
      title: "clean",
    });
    const { read } = await res.json();
    expect(read.confidence.label).toBe("low");
    expect(read.verdict).toBe("not_enough_data");
    expect(read.priceRating).toBeNull();
    expect(read.fairValue.value).toBe(15350);
    // Unknown title caps confidence at low → also gated.
    const untitled = await (
      await post({
        make: "Honda",
        model: "Civic",
        year: 2018,
        mileage: 71000,
        price: 9000,
        zip: "60432",
      })
    ).json();
    expect(untitled.read.verdict).toBe("not_enough_data");
  });

  it("stale asks are not comps", async () => {
    const old = new Date(Date.now() - 100 * 3_600_000).toISOString();
    tables.rows = {
      deals: [
        ask("a", 15000),
        ask("b", 15500),
        ask("c", 16000, "IL", { last_seen_at: old }),
      ],
    };
    const res = await post({
      make: "Honda",
      model: "Civic",
      year: 2018,
      mileage: 71000,
      price: 9000,
      zip: "60432",
    });
    const { read } = await res.json();
    expect(read.verdict).toBe("not_enough_data");
    expect(read.comps.asks).toBe(2);
  });

  it("location: state works alone; bad ZIP, bad state and a ZIP in another state are 400s", async () => {
    const ok = await (
      await post({
        make: "Honda",
        model: "Civic",
        year: 2018,
        price: 9000,
        state: "il",
      })
    ).json();
    expect(ok.read.vehicle.state).toBe("IL");
    expect(
      (await post({ make: "Honda", model: "Civic", price: 9000, zip: "00000" }))
        .status,
    ).toBe(400);
    expect(
      (await post({ make: "Honda", model: "Civic", price: 9000, state: "XX" }))
        .status,
    ).toBe(400);
    const clash = await post({
      make: "Honda",
      model: "Civic",
      price: 9000,
      zip: "60432",
      state: "TX",
    });
    expect(clash.status).toBe(400);
    expect((await clash.json()).error).toMatch(/60432 is in IL, not TX/);
    expect(
      (
        await post({
          make: "Honda",
          model: "Civic",
          price: 9000,
          homeState: "ZZ",
        })
      ).status,
    ).toBe(400);
  });

  it("flip desk uses the saved home server-side; body home values only override it", async () => {
    flip.on = true;
    // Two WI asks: WI is not a sell market on its own comps, only as the buyer's home.
    tables.rows.deals.push(
      ask("w1", 18000, "WI"),
      ask("w2", 18200, "WI"),
      ask("x1", 18000, "TX"),
      ask("x2", 18200, "TX"),
    );
    auth.user = { id: "u1" };
    auth.single = {
      user_profiles: { home_state: "WI", home_zip: "53703" },
      user_preferences: null,
    };
    const saved = await (
      await post({
        make: "Honda",
        model: "Civic",
        year: 2018,
        mileage: 71000,
        price: 9000,
        zip: "60432",
      })
    ).json();
    expect(saved.read.resale.state).toBe("WI");
    const override = await (
      await post({
        make: "Honda",
        model: "Civic",
        year: 2018,
        mileage: 71000,
        price: 9000,
        zip: "60432",
        homeState: "IL",
      })
    ).json();
    expect(override.read.resale.state).toBe("IL");
    auth.user = null;
    const signedOut = await (
      await post({
        make: "Honda",
        model: "Civic",
        year: 2018,
        mileage: 71000,
        price: 9000,
        zip: "60432",
      })
    ).json();
    expect(signedOut.read.resale.state).toBe("IL"); // no saved home: no default state either
  });

  it("dealId: reads our tracked row (no scrape), excludes it by id / source ids without a VIN", async () => {
    const me = ask(uuid(1), 9000, "IL", {
      source: "independent_dealer",
      source_deal_id: "dlr-77",
      vin: null,
      source_url: "https://dealer.example/77",
    });
    // Same listing re-imported under another id: dropped by source + source_deal_id.
    const dup = ask("dup", 9000, "IL", {
      source: "independent_dealer",
      source_deal_id: "dlr-77",
      source_url: "https://dealer.example/77?ref=feed",
    });
    tables.rows = { deals: [...SIX(), me, dup] };
    const res = await post({ dealId: uuid(1) });
    expect(res.status).toBe(200);
    expect(scrape).not.toHaveBeenCalled();
    const { read } = await res.json();
    expect(read.vehicle).toMatchObject({
      make: "Honda",
      model: "Civic",
      price: 9000,
      state: "IL",
    });
    expect(read.comps.asks).toBe(6);
    expect(read.fairValue.value).toBe(15650);
    expect(read.live.state).toBe("live");
    expect((await post({ dealId: uuid(9) })).status).toBe(404);
    expect((await post({ dealId: "not-a-uuid" })).status).toBe(400);
  });

  it("dealId: a stale or ended tracked deal is Not live, never Buy", async () => {
    const old = new Date(Date.now() - 100 * 3_600_000).toISOString();
    const ended = new Date(Date.now() - 3_600_000).toISOString();
    tables.rows = {
      deals: [
        ...SIX(),
        ask(uuid(2), 9000, "IL", {
          source: "independent_dealer",
          last_seen_at: old,
        }),
        ask(uuid(3), 9000, "IL", {
          source: "independent_dealer",
          auction_end_at: ended,
        }),
      ],
    };
    for (const id of [uuid(2), uuid(3)]) {
      const { read } = await (await post({ dealId: id })).json();
      expect(read.verdict).toBe("not_live");
      expect(read.headline).toMatch(/^Not live/);
    }
    flip.on = true;
    const { read } = await (await post({ dealId: uuid(2) })).json();
    expect(read.verdict).toBe("not_live");
  });
});

describe("POST /api/check-listing: limits and errors", () => {
  beforeEach(() => {
    flip.on = false;
    flip.boom = false;
    auth.user = null;
    auth.single = {};
    limits.keys = [];
    limits.calls = [];
    vin.fail = null;
    tables.rows = { deals: SIX() };
    invalidate("check-listing:");
  });

  it("guests: 5 / min per IP; signed in: 20 / min per user.id", async () => {
    await post({ make: "Honda", model: "Civic", price: 9000, zip: "60432" });
    expect(limits.calls).toEqual([
      { key: "check-listing", limit: 5, identity: undefined },
    ]);
    limits.calls = [];
    auth.user = { id: "u42" };
    await post({ make: "Honda", model: "Civic", price: 9000, zip: "60432" });
    expect(limits.calls).toEqual([
      { key: "check-listing-user", limit: 20, identity: "user:u42" },
    ]);
  });

  it("anything thrown is a generic JSON 500, private, no message leak", async () => {
    vin.fail = new Error("connection string postgres://secret");
    const res = await post({ vin: "1HGCV1F30LA000000", price: 9000 });
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: "Something went wrong checking this listing. Please try again.",
      code: "INTERNAL",
    });
    expect(text).not.toMatch(/secret|postgres/);
  });

  it("the batch endpoint also returns a generic private 500", async () => {
    flip.boom = true;
    const res = await batch({ dealIds: [uuid(11)] });
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.text()).not.toMatch(/password/);
  });
});

describe("POST /api/check-listing/batch", () => {
  beforeEach(() => {
    flip.on = false;
    flip.boom = false;
    auth.user = null;
    limits.keys = [];
    tables.calls = [];
    tables.rows = {
      deals: [
        ...SIX(),
        ask(uuid(11), 9000),
        ask(uuid(12), 15650, "IL", { updated_at: "2026-10-09T00:00:00Z" }),
      ],
    };
    invalidate("check-listing:");
  });

  it("returns a card per tracked deal, private, on its own rate-limit bucket", async () => {
    const res = await batch({ dealIds: [uuid(11), uuid(12), uuid(99)] });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(limits.keys).toEqual(["check-listing-batch"]);
    const body = await res.json();
    expect(body.desk).toBe("personal");
    expect(Object.keys(body.reads).sort()).toEqual([uuid(11), uuid(12)]);
    expect(body.missing).toEqual([uuid(99)]);
    expect(body.reads[uuid(11)].profit).toBeNull();
    expect(body.reads[uuid(11)].fairValue.value).toBeGreaterThan(9000);
  });

  it("caches the unredacted data per deal + updated_at; the desk read still runs per request", async () => {
    await batch({ dealIds: [uuid(11)] });
    const cold = tables.calls.length;
    tables.calls = [];
    flip.on = true;
    const warm = await (await batch({ dealIds: [uuid(11)] })).json();
    expect(tables.calls.length).toBeLessThan(cold); // only the tracked-row lookup, no comp queries
    expect(tables.calls.filter((t) => t === "sold_listings")).toHaveLength(0);
    expect(warm.desk).toBe("flip");
    expect(warm.reads[uuid(11)].profit.net).toBeGreaterThan(0); // flip read from the same cache
    // A new updated_at is a new key: comps are reloaded.
    tables.rows.deals = tables.rows.deals.map((d) =>
      d.id === uuid(11) ? { ...d, updated_at: new Date().toISOString() } : d,
    );
    tables.calls = [];
    await batch({ dealIds: [uuid(11)] });
    expect(tables.calls).toContain("sold_listings");
  });

  it("caps the batch at 20 ids and validates them", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => uuid(100 + i));
    const res = await batch({ dealIds: ids });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("TOO_MANY");
    expect((await batch({ dealIds: ["nope"] })).status).toBe(400);
    expect((await batch({ dealIds: [] })).status).toBe(400);
  });
});
