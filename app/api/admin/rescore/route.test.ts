import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  client: vi.fn(),
  market: vi.fn(),
  analyze: vi.fn(),
  select: vi.fn(),
  range: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
  read: {} as any,
  write: {} as any,
}));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: mocks.authorized,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("@/lib/scoring/market-value", () => ({
  loadMarketIndex: mocks.market,
}));
vi.mock("@/lib/scoring/deal-analyzer", () => ({ analyzeDeal: mocks.analyze }));
import { POST } from "./route";
const row = {
  id: "deal-one",
  title: "2020 Hyundai Kona",
  source: "truecar",
  ask_price: 10000,
  options: { priceEvidence: { kind: "asking", askingPrice: 10000 } },
  deal_analysis: { proof: "retained" },
  updated_at: "2026-10-14T00:00:00Z",
};
const request = (body: unknown = {}) =>
  new Request("https://app.test/api/admin/rescore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue(true);
  mocks.market.mockResolvedValue(undefined);
  mocks.analyze.mockReturnValue({
    verdict: "go",
    score: 80,
    profit: 2000,
    sellEstimate: 15000,
    recommendedMaxBid: 9000,
    repairCost: 400,
    transportCost: 600,
    valuation: { source: "comparables" },
  });
  mocks.read = { data: [row], error: null };
  mocks.write = { data: [{ id: row.id }], error: null };
  mocks.client.mockReturnValue({
    from: () => {
      let writing = false;
      const query: any = {
        select: (...args: any[]) => {
          mocks.select(...args);
          return query;
        },
        eq: (...args: any[]) => {
          mocks.eq(...args);
          return query;
        },
        order: () => query,
        range: (...args: any[]) => {
          mocks.range(...args);
          return query;
        },
        update: (...args: any[]) => {
          mocks.update(...args);
          writing = true;
          return query;
        },
        then: (resolve: any, reject: any) =>
          Promise.resolve(writing ? mocks.write : mocks.read).then(
            resolve,
            reject,
          ),
      };
      return query;
    },
  });
});
describe("bounded authorized rescore", () => {
  it.each([null, []])("rejects non-object request bodies %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each(["", "{"])(
    "rejects missing or malformed JSON without triggering a default write batch",
    async (body) => {
      expect(
        (
          await POST(
            new Request("https://app.test/api/admin/rescore", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body,
            }),
          )
        ).status,
      ).toBe(400);
      expect(mocks.client).not.toHaveBeenCalled();
    },
  );
  it("creates no privileged client for unauthorized callers", async () => {
    mocks.authorized.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([
    { page: -1 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: "Infinity" },
    { page: Number.MAX_SAFE_INTEGER },
  ])("rejects invalid pagination %j", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("loads pricing/geo evidence and persists schema-compatible scores with an optimistic guard", async () => {
    const res = await POST(request({ page: 2, pageSize: 1500 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      updated: 1,
      rescored: 1,
      failed: 0,
      scanned: 1,
    });
    expect(mocks.range).toHaveBeenCalledWith(2000, 2999);
    const columns = mocks.select.mock.calls[0][0];
    for (const column of [
      "options",
      "deal_analysis",
      "title",
      "lat",
      "lng",
      "updated_at",
    ])
      expect(columns.split(/,\s*/)).toContain(column);
    expect(mocks.analyze).toHaveBeenCalledWith(row);
    expect(mocks.eq).toHaveBeenCalledWith("updated_at", row.updated_at);
    expect(mocks.eq).toHaveBeenCalledWith("active", true);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      estimated_repair_cost: 400,
      estimated_transport_cost: 600,
      deal_analysis: { proof: "retained" },
    });
  });
  it("keeps source-price conflicts out of persisted GO math", async () => {
    mocks.read = {
      data: [
        {
          ...row,
          options: { priceEvidence: { kind: "unknown", listedAmount: 4545 } },
        },
      ],
      error: null,
    };
    expect((await POST(request())).status).toBe(200);
    expect(mocks.update.mock.calls[0][0]).toMatchObject({
      deal_verdict: "not_enough_data",
      true_net_profit: null,
      recommended_max_bid: null,
    });
  });
  it("previews decisions without issuing a write", async () => {
    const response = await POST(request({ dryRun: true, pageSize: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      dryRun: true,
      analyzed: 1,
      updated: 0,
      rescored: 0,
      verdicts: { go: 1 },
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not accept truthy strings as preview mode", async () => {
    expect((await POST(request({ dryRun: "true" }))).status).toBe(400);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it.each([
    { data: null, error: { message: "private diagnostic" } },
    { data: [], error: null },
  ])(
    "reports failed or conflicting writes instead of a successful rescore",
    async (write) => {
      mocks.write = write;
      const res = await POST(request());
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({
        scanned: 1,
        updated: 0,
        rescored: 0,
        failed: 1,
      });
    },
  );
  it("does not write when market evidence cannot load", async () => {
    mocks.market.mockRejectedValue(new Error("private diagnostic"));
    const res = await POST(request());
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("private diagnostic");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not write when the inventory read fails", async () => {
    mocks.read = { data: null, error: { message: "private diagnostic" } };
    const res = await POST(request());
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("private diagnostic");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
