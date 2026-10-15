import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  configured: true,
  result: { data: [] as unknown[] | null, error: null as unknown },
  current: null as Record<string, any> | null,
  cutoff: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mock.configured,
  createServerComponentClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === "deals"
            ? { maybeSingle: async () => ({ data: mock.current, error: null }) }
            : {
                gte: (column: string, value: string) => {
                  mock.cutoff(column, value);
                  return { order: async () => mock.result };
                },
                order: async () => mock.result,
              },
      }),
    }),
  }),
}));
import { GET } from "./api/deals/[id]/price-history/route";
const request = () =>
  GET(new NextRequest("http://localhost/api/deals/test/price-history"), {
    params: Promise.resolve({ id: "test" }),
  });
beforeEach(() => {
  mock.configured = true;
  mock.result = { data: [], error: null };
  mock.current = null;
  mock.cutoff.mockClear();
});
describe("price history response truth", () => {
  it("keeps invalidated imports out of the chart without deleting audit history", async () => {
    const sourceUrl = "https://www.drivenation.com/vehiclesDetail.php?1539";
    mock.current = {
      source_url: sourceUrl,
      options: {
        sourceCorrection: {
          version: "drivenation-price-odometer-v1",
          sourceUrl,
          checkedAt: "2026-10-15T22:00:00Z",
        },
      },
    };
    expect((await request()).status).toBe(200);
    expect(mock.cutoff).toHaveBeenCalledWith(
      "observed_at",
      "2026-10-15T22:00:00Z",
    );
  });
  it("preserves a genuinely empty successful result", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
  it("reports retrieval failure separately without exposing diagnostics", async () => {
    mock.result = {
      data: null,
      error: { message: "private database diagnostics" },
    };
    const response = await request();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
  it("does not claim empty history when storage is unavailable", async () => {
    mock.configured = false;
    expect((await request()).status).toBe(503);
  });
});
