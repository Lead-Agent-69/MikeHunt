import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const route = vi.hoisted(() => vi.fn());
vi.mock("@/lib/geo/routing", () => ({ roadRoute: route }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
import { GET } from "@/app/api/transport/quote/route";
import { STATE_COORDS } from "@/lib/geo";

beforeEach(() => {
  route
    .mockReset()
    .mockResolvedValue({ miles: 1400, minutes: 1200, mode: "road" });
});
describe("transport coordinate fallback", () => {
  it.each(["", "&fromLat=&fromLng=&toLat=&toLng="])(
    "routes missing coordinates through the selected states: %s",
    async (suffix) => {
      const response = await GET(
        new NextRequest(
          `http://localhost/api/transport/quote?from=TX&to=CA${suffix}`,
        ),
      );
      expect(response.status).toBe(200);
      expect(route).toHaveBeenCalledWith(
        { lat: STATE_COORDS.TX.lat, lng: STATE_COORDS.TX.lon },
        { lat: STATE_COORDS.CA.lat, lng: STATE_COORDS.CA.lon },
      );
    },
  );
  it("accepts explicit zero coordinates but rejects incomplete coordinates without a state", async () => {
    const precise = await GET(
      new NextRequest(
        "http://localhost/api/transport/quote?fromLat=0&fromLng=0&toLat=1&toLng=1",
      ),
    );
    expect(precise.status).toBe(200);
    expect(route).toHaveBeenCalledWith({ lat: 0, lng: 0 }, { lat: 1, lng: 1 });
    route.mockClear();
    const invalid = await GET(
      new NextRequest(
        "http://localhost/api/transport/quote?fromLat=0&toLat=1&toLng=1",
      ),
    );
    expect(invalid.status).toBe(400);
    expect(route).not.toHaveBeenCalled();
  });
});
