import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const select = vi.hoisted(() => vi.fn());
const resolveCallerFlipDesk = vi.hoisted(() => vi.fn());

// A full deals row, the way select("*") used to return it.
const fullRow = {
  id: "d1",
  source: "govdeals",
  title: "2018 Toyota Camry SE",
  year: 2018,
  make: "Toyota",
  model: "Camry",
  trim: "SE",
  mileage: 61000,
  condition: "used",
  ask_price: 14000,
  images: ["https://img.example/1.jpg"],
  location_city: "Springfield",
  location_state: "MO",
  location_zip: "65801",
  lat: 37.2,
  lng: -93.29,
  location: "0101000020E6100000",
  embedding: "[0.1,0.2,0.3]",
  pricing_breakdown: { fees: 400 },
  profit_score: 77,
  profit_estimate: 2500,
  true_net_profit: 2100,
  seller_phone: "555-0100",
  options: { seller: { phone: "555-0100", email: "s@example.com" } },
  dealer_id: "dealer-1",
  source_deal_id: "gd-123",
  duplicate_of_id: "d0",
  duplicate_confidence: 0.9,
  flash_alert_sent: true,
  images_cached: ["cache/1.jpg"],
  kbb_trade_in: 11000,
  kbb_retail: 16000,
  cargurus_price: 15000,
  mmr_value: 16500,
  estimated_transport_cost: 300,
  estimated_repair_cost: 900,
};

function chain() {
  const q: any = {};
  for (const m of ["eq", "ilike", "gte", "lte", "order"]) q[m] = () => q;
  q.limit = async () => ({ data: [fullRow], error: null });
  return q;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => ({
      select: (cols: string) => {
        select(cols);
        return chain();
      },
    }),
  }),
}));

vi.mock("@/lib/deals/deal-desk-access", async (orig) => {
  const actual = await orig<typeof import("@/lib/deals/deal-desk-access")>();
  return { ...actual, resolveCallerFlipDesk };
});

import { GET } from "./route";

// Ren's banned list: none of these may ever leave /api/find-similar, for any desk.
const LEAKY = [
  "embedding",
  "lat",
  "lng",
  "location",
  "location_zip",
  "pricing_breakdown",
  "options",
  "dealer_id",
  "source_deal_id",
  "duplicate_of_id",
  "duplicate_confidence",
  "flash_alert_sent",
  "images_cached",
  "kbb_trade_in",
  "kbb_retail",
  "cargurus_price",
  "mmr_value",
  "estimated_transport_cost",
  "estimated_repair_cost",
  "true_net_profit",
  "seller_phone",
];

const req = () =>
  new NextRequest(
    "http://localhost/api/find-similar?make=Toyota&model=Camry&year=2018&price=15000&mileage=60000",
    {
      headers: {
        "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}`,
      },
    },
  );

beforeEach(() => {
  select.mockReset();
  resolveCallerFlipDesk.mockReset();
});

describe("GET /api/find-similar column allowlist", () => {
  it("never selects * and never selects embedding / geo / pricing_breakdown", async () => {
    resolveCallerFlipDesk.mockResolvedValue(false);
    await GET(req());
    const cols = String(select.mock.calls[0]?.[0] ?? "");
    expect(cols).not.toContain("*");
    const list = cols.split(",").map((c) => c.trim());
    for (const k of LEAKY) expect(list).not.toContain(k);
    expect(
      list.some((c) => c.startsWith("kbb_") || /^estimated_.*_cost$/.test(c)),
    ).toBe(false);
  });

  it("anonymous response has no embedding, lat/lng, zip, pricing_breakdown or flip economics", async () => {
    resolveCallerFlipDesk.mockResolvedValue(false);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(body).toHaveLength(1);
    const card = body[0];
    for (const k of LEAKY) expect(card).not.toHaveProperty(k);
    expect(card).not.toHaveProperty("profit_score");
    expect(card).not.toHaveProperty("profit_estimate");
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("65801");
    expect(raw).not.toContain("0.1,0.2,0.3");
    expect(raw).not.toContain("555-0100");
    expect(raw).not.toContain("s@example.com");
    // No coordinate with more than 2 decimals anywhere in the payload.
    expect(raw).not.toMatch(/-?\d+\.\d{3,}/);
    for (const k of [
      "profit_score",
      "profit_estimate",
      "true_net_profit",
      "trueNetProfit",
      "profitScore",
    ]) {
      expect(card).not.toHaveProperty(k);
    }
    // What the modal renders survives.
    expect(card).toMatchObject({
      id: "d1",
      year: 2018,
      make: "Toyota",
      model: "Camry",
      trim: "SE",
      mileage: 61000,
      ask_price: 14000,
      location_city: "Springfield",
      location_state: "MO",
      images: ["https://img.example/1.jpg"],
    });
  });

  it("flip desk keeps score/profit but still never gets embedding or exact geo", async () => {
    resolveCallerFlipDesk.mockResolvedValue(true);
    const body = await (await GET(req())).json();
    const card = body[0];
    for (const k of LEAKY) expect(card).not.toHaveProperty(k);
    expect(card.profit_score).toBe(77);
    expect(card.profit_estimate).toBe(2500);
  });
});

describe("GET /api/find-similar no-store on every path", () => {
  it("400 when make/model missing", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/find-similar?make=Toyota", {
        headers: { "x-forwarded-for": "10.9.9.9" },
      }),
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("500 when the desk lookup throws", async () => {
    resolveCallerFlipDesk.mockRejectedValue(new Error("boom"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("429 past 30/min per caller", async () => {
    resolveCallerFlipDesk.mockResolvedValue(false);
    const r = () =>
      new NextRequest(
        "http://localhost/api/find-similar?make=Toyota&model=Camry",
        { headers: { "x-forwarded-for": "10.77.77.77" } },
      );
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) last = await GET(r());
    expect(last!.status).toBe(429);
    expect(last!.headers.get("cache-control")).toBe("private, no-store");
  });
});
