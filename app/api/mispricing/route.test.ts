import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const eq = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => false,
  listingsForDesk: (deals: unknown[]) => deals,
}));

function queryBuilder() {
  const q: any = {};
  for (const m of ["select", "not", "gt", "order", "limit"]) q[m] = () => q;
  q.eq = (...args: unknown[]) => {
    eq(...args);
    return q;
  };
  q.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: [], error: null });
  return q;
}

describe("GET /api/mispricing state filter", () => {
  beforeEach(() => {
    eq.mockReset();
    from.mockReset();
    from.mockImplementation(() => queryBuilder());
  });

  it("filters to location_state when ?state= is a 2-letter code", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("https://app.test/api/mispricing?state=mo"),
    );
    expect(res.status).toBe(200);
    expect(eq).toHaveBeenCalledWith("location_state", "MO");
  });

  it("does not apply a state filter without a state or for NATIONWIDE", async () => {
    const { GET } = await import("./route");
    await GET(new NextRequest("https://app.test/api/mispricing"));
    await GET(
      new NextRequest("https://app.test/api/mispricing?state=NATIONWIDE"),
    );
    expect(eq).not.toHaveBeenCalledWith("location_state", expect.anything());
  });
});
