// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveFlip = vi.hoisted(() => vi.fn(async () => false));
const getDeals = vi.hoisted(() => vi.fn(async () => ({ deals: [] })));
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

import { GET } from "./route";

function profileAndPrefs(opts: {
  home_state?: string | null;
  preferred_makes?: string[];
  homeLocation?: { state: string } | null;
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "user_profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                home_state: opts.home_state ?? null,
                preferred_makes: opts.preferred_makes ?? [],
              },
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === "user_preferences") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                prefs: opts.homeLocation
                  ? { homeLocation: opts.homeLocation }
                  : opts.homeLocation === null
                    ? { homeLocation: null }
                    : {},
              },
              error: null,
            }),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
}

beforeEach(() => {
  resolveFlip.mockResolvedValue(false);
  getDeals.mockClear();
  getServerUser.mockResolvedValue({ data: { user: null } });
  fromMock.mockReset();
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
    expect(getDeals).not.toHaveBeenCalled();
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
  });
});

describe("GET /api/arbitrage home resolution", () => {
  it("uses prefs.homeLocation when profile.home_state is empty", async () => {
    resolveFlip.mockResolvedValue(true);
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    profileAndPrefs({ home_state: null, homeLocation: { state: "mo" } });

    const res = await GET(new NextRequest("https://x.test/api/arbitrage"));
    const body = await res.json();
    expect(body.homeState).toBe("MO");
    expect(body.tailored).toBe(true);
    expect(body.deskAccess).toBe("flip");
    expect(getDeals).toHaveBeenCalled();
  });

  it("prefs.homeLocation wins over a stale profile.home_state", async () => {
    resolveFlip.mockResolvedValue(true);
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    profileAndPrefs({ home_state: "CA", homeLocation: { state: "MO" } });

    const res = await GET(new NextRequest("https://x.test/api/arbitrage"));
    const body = await res.json();
    expect(body.homeState).toBe("MO");
    expect(body.tailored).toBe(true);
  });

  it("non-flip desk still reports saved prefs home (no false set-home copy)", async () => {
    resolveFlip.mockResolvedValue(false);
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    profileAndPrefs({ home_state: "", homeLocation: { state: "MO" } });

    const res = await GET(new NextRequest("https://x.test/api/arbitrage"));
    const body = await res.json();
    expect(body.flipOnly).toBe(true);
    expect(body.homeState).toBe("MO");
    expect(body.tailored).toBe(true);
    expect(getDeals).not.toHaveBeenCalled();
  });
});
