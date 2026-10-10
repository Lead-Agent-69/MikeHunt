// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveFlip = vi.hoisted(() => vi.fn(async () => false));
const getDeals = vi.hoisted(() => vi.fn(async () => ({ deals: [] as any[] })));
const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: null as { id: string } | null } })),
);
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: () => getServerUser(),
}));
vi.mock("@/lib/data/deals-service", () => ({
  DealsService: class {
    getDeals = getDeals;
  },
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: () => resolveFlip(),
}));
vi.mock("@/lib/cache", () => ({
  cached: async (_key: string, _ttl: number, fn: () => Promise<unknown>) =>
    fn(),
}));

import { GET, isStaleArbitrageRow, resolveArbitrageHome } from "./route";

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

type Tables = {
  profile?: Record<string, unknown> | null;
  prefs?: Record<string, unknown>;
  deals?: Record<string, unknown>[];
  sold?: Record<string, unknown>[];
};
const calls: Record<string, number> = {};

/** Chainable PostgREST stand-in: filters are recorded, range() resolves the table's rows once. */
function tables(t: Tables) {
  fromMock.mockImplementation((table: string) => {
    calls[table] = (calls[table] || 0) + 1;
    const q: any = {};
    for (const m of ["select", "eq", "in", "gte", "lte", "gt", "order"])
      q[m] = () => q;
    q.maybeSingle = async () => {
      if (table === "user_profiles")
        return { data: t.profile ?? null, error: null };
      if (table === "user_preferences")
        return { data: { prefs: t.prefs ?? {} }, error: null };
      throw new Error(`unexpected maybeSingle on ${table}`);
    };
    q.range = async (from: number) => {
      const rows =
        table === "deals"
          ? t.deals || []
          : table === "sold_listings"
            ? t.sold || []
            : null;
      if (!rows) throw new Error(`unexpected range on ${table}`);
      return { data: from === 0 ? rows : [], error: null };
    };
    return q;
  });
}

beforeEach(() => {
  resolveFlip.mockResolvedValue(false);
  getDeals.mockReset();
  getDeals.mockResolvedValue({ deals: [] });
  getServerUser.mockResolvedValue({ data: { user: null } });
  fromMock.mockReset();
  for (const k of Object.keys(calls)) delete calls[k];
  tables({});
});

