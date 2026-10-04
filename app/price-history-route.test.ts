import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({
  configured: true,
  result: { data: [] as unknown[] | null, error: null as unknown },
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mock.configured,
  createServerComponentClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => mock.result }) }),
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
});
describe("price history response truth", () => {
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
