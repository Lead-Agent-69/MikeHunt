// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const resolveFlip = vi.hoisted(() => vi.fn(async () => false));
const rpc = vi.hoisted(() =>
  vi.fn(async () => ({
    data: [{ make: "Ford", model: "F-150", go_deals: 4, avg_profit: 3100, avg_days: 12 }],
  })),
);
const eqCalls = vi.hoisted(() => [] as unknown[][]);

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "neq", "order", "limit", "gte"]) c[m] = vi.fn(() => c);
  c.eq = vi.fn((...args: unknown[]) => {
    eqCalls.push(args);
    return c;
  });
  c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return c;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    rpc,
    from: (table: string) =>
      table === "market_timing_signals"
        ? chain({ data: [{ make: "Honda", model: "Civic", pct_change: -3.2 }] })
        : chain({ count: 7, data: [] }),
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: () => resolveFlip(),
}));

import { GET as pulseGET } from "./pulse/route";
import { GET as tickerGET } from "./ticker/route";

const req = (p: string) => new NextRequest(`https://x.test${p}`);

beforeEach(() => {
  resolveFlip.mockResolvedValue(false);
  rpc.mockClear();
  eqCalls.length = 0;
});

describe("/api/market/pulse desk gate", () => {
  it("returns no BUY/avgProfit rows for non-flip, private no-store", async () => {
    const res = await pulseGET(req("/api/market/pulse"));
    const body = await res.json();
    expect(body.rows).toEqual([]);
    expect(body.deskAccess).toBe("personal");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps rows for a flip desk", async () => {
    resolveFlip.mockResolvedValue(true);
    const res = await pulseGET(req("/api/market/pulse"));
    const body = await res.json();
    expect(body.rows[0]).toMatchObject({ make: "Ford", goDeals: 4, avgProfit: 3100 });
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("/api/market/ticker desk gate", () => {
  it("non-flip: no BUY / flash / avg profit labels", async () => {
    const res = await tickerGET(req("/api/market/ticker"));
    const body = await res.json();
    const text = JSON.stringify(body.items);
    expect(text).not.toMatch(/BUY|profit|Flash/i);
    expect(text).toContain("New listings today: 7");
    expect(text).toContain("Honda Civic");
    expect(eqCalls.some((a) => a[0] === "deal_verdict")).toBe(false);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("flip desk keeps BUY and avg profit", async () => {
    resolveFlip.mockResolvedValue(true);
    const res = await tickerGET(req("/api/market/ticker"));
    const text = JSON.stringify((await res.json()).items);
    expect(text).toContain("New BUY deals today");
    expect(text).toContain("avg profit");
  });
});
