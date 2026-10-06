import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const configured = vi.hoisted(() => ({ value: false }));
const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
);

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/cache", () => ({
  cached: (_k: string, _t: number, run: () => unknown) => run(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => configured.value,
  createServerComponentClient: () => {
    throw new Error(
      "createServerComponentClient must not run when unconfigured",
    );
  },
}));

describe("supabase-missing honesty", () => {
  beforeEach(() => {
    configured.value = false;
    getServerUser.mockClear();
  });

  it("market/explore returns empty configured:false (not 500)", async () => {
    const { GET } = await import("./market/explore/route");
    const res = await GET(
      new NextRequest("http://localhost/api/market/explore"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("market/heatmap returns empty configured:false (not 500)", async () => {
    const { GET } = await import("./market/heatmap/route");
    const res = await GET(
      new NextRequest("http://localhost/api/market/heatmap"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.states).toEqual({});
  });

  it("outcomes GET returns empty configured:false", async () => {
    const { GET } = await import("./outcomes/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.outcomes).toEqual([]);
  });

  it("outcomes POST returns 503 configured:false", async () => {
    const { POST } = await import("./outcomes/route");
    const res = await POST(
      new NextRequest("http://localhost/api/outcomes", {
        method: "POST",
        body: JSON.stringify({ purchase_price: 1000 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.configured).toBe(false);
  });

  it("auction/run-list GET returns empty lists configured:false", async () => {
    const { GET } = await import("./auction/run-list/route");
    const res = await GET(
      new NextRequest("http://localhost/api/auction/run-list"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.lists).toEqual([]);
  });

  it("auction/run-list POST returns 503 configured:false", async () => {
    const { POST } = await import("./auction/run-list/route");
    const res = await POST(
      new NextRequest("http://localhost/api/auction/run-list", {
        method: "POST",
        body: JSON.stringify({ name: "x", vins: ["1"] }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.configured).toBe(false);
  });
});
