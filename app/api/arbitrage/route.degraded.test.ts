// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveFlip = vi.hoisted(() => vi.fn(async () => true));
const getDeals = vi.hoisted(() =>
  vi.fn(async () => {
    throw new Error("simulated scan failure");
  }),
);
const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: null as { id: string } | null } })),
);

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: vi.fn() }),
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

beforeEach(() => {
  resolveFlip.mockResolvedValue(true);
  getDeals.mockClear();
  getDeals.mockRejectedValue(new Error("simulated scan failure"));
  getServerUser.mockResolvedValue({ data: { user: null } });
});

describe("GET /api/arbitrage scan soft-fail", () => {
  it("returns 200 empty degraded payload instead of 500 on scan throw", async () => {
    const res = await GET(
      new NextRequest("https://x.test/api/arbitrage?homeState=MO"),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.degraded).toBe(true);
    expect(body.deskAccess).toBe("flip");
    expect(body.homeState).toBe("MO");
    expect(body.localDeals).toEqual([]);
    expect(body.nationalArbitrage).toEqual([]);
    expect(body.summary.bestProfit).toBe(0);
    expect(getDeals).toHaveBeenCalled();
    expect(getDeals.mock.calls[0]?.[0]).toMatchObject({ limit: 1000 });
  });
});
