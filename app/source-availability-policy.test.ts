import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const mocks = vi.hoisted(() => ({
  deny: vi.fn(),
  state: vi.fn(() => {
    throw new Error("No database access expected");
  }),
  save: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/lib/scrapers/runner", () => ({
  createScraperRegistry: () => ({
    loadState: async () => {},
    get: () => ({ id: "copart", enabled: true, consecutiveFailures: 3 }),
    resetConsecutiveFailures: mocks.reset,
  }),
}));
vi.mock("@/lib/auth/scrape-gate", () => ({ denyUnauthed: mocks.deny }));
vi.mock("@/lib/scrapers/tools/state", () => ({
  ScraperStateManager: mocks.state,
}));
import { POST } from "@/app/api/scrape/registry/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.deny.mockResolvedValue(null);
});
const request = (action = "disable") =>
  new NextRequest("https://dealerhunt.test/api/scrape/registry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "copart", action }),
  });
it("rejects permanent source disabling before touching stored state", async () => {
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("Sources remain available");
  expect(mocks.state).not.toHaveBeenCalled();
});
it("keeps the admin gate before source control requests", async () => {
  mocks.deny.mockResolvedValue(
    NextResponse.json({ error: "Sign in required" }, { status: 401 }),
  );
  expect((await POST(request())).status).toBe(401);
  expect(mocks.state).not.toHaveBeenCalled();
});

it.each([false, true])(
  "confirms cooldown reset only after persistence: %s",
  async (saved) => {
    mocks.state.mockImplementationOnce(function () {
      return { saveSourceState: mocks.save } as never;
    });
    mocks.save.mockResolvedValueOnce(saved);
    const response = await POST(request("reset"));
    expect(mocks.reset).toHaveBeenCalledWith("copart");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(response.status).toBe(saved ? 200 : 503);
    const body = await response.json();
    if (saved)
      expect(body).toMatchObject({
        id: "copart",
        action: "reset",
        enabled: true,
      });
    else {
      expect(body.enabled).toBeUndefined();
      expect(body.error).toContain("could not be saved");
    }
  },
);
