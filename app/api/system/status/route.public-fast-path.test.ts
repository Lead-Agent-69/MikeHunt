import { beforeEach, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/cache";

const mocks = vi.hoisted(() => ({
  inventory: vi.fn(),
  client: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: mocks.admin,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: mocks.client,
}));
vi.mock("@/lib/public-inventory-status", () => ({
  publicInventoryStatus: mocks.inventory,
}));
vi.mock("@/lib/auth/provider-readiness", async (original) => ({
  ...(await original<typeof import("@/lib/auth/provider-readiness")>()),
  readAuthProviderReadiness: async () => ({
    reachable: true,
    google: true,
    email: true,
    checkedAt: "2026-10-14T00:00:00Z",
  }),
}));
import { GET } from "./route";
const request = () => new Request("http://localhost/api/system/status") as any;
const inventory = {
  activeDeals: 100,
  buyerReady: true,
  decisionReady: false,
  sourceHealth: { readySources: null, activeDeals: 100 },
  freshness: {
    activeDeals: 100,
    newLast24h: 10,
    newestAgeHours: 0,
    stale: false,
  },
  quality: { goDeals: 0, watchCandidates: 3 },
};
beforeEach(() => {
  invalidate("status:");
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(false);
  mocks.client.mockReturnValue({
    from: () => {
      throw new Error("Full status must not run");
    },
  });
});
it("coalesces cold public checks and caches only successful inventory proof", async () => {
  let resolve!: (value: typeof inventory) => void;
  mocks.inventory.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const first = GET(request());
  const second = GET(request());
  await vi.waitFor(() => expect(mocks.inventory).toHaveBeenCalledTimes(1));
  resolve(inventory);
  const responses = await Promise.all([first, second]);
  expect(await responses[0].json()).toMatchObject({
    scope: "public",
    ...inventory,
  });
  expect(await responses[1].json()).not.toHaveProperty("valuationAccuracy");
  await GET(request());
  expect(mocks.inventory).toHaveBeenCalledTimes(1);
  expect(mocks.client).toHaveBeenCalledTimes(1);
  expect(responses[0].headers.get("Cache-Control")).toBe("private, no-store");
});
it("reports a sanitized 503, does not cache failure, and recovers", async () => {
  mocks.inventory.mockRejectedValueOnce(new Error("private host and SQL"));
  const failed = await GET(request());
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({
    scope: "public",
    error: "Status temporarily unavailable",
  });
  mocks.inventory.mockResolvedValueOnce(inventory);
  expect((await GET(request())).status).toBe(200);
  expect(mocks.inventory).toHaveBeenCalledTimes(2);
});
