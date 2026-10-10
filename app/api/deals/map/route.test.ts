import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  flip: false,
  empty: false,
  calls: [] as unknown[][],
}));
function query() {
  const q: any = {};
  let from = 0,
    to = 999;
  for (const method of [
    "select",
    "eq",
    "in",
    "or",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
    "neq",
    "is",
    "ilike",
    "order",
  ])
    q[method] = (...args: unknown[]) => {
      state.calls.push([method, ...args]);
      return q;
    };
  q.range = (start: number, end: number) => {
    from = start;
    to = end;
    return q;
  };
  q.then = (resolve: (value: unknown) => unknown) =>
    resolve({
      error: null,
      data: state.empty
        ? []
        : [
            {
              id: "one",
              year: 2020,
              make: "Ford",
              model: "F-150",
              lat: 38.6270251,
              lng: -90.1994042,
              ask_price: 12000,
              true_net_profit: 4000,
              deal_verdict: "go",
            },
            {
              id: "two",
              year: 2021,
              make: "Ford",
              model: "F-150",
              location_state: "TX",
              ask_price: null,
              true_net_profit: null,
              deal_verdict: "pass",
            },
          ].slice(from, to + 1),
    });
  return q;
}
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: () => query() }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => state.flip,
}));
import { GET } from "./route";
const request = (search: string) =>
  GET(new NextRequest(`https://app.test/api/deals/map?${search}`));

describe("Map scope and role safety", () => {
  beforeEach(() => {
    state.flip = false;
    state.empty = false;
    state.calls = [];
  });
  it("does not let personal buyers probe economics through verdict filters or colors", async () => {
    const response = await request("verdict=go");
    const body = await response.json();
    expect(body.deskAccess).toBe("personal");
    expect(
      state.calls.some(
        (call) => call[1] === "deal_verdict" || call[1] === "profit_score",
      ),
    ).toBe(false);
    expect(body.points.map((point: any) => point.type)).toEqual([
      "dealer",
      "dealer",
    ]);
    expect(JSON.stringify(body)).not.toContain("4000");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("sorts personal buyers by recency, flip desks by profit_score (Ren P3)", async () => {
    const orders = () =>
      state.calls.filter((c) => c[0] === "order").map((c) => c[1]);
    await request("");
    expect(orders()).toEqual(["last_seen_at", "id"]);
    state.calls = [];
    state.flip = true;
    await request("");
    expect(orders()).toEqual(["profit_score", "id"]);
  });
  it("preserves dealer verdict views", async () => {
    state.flip = true;
    await request("verdict=actionable");
    expect(state.calls).toContainEqual(["in", "deal_verdict", ["go", "hold"]]);
  });
  it("applies the same source, budget, state and listing evidence filters", async () => {
    await request(
      "state=TX&maxPrice=20000&hasVin=yes&runDrive=no&sources=govdeals",
    );
    expect(state.calls).toContainEqual(["eq", "location_state", "TX"]);
    expect(state.calls).toContainEqual(["lte", "ask_price", 20000]);
    expect(state.calls).toContainEqual(["eq", "run_drive", false]);
    expect(state.calls).toContainEqual(["neq", "vin", ""]);
    expect(
      state.calls.some(
        (call) => call[0] === "or" && String(call[1]).includes("govdeals.com"),
      ),
    ).toBe(true);
  });
  it("discloses sample limits and keeps missing prices unknown", async () => {
    const body = await (await request("limit=2")).json();
    expect(body.limited).toBe(true);
    expect(body.points[1].label).toContain("Price not reported");
    expect(body.points[1].approx).toBe(true);
    expect(state.calls).not.toContainEqual(["gt", "ask_price", 0]);
  });
  it("rejects inverted ranges before reading inventory", async () => {
    const response = await request("minPrice=20000&maxPrice=10000");
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.calls).toEqual([]);
  });
  it("rounds exact geocodes and centroid fallbacks to 2 decimals and sets no-store", async () => {
    const res = await request("");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body.points).toHaveLength(2);
    for (const p of body.points) {
      expect((String(p.lat).split(".")[1] || "").length).toBeLessThanOrEqual(2);
      expect((String(p.lng).split(".")[1] || "").length).toBeLessThanOrEqual(2);
    }
    expect(body.points[0]).toMatchObject({ lat: 38.63, lng: -90.2 });
    expect(JSON.stringify(body)).not.toContain("38.6270251");
    // Guests: no profit in the label.
    expect(body.points[0].label).not.toMatch(/profit/i);
  });

  it("empty result is no-store too", async () => {
    state.empty = true;
    const res = await request("");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).points).toEqual([]);
  });
});
