// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const allowed = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: allowed.value }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));

import { GET } from "./route";

const req = () =>
  new NextRequest("https://x.test/api/plate?plate=ABC1234&state=tx");
const fetchSpy = vi.fn();

beforeEach(() => {
  allowed.value = true;
  getServerUser.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  process.env.PLATE2VIN_KEY = "k";
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PLATE2VIN_KEY;
});

describe("GET /api/plate", () => {
  it("401s signed-out callers without touching the paid API", async () => {
    getServerUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect((await res.json()).signInRequired).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("401s when the auth lookup throws", async () => {
    getServerUser.mockRejectedValue(new Error("down"));
    expect((await GET(req())).status).toBe(401);
  });

  it("keeps the rate limit ahead of auth", async () => {
    allowed.value = false;
    expect((await GET(req())).status).toBe(429);
    expect(getServerUser).not.toHaveBeenCalled();
  });

  it("signed-in callers get the VIN", async () => {
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    fetchSpy.mockResolvedValue({
      json: async () => ({ vin: "1FTEW1E50JFA00000" }),
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).vin).toBe("1FTEW1E50JFA00000");
  });
});
