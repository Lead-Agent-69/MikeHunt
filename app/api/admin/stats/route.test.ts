import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  client: vi.fn(),
  from: vi.fn(),
  rows: vi.fn(),
}));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: mocks.authorized,
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: mocks.client,
}));
vi.mock("@/lib/db/paginate", () => ({ fetchAllRows: mocks.rows }));
import { GET } from "./route";

function result(value: Record<string, unknown>) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "gt", "order", "limit", "range"])
    query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(value).then(resolve);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue(true);
  mocks.client.mockReturnValue({ from: mocks.from });
  mocks.from.mockImplementation(() =>
    result({ count: 2400, data: [], error: null }),
  );
  mocks.rows.mockResolvedValue([]);
});

describe("admin dashboard metrics", () => {
  const request = () => new NextRequest("https://example.com/api/admin/stats");
  it("does not create the privileged client for unauthorized requests", async () => {
    mocks.authorized.mockResolvedValue(false);
    expect((await GET(request())).status).toBe(401);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("uses exact user counts and includes source/score rows beyond 1000", async () => {
    mocks.rows.mockResolvedValue(
      Array.from({ length: 1500 }, (_, i) => ({
        source: i < 1000 ? "first" : "second",
        profit_score: i < 1000 ? 10 : 100,
        deal_verdict: i < 1000 ? "hold" : "go",
      })),
    );
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.totalUsers).toBe(2400);
    expect(body.dealsBySource.map((s: { count: number }) => s.count)).toEqual([
      1000, 500,
    ]);
    expect(body.avgProfitScore).toBe(40);
    expect(body.goDealsCount).toBe(500);
  });
  it("does not report failed database queries as zero", async () => {
    mocks.from.mockImplementation(() =>
      result({
        count: null,
        data: null,
        error: { message: "private database diagnostic" },
      }),
    );
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database diagnostic");
  });
  it("treats missing counts and failed paginated reads as unavailable", async () => {
    mocks.from.mockImplementation(() =>
      result({ count: null, data: [], error: null }),
    );
    expect((await GET(request())).status).toBe(503);
    mocks.rows.mockRejectedValueOnce(new Error("read failure"));
    expect((await GET(request())).status).toBe(503);
  });
  it("refuses to publish truncated metrics at the bounded scan limit", async () => {
    mocks.rows.mockResolvedValue(new Array(50_001).fill({ source: "first" }));
    expect((await GET(request())).status).toBe(503);
  });
});
