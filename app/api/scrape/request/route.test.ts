import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  limit: vi.fn(),
  enabled: vi.fn(),
  enqueue: vi.fn(),
  allowed: vi.fn(),
}));
vi.mock("@/lib/server-supabase", () => ({ getServerUser: mocks.user }));
vi.mock("@/lib/supabase", () => ({ createServerComponentClient: () => ({}) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.limit }));
vi.mock("@/lib/scrapers/job-queue", () => ({
  isRemoteScrapeQueueEnabled: mocks.enabled,
  enqueueScopedScrapeJob: mocks.enqueue,
}));
vi.mock("@/lib/scrapers/sweep-schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/scrapers/sweep-schedule")>()),
  isAutomationAllowedSource: mocks.allowed,
}));
vi.mock("@/lib/api/http-error", () => ({
  internalError: (_tag: string, _error: unknown, message: string) =>
    Response.json({ error: message }, { status: 500 }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "buyer-1" } } });
  mocks.limit.mockReturnValue({ allowed: true });
  mocks.enabled.mockReturnValue(true);
  mocks.allowed.mockReturnValue(true);
  mocks.enqueue.mockResolvedValue({
    deduplicated: false,
    job: {
      id: "job-1",
      status: "queued",
      created_at: "now",
      private: "secret",
    },
  });
});

async function send(
  body: unknown = {
    scope: { state: "MO", lane: "clean-retail" },
    sourceIds: ["craigslist"],
  },
  origin = "https://app.test",
) {
  const { POST } = await import("./route");
  return POST(
    new NextRequest("https://app.test/api/scrape/request", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("bounded buyer collection requests", () => {
  it("rejects unsupported radius collection rather than silently discarding its location", async () => {
    const response = await send({
      scope: { state: "MO", zip: "63101", radius: 50 },
      sourceIds: ["craigslist"],
    });
    expect(response.status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("queues for the verified owner and ignores client runner controls", async () => {
    const response = await send({
      scope: { state: "MO", lane: "clean-retail", q: "Ford Explorer" },
      sourceIds: ["craigslist"],
      requestedBy: "admin",
      concurrency: 99,
      dryRun: true,
      redisUrl: "https://evil.test",
    });
    expect(response.status).toBe(202);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        requestedBy: "buyer-1",
        sourceIds: ["craigslist"],
        concurrency: 2,
        orchestrator: "concurrent",
        dryRun: false,
        scope: expect.objectContaining({
          state: "MO",
          q: expect.stringContaining("Ford Explorer"),
        }),
      }),
    );
    expect(JSON.stringify(await response.json())).not.toContain("secret");
    expect(mocks.enqueue.mock.calls[0][1]).not.toHaveProperty("redisUrl");
  });
  it("requires authentication", async () => {
    mocks.user.mockResolvedValue({ data: { user: null } });
    expect((await send()).status).toBe(401);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests", async () => {
    expect((await send(undefined, "https://evil.test")).status).toBe(403);
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it.each([
    { scope: {} },
    { scope: { state: "ZZ" } },
    { scope: { states: ["MO", "IL", "TX", "FL"] } },
    { scope: { state: "MO" }, sourceIds: "craigslist" },
    { scope: [] },
  ])("rejects invalid or unbounded searches: %j", async (body) => {
    expect((await send(body)).status).toBe(400);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("does not widen a retail search to auction sources", async () => {
    expect(
      (
        await send({
          scope: { state: "MO", lane: "clean-retail" },
          sourceIds: ["copart"],
        })
      ).status,
    ).toBe(422);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("respects automation restrictions", async () => {
    mocks.allowed.mockReturnValue(false);
    expect((await send()).status).toBe(422);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("rate limits buyer requests", async () => {
    mocks.limit.mockReturnValue({ allowed: false, retryAfter: 30 });
    const response = await send();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("does not execute locally if the queue is unavailable", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await send()).status).toBe(503);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
  it("keeps database errors out of customer responses", async () => {
    mocks.enqueue.mockRejectedValue(new Error("service_role secret"));
    const response = await send();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(
      /service_role|secret/,
    );
  });
});
