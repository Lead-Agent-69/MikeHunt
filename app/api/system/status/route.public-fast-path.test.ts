import { beforeEach, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/cache";
const mocks = vi.hoisted(() => ({ inventory: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: async () => false,
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
const req = () => new Request("http://localhost/api/system/status") as any;
beforeEach(() => {
  invalidate();
  vi.clearAllMocks();
  mocks.client.mockReturnValue({});
});
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
  expect(JSON.stringify(await res.json())).not.toContain("SQL");
  mocks.inventory.mockResolvedValueOnce({ activeDeals: 2 });
  expect((await GET(req())).status).toBe(200);
});
