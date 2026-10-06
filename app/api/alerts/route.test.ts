import { describe, expect, it, vi, beforeEach } from "vitest";

const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "u1" } } })),
);
const resolveFlip = vi.hoisted(() => vi.fn(async () => false));
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from }),
}));
vi.mock("@/lib/deals/deal-desk-access", async () => {
  const actual = await vi.importActual<any>("@/lib/deals/deal-desk-access");
  return {
    ...actual,
    resolveCallerFlipDesk: () => resolveFlip(),
  };
});

beforeEach(() => {
  getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  resolveFlip.mockResolvedValue(false);
  from.mockReset();
});

describe("GET /api/alerts", () => {
  it("redacts profit_estimate for a non-flip desk", async () => {
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(async () => ({
        data: [
          {
            id: "a1",
            status: "unread",
            created_at: "2026-10-04T00:00:00Z",
            deal_id: "d1",
            deals: {
              id: "d1",
              source: "craigslist",
              year: 2018,
              make: "Ford",
              model: "F-150",
              ask_price: 9000,
              mmr_value: 12000,
              profit_estimate: 2500,
              profit_score: 80,
              true_net_profit: 2200,
              recommended_max_bid: 8500,
              location_city: "Dallas",
              location_state: "TX",
            },
          },
        ],
        error: null,
      })),
    };
    from.mockReturnValue(chain);

    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deskAccess).toBe("personal");
    const deal = body.alerts[0].deals;
    expect(deal.ask_price).toBe(9000);
    expect(deal.mmr_value).toBe(12000);
    expect(deal).not.toHaveProperty("profit_estimate");
    expect(deal).not.toHaveProperty("profit_score");
    expect(deal).not.toHaveProperty("true_net_profit");
    expect(deal).not.toHaveProperty("recommended_max_bid");
  });

  it("keeps profit fields for a flip desk", async () => {
    resolveFlip.mockResolvedValue(true);
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(async () => ({
        data: [
          {
            id: "a1",
            status: "read",
            created_at: "2026-10-04T00:00:00Z",
            deal_id: "d1",
            deals: { id: "d1", profit_estimate: 2500, ask_price: 9000 },
          },
        ],
        error: null,
      })),
    };
    from.mockReturnValue(chain);
    const { GET } = await import("./route");
    const body = await (await GET()).json();
    expect(body.deskAccess).toBe("flip");
    expect(body.alerts[0].deals.profit_estimate).toBe(2500);
  });
});
