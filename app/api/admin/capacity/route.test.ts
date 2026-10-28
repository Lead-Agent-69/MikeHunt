import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const validCapacity = () => ({
  checkedAt: "2026-10-28T18:00:00Z",
  databaseBytes: 377000000,
  inventory: { total: 10, active: 8, unseen30Days: 0, unseen7Days: 4 },
  relations: [],
  archive: {
    policyDays: 30,
    actionsEnabled: false,
    eligibilityAssessed: false,
  },
});
const mocks = vi.hoisted(() => ({
  authorized: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
  abort: vi.fn(),
}));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: mocks.authorized,
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: mocks.client,
}));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue(true);
  mocks.client.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abort });
  mocks.abort.mockResolvedValue({ data: validCapacity(), error: null });
});
const request = () => new NextRequest("https://example.com/api/admin/capacity");
it("denies unauthorized requests before creating any privileged client", async () => {
  mocks.authorized.mockResolvedValue(false);
  expect((await GET(request())).status).toBe(401);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("returns a non-cacheable, read-only assessment for an operator", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect((await response.json()).archive.actionsEnabled).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
    "inventory_capacity_report",
  );
  expect(mocks.abort).toHaveBeenCalledWith(expect.any(AbortSignal));
});
it.each(["error", "malformed", "throw"])(
  "does not leak or manufacture capacity after %s",
  async (mode) => {
    if (mode === "throw")
      mocks.abort.mockRejectedValue(new Error("private diagnostic"));
    else
      mocks.abort.mockResolvedValue({
        data: mode === "malformed" ? {} : null,
        error: mode === "error" ? { message: "private diagnostic" } : null,
      });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private diagnostic");
  },
);
