// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveFlip = vi.hoisted(() => vi.fn(async () => false));
const getDeals = vi.hoisted(() => vi.fn(async () => ({ deals: [] })));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({}),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: null } }),
}));
vi.mock("@/lib/data/deals-service", () => ({
  DealsService: class {
    getDeals = getDeals;
  },
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: () => resolveFlip(),
}));

import { GET } from "./route";

beforeEach(() => {
  resolveFlip.mockResolvedValue(false);
  getDeals.mockClear();
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
  });
});
