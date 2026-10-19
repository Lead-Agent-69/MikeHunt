import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: mocks.allowed }),
  tooManyRequests: () => new Response("Limited", { status: 429 }),
}));
import { POST } from "./route";
const scenario = {
  purchase: 10000,
  resale: 16000,
  buyerFees: 500,
  buyerFeeRate: 5,
  taxTitle: 500,
  repair: 1000,
  transport: 300,
  holding: 200,
  sellingFees: 100,
  sellingFeeRate: 2,
  otherCosts: 400,
  targetProfit: 2000,
};
const request = (body: unknown) =>
  new NextRequest("https://example.com/api/deal/max-bid", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  mocks.allowed = true;
});
describe("max-bid scenario API", () => {
  it("uses the same explicit arithmetic as the planner and never approves acquisition", async () => {
    const response = await POST(request({ scenario }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.margin_pct).toBeCloseTo(13.625);
    expect(result).toMatchObject({
      status: "complete",
      acquisitionReady: false,
      max_bid: 10171.42,
      viable: true,
      metrics: { profit: 2180 },
    });
  });
  it("keeps legacy omissions unknown, including source-specific fees", async () => {
    const response = await POST(
      request({
        market_price: 20000,
        target_profit: 3000,
        source: "copart",
        costs: { repair: 1000, transport: 500 },
      }),
    );
    expect(await response.json()).toMatchObject({
      status: "needs_inputs",
      max_bid: null,
      roi_pct: null,
      viable: false,
      acquisitionReady: false,
      missing: expect.arrayContaining([
        "purchase",
        "buyerFees",
        "buyerFeeRate",
        "taxTitle",
        "holding",
        "sellingFees",
        "sellingFeeRate",
        "otherCosts",
      ]),
    });
  });
  it.each([
    null,
    [],
    "string",
    { scenario: null },
    { scenario: [] },
    { scenario: { ...scenario, buyerFees: true } },
  ])("rejects malformed inputs without a server error", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
  });
  it("rejects invalid JSON", async () => {
    expect(
      (
        await POST(
          new NextRequest("https://example.com/api/deal/max-bid", {
            method: "POST",
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
  });
  it("retains rate limiting", async () => {
    mocks.allowed = false;
    expect((await POST(request({ scenario }))).status).toBe(429);
  });
});
