import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/cache";
import { InventoryStatusReadError } from "@/lib/public-inventory-status";
const mocks = vi.hoisted(() => ({ inventory: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: async () => false,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: mocks.client,
}));
vi.mock("@/lib/public-inventory-status", async (original) => ({
  ...(await original<typeof import("@/lib/public-inventory-status")>()),
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
const req = () => new Request("http://localhost/api/system/status") as any;
beforeEach(() => {
  invalidate();
  vi.clearAllMocks();
  mocks.client.mockReturnValue({});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());
it("shares headline reads and never invokes the full inventory scan for public callers", async () => {
  mocks.inventory.mockResolvedValue({
    activeDeals: 12,
    buyerReady: true,
    decisionReady: false,
    sourceHealth: { readySources: null },
    coverage: "inventory_only",
  });
  const [a, b] = await Promise.all([GET(req()), GET(req())]);
  expect(a.status).toBe(200);
  expect(await a.json()).toEqual(await b.json());
  expect(mocks.inventory).toHaveBeenCalledTimes(1);
});
it("returns friendly non-cacheable failure and recovers on the next request", async () => {
  mocks.inventory.mockRejectedValueOnce(new Error("secret SQL diagnostics"));
  const res = await GET(req());
  expect(res.status).toBe(503);
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  expect(res.headers.get("Retry-After")).toBe("2");
  expect(JSON.stringify(await res.json())).not.toContain("SQL");
  expect(console.warn).toHaveBeenCalledWith(
    "[status/public] inventory check failed",
    { reason: "unexpected" },
  );
  expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain(
    "SQL",
  );
  mocks.inventory.mockResolvedValueOnce({ activeDeals: 2 });
  expect((await GET(req())).status).toBe(200);
});

it("recovers from one transient cold inventory read inside the request", async () => {
  mocks.inventory
    .mockRejectedValueOnce(
      new InventoryStatusReadError("fresh_photos", "deadline", 4001, null),
    )
    .mockResolvedValueOnce({
      activeDeals: 2,
      buyerReady: true,
      decisionReady: false,
    });
  const response = await GET(req());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    activeDeals: 2,
    buyerReady: true,
    decisionReady: false,
  });
  expect(mocks.inventory).toHaveBeenCalledTimes(2);
  expect(console.warn).not.toHaveBeenCalled();
});

it("retries a transient upstream database response once", async () => {
  mocks.inventory
    .mockRejectedValueOnce(
      new InventoryStatusReadError("active", "database", 80, 503),
    )
    .mockResolvedValueOnce({ activeDeals: 2, buyerReady: true });
  expect((await GET(req())).status).toBe(200);
  expect(mocks.inventory).toHaveBeenCalledTimes(2);
});

it("keeps repeated transient diagnostics server-only and never caches the failure", async () => {
  const failure = new InventoryStatusReadError(
    "fresh_photos",
    "deadline",
    4001,
    null,
  );
  mocks.inventory.mockRejectedValueOnce(failure).mockRejectedValueOnce(failure);
  const response = await GET(req());
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("2");
  expect(await response.json()).toEqual({
    error: "We couldn't check inventory status. Please try again shortly.",
  });
  expect(console.warn).toHaveBeenCalledWith(
    "[status/public] inventory check failed",
    {
      read: "fresh_photos",
      reason: "deadline",
      durationMs: 4001,
      httpStatus: null,
    },
  );
  mocks.inventory.mockResolvedValueOnce({
    activeDeals: 2,
    decisionReady: false,
  });
  expect((await GET(req())).status).toBe(200);
  expect(mocks.inventory).toHaveBeenCalledTimes(3);
});

it.each([
  new InventoryStatusReadError("active", "invalid_count", 10, 200),
  new InventoryStatusReadError("active", "database", 10, 400),
])("does not retry a non-transient inventory failure", async (failure) => {
  mocks.inventory.mockRejectedValueOnce(failure);
  expect((await GET(req())).status).toBe(503);
  expect(mocks.inventory).toHaveBeenCalledTimes(1);
});
