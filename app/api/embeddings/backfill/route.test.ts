import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  backfill: vi.fn(),
  hasProvider: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCron: (request: NextRequest) =>
    request.headers.get("authorization") === "Bearer test-secret",
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: mocks.createClient,
}));
vi.mock("@/lib/ai/deal-embeddings", () => ({
  backfillEmbeddings: mocks.backfill,
  hasEmbeddingProvider: mocks.hasProvider,
}));

import { GET } from "./route";

const database = { name: "database" };
const request = (limit?: string, authorized = true) =>
  new NextRequest(
    `https://example.test/api/embeddings/backfill${limit == null ? "" : `?limit=${limit}`}`,
    {
      headers: authorized ? { authorization: "Bearer test-secret" } : undefined,
    },
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasProvider.mockReturnValue(true);
  mocks.createClient.mockReturnValue(database);
  mocks.backfill.mockResolvedValue({ updated: 1, skipped: false });
});

describe("GET /api/embeddings/backfill", () => {
  it("authorizes before checking providers or creating a database client", async () => {
    const response = await GET(request(undefined, false));
    expect(response.status).toBe(401);
    expect(mocks.hasProvider).not.toHaveBeenCalled();
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.backfill).not.toHaveBeenCalled();
  });

  it("skips cleanly without a configured provider", async () => {
    mocks.hasProvider.mockReturnValue(false);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ skipped: true });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.backfill).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 100],
    ["not-a-number", 100],
    ["250", 100],
    ["25", 25],
    ["0", 1],
    ["-20", 1],
  ])("bounds requested limit %s to %i", async (input, expected) => {
    const response = await GET(request(input));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, updated: 1 });
    expect(mocks.backfill).toHaveBeenCalledExactlyOnceWith(database, expected, {
      timeBudgetMs: 180_000,
    });
  });
});
