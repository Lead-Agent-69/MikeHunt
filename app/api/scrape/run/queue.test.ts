import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const enqueueScopedScrapeJob = vi.hoisted(() =>
  vi.fn(async () => ({
    deduplicated: false,
    job: {
      id: "queue-job-1",
      status: "pending",
      created_at: "2026-10-03T05:00:00.000Z",
    },
  })),
);

vi.mock("@/lib/scrapers/job-queue", () => ({
  isRemoteScrapeQueueEnabled: () => true,
  enqueueScopedScrapeJob,
}));
vi.mock("@/lib/auth/scrape-gate", () => ({
  scrapeSecret: () => "configured",
  denyUnauthed: vi.fn(async () => null),
}));
vi.mock("@/lib/system-readiness", () => ({
  systemReadiness: () => ({
    items: [
      { id: "supabase", status: "ready" },
      { id: "service-role", status: "ready" },
      { id: "scrape-control", status: "ready" },
    ],
  }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from: vi.fn() }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: vi.fn(async () => ({
    data: { user: { id: "user-1", email: "buyer@example.test" } },
    error: null,
  })),
}));

describe("production scoped scrape queue", () => {
  it("queues the resolved runner and exact dealer scope without loading a scraper", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("https://app.test/api/scrape/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: {
          lane: "private",
          vehicleType: "suv",
          state: "FL",
          sellerType: "dealer",
          maxPrice: 20_000,
          dealerSourceIds: ["ae-of-miami"],
        },
        sourceIds: ["ae-of-miami"],
        concurrency: 1,
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      queued: true,
      sourceIds: ["curated_dealers"],
      dealerSourceIds: ["ae-of-miami"],
      job: { id: "queue-job-1", status: "pending" },
    });
    expect(enqueueScopedScrapeJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        requestedBy: "user-1",
        sourceIds: ["curated_dealers"],
        scope: expect.objectContaining({
          q: "suv",
          state: "FL",
          maxPrice: 20_000,
          dealerSourceIds: ["ae-of-miami"],
        }),
      }),
    );
  });
});
