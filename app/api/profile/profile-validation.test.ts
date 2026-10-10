import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createServerComponentClient: vi.fn(),
}));
vi.mock("@/lib/server-supabase", () => ({ getServerUser: vi.fn() }));
import { POST } from "./route";
const request = (body: unknown, account = false) =>
  new NextRequest("http://localhost/api/profile", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...(account ? { "x-require-account": "true" } : {}),
    },
  });
describe("profile save validation", () => {
  it("rejects expired-account writes rather than silently saving guest data", async () => {
    expect(
      (await POST(request({ recon_cost_default: 750 }, true))).status,
    ).toBe(401);
  });
  it.each([
    null,
    [],
    { recon_cost_default: -1 },
    { auction_fee_default: "bad" },
    { home_lat: 100, home_lng: 0 },
    { home_zip: "123" },
  ])("rejects invalid settings %j", async (value) => {
    expect((await POST(request(value))).status).toBe(400);
  });
  it("accepts legitimate zero costs", async () => {
    const res = await POST(
      request({ recon_cost_default: 0, auction_fee_default: 0 }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile.recon_cost_default).toBe(0);
  });
});
