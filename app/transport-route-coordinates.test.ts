// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
const roadRoute = vi.hoisted(() =>
  vi.fn(async (_from: unknown, _to: unknown) => ({
    miles: 1900,
    minutes: 1800,
    mode: "road",
  })),
);
vi.mock("@/lib/geo/routing", () => ({ roadRoute }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
import { GET } from "./api/transport/quote/route";
beforeEach(() => roadRoute.mockClear());
it("missing coordinates use state centers, never implicit zero/zero", async () => {
  const response = await GET(
    new NextRequest("https://app.example/api/transport/quote?from=MO&to=CA"),
  );
  expect(response.status).toBe(200);
  const [from, to] = roadRoute.mock.calls[0] as [
    { lat: number; lng: number },
    { lat: number; lng: number },
  ];
  expect(from.lat).not.toBe(0);
  expect(to.lat).not.toBe(0);
  expect(from).not.toEqual(to);
});
it("missing states and blank or partial coordinates do not create a route", async () => {
  for (const query of [
    "",
    "fromLat=&fromLng=&toLat=&toLng=",
    "fromLat=38&toLat=34",
  ]) {
    expect(
      (
        await GET(
          new NextRequest(`https://app.example/api/transport/quote?${query}`),
        )
      ).status,
    ).toBe(400);
  }
  expect(roadRoute).not.toHaveBeenCalled();
});