describe("GET /api/arbitrage desk gate", () => {
  it("signed-out / non-flip callers get the empty shape and no spread scan", async () => {
    const res = await GET(
      new NextRequest("https://x.test/api/arbitrage?homeState=tx"),
    );
    const body = await res.json();
    expect(body.flipOnly).toBe(true);
    expect(body.deskAccess).toBe("personal");
    expect(body.homeState).toBe("TX");
    expect(body.summary.bestProfit).toBe(0);
    expect(body.regionalArbitrage).toEqual([]);
    expect(body.nationalArbitrage).toEqual([]);
    expect(body.localDeals).toEqual([]);
    expect(body.opportunities).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("spread");
    expect(getDeals).not.toHaveBeenCalled();
    expect(calls.deals).toBeUndefined();
    expect(calls.sold_listings).toBeUndefined();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("a flip desk runs the scan", async () => {
    resolveFlip.mockResolvedValue(true);
    const res = await GET(
      new NextRequest("https://x.test/api/arbitrage?homeState=TX"),
    );
    const body = await res.json();
    expect(getDeals).toHaveBeenCalled();
    expect(body.deskAccess).toBe("flip");
    expect(body.flipOnly).toBeUndefined();
    expect(body.homeState).toBe("TX");
    expect(body.needsHome).toBe(false);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("GET /api/arbitrage home resolution", () => {
  it("uses prefs.homeLocation when profile.home_state is empty", async () => {
    resolveFlip.mockResolvedValue(true);
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    tables({
      profile: { home_state: null },
      prefs: { homeLocation: { state: "mo" } },
    });
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage"))
    ).json();
    expect(body.homeState).toBe("MO");
    expect(body.tailored).toBe(true);
    expect(body.deskAccess).toBe("flip");
    expect(getDeals).toHaveBeenCalled();
  });

  it("prefs.homeLocation wins over a stale profile.home_state", async () => {
    resolveFlip.mockResolvedValue(true);
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    tables({
      profile: { home_state: "CA" },
      prefs: { homeLocation: { state: "MO" } },
    });
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage"))
    ).json();
    expect(body.homeState).toBe("MO");
    expect(body.tailored).toBe(true);
  });

  it("non-flip desk still reports saved prefs home (no false set-home copy)", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    tables({
      profile: { home_state: "" },
      prefs: { homeLocation: { state: "MO" } },
    });
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage"))
    ).json();
    expect(body.flipOnly).toBe(true);
    expect(body.homeState).toBe("MO");
    expect(body.tailored).toBe(true);
    expect(getDeals).not.toHaveBeenCalled();
  });

  it("no saved home and no param → needsHome, homeState null, never CA, no scan", async () => {
    resolveFlip.mockResolvedValue(true);
    const res = await GET(new NextRequest("https://x.test/api/arbitrage"));
    const body = await res.json();
    expect(body.needsHome).toBe(true);
    expect(body.homeState).toBeNull();
    expect(body.tailored).toBe(false);
    expect(body.deskAccess).toBe("flip");
    expect(JSON.stringify(body)).not.toContain('"CA"');
    expect(getDeals).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("the untouched profile CA column default is not a home", async () => {
    resolveFlip.mockResolvedValue(true);
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    tables({ profile: { home_state: "CA" }, prefs: {} });
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage"))
    ).json();
    expect(body.needsHome).toBe(true);
    expect(body.homeState).toBeNull();
    expect(getDeals).not.toHaveBeenCalled();
  });

  it("resolveArbitrageHome: prefs coords, profile pin only when states match, ZIP state wins", () => {
    expect(
      resolveArbitrageHome({
        prefsHomeLocation: { state: "MO", lat: 38.6, lng: -90.2 },
      }),
    ).toMatchObject({ state: "MO", lat: 38.6, lng: -90.2 });
    expect(
      resolveArbitrageHome({
        prefsHomeLocation: { state: "MO" },
        profile: { home_state: "KS", home_lat: 39, home_lng: -95 },
      }),
    ).toEqual({ state: "MO" });
    expect(
      resolveArbitrageHome({ profile: { home_state: "CA", home_zip: "63101" } })
        ?.state,
    ).toBe("MO");
    expect(resolveArbitrageHome({})).toBeNull();
  });
});

describe("stale predicate (fallback until lib/deals/freshness lands)", () => {
  it("gated sources and rows last seen > 72h ago are stale", () => {
    expect(
      isStaleArbitrageRow({ source: "copart", lastSeenAt: hoursAgo(1) }),
    ).toBe(true);
    expect(
      isStaleArbitrageRow({ source: "govdeals", lastSeenAt: hoursAgo(1) }),
    ).toBe(true);
    expect(
      isStaleArbitrageRow({ source: "publicsurplus", lastSeenAt: hoursAgo(1) }),
    ).toBe(true);
    expect(
      isStaleArbitrageRow({ source: "carscom", lastSeenAt: hoursAgo(80) }),
    ).toBe(true);
    expect(isStaleArbitrageRow({ source: "carscom", lastSeenAt: null })).toBe(
      true,
    );
    expect(
      isStaleArbitrageRow({ source: "carscom", lastSeenAt: hoursAgo(2) }),
    ).toBe(false);
  });
});

describe("GET /api/arbitrage v2 engine spreads", () => {
  const deal = (over: Record<string, unknown>) => ({
    id: Math.random().toString(36).slice(2),
    make: "Toyota",
    model: "Camry",
    year: 2020,
    condition: "clean_title",
    source: "carscom",
    locationState: "KS",
    dealVerdict: "go",
    lastSeenAt: hoursAgo(2),
    ...over,
  });
  const soldCamry = (i: number, over: Record<string, unknown> = {}) => ({
    id: 900 + i,
    make: "TOYOTA",
    model: "camry",
    year: 2020,
    sold_price: 20000,
    location_state: "MO",
    title: "2020 Toyota Camry SE",
    sold_at: daysAgo(10 + i),
    ...over,
  });
  const SPREAD_KEYS = [
    "ask",
    "fees",
    "transport",
    "recon",
    "repair",
    "sellingCost",
    "expectedResale",
    "net",
    "compsCount",
    "compsNewestAt",
    "compKind",
    "compScope",
    "confidence",
    "titleCategory",
  ].sort();

  function seed() {
    resolveFlip.mockResolvedValue(true);
    getDeals.mockResolvedValueOnce({
      deals: [
        deal({ id: "good", askPrice: 10000 }),
        deal({ id: "nocomps", make: "Honda", model: "Civic", askPrice: 9000 }),
        deal({ id: "frozen", source: "copart", askPrice: 3000 }),
        deal({ id: "old", askPrice: 3000, lastSeenAt: hoursAgo(100) }),
        deal({ id: "token", source: "iaai", askPrice: 100 }),
        deal({ id: "pass", askPrice: 5000, dealVerdict: "pass" }),
      ],
    });
    tables({
      deals: [
        {
          id: "good",
          source: "carscom",
          make: "Toyota",
          model: "Camry",
          year: 2020,
          ask_price: 10000,
          condition: "clean_title",
          location_state: "KS",
          last_seen_at: hoursAgo(2),
        },
      ],
      sold: [soldCamry(1), soldCamry(2), soldCamry(3), soldCamry(4)],
    });
  }

  it("scored rows carry the 14-field spread; needs-comps rows have net null and rank last", async () => {
    seed();
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage?homeState=MO"))
    ).json();
    const scored = [...body.regionalArbitrage, ...body.nationalArbitrage];
    expect(scored.map((o: any) => o.deal.id)).toEqual(["good"]);
    const good = scored[0];
    expect(Object.keys(good.spread).sort()).toEqual(SPREAD_KEYS);
    expect(good.spread).toMatchObject({
      ask: 10000,
      expectedResale: 20000,
      compsCount: 4,
      compKind: "sold",
      compScope: "same_state",
      titleCategory: "Clean",
    });
    expect(good.spread.sellingCost).toBe(1800); // engine selling cost, not the old flat route load
    expect(good.spread.net).toBe(
      20000 -
        (10000 +
          good.spread.fees +
          good.spread.transport +
          good.spread.recon +
          good.spread.repair +
          1800),
    );
    expect(good.arbitrage.arbitrage.potentialProfit).toBe(good.spread.net);
    expect(good.arbitrage.arbitrage.transportCost).toBe(good.spread.transport);
    expect(good.assumptions.join(" ")).toMatch(
      /Holding\/floorplan cost not included/,
    );
    expect(body.summary.bestProfit).toBe(good.spread.net);
    expect(body.topRoutes).toHaveLength(1);

    const needs = Object.fromEntries(
      body.needsComps.map((o: any) => [o.deal.id, o]),
    );
    expect(Object.keys(needs).sort()).toEqual(["nocomps", "token"]);
    expect(needs.nocomps.spread.net).toBeNull();
    expect(needs.nocomps.spread.compKind).toBe("none");
    expect(needs.nocomps.spread.confidence).toBe("none");
    expect(needs.nocomps.arbitrage.excludedReason).toBe("needs_comps");
    expect(needs.token.arbitrage.excludedReason).toBe("placeholder_bid");
    for (const o of body.needsComps) {
      expect(o.spread.net).toBeNull();
      expect(o.arbitrage.arbitrage.potentialProfit).toBeNull();
      expect(o.arbitrage.arbitrage.profitMargin).toBeNull();
    }
    // Ranked list: every scored row before any needs-comps row.
    const statuses = body.opportunities.map((o: any) => o.spread.net === null);
    expect(statuses).toEqual([false, true, true]);
    expect(body.summary.needsComps).toBe(2);
  });

  it("stale / frozen rows are excluded everywhere and counted", async () => {
    seed();
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage?homeState=MO"))
    ).json();
    const ids = JSON.stringify([
      body.regionalArbitrage,
      body.nationalArbitrage,
      body.needsComps,
      body.localDeals,
      body.opportunities,
    ]);
    expect(ids).not.toContain('"frozen"');
    expect(ids).not.toContain('"old"');
    expect(ids).not.toContain('"pass"');
    expect(body.summary.excluded.stale).toBe(2);
  });

  it("comps are fetched in batches, not per row", async () => {
    seed();
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage?homeState=MO"))
    ).json();
    expect(calls.deals).toBe(1);
    expect(calls.sold_listings).toBe(1);
    expect(body.compQueries).toBe(2);
  });

  it("all-no-comps inventory reports zero profit and an honest needsComps count", async () => {
    resolveFlip.mockResolvedValue(true);
    getDeals.mockResolvedValueOnce({
      deals: [
        deal({ askPrice: 5000 }),
        deal({ askPrice: 7000, model: "Corolla" }),
      ],
    });
    const body = await (
      await GET(new NextRequest("https://x.test/api/arbitrage?homeState=MO"))
    ).json();
    expect(body.summary.bestProfit).toBe(0);
    expect(body.summary.regionalProfit).toBe(0);
    expect(body.summary.nationalProfit).toBe(0);
    expect(body.topRoutes).toEqual([]);
    expect(body.summary.needsComps).toBe(2);
  });
});

describe("route source", () => {
  it("the flat SELL_COST_PCT and the CA default are gone", () => {
    const src = readFileSync(join(__dirname, "route.ts"), "utf8");
    expect(src).not.toMatch(/SELL_COST_PCT/);
    expect(src).not.toMatch(/homeState\s*=\s*["']CA["']/);
    expect(src).not.toMatch(/\|\|\s*["']CA["']/);
  });
});
