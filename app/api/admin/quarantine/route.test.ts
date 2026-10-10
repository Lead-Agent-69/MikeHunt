import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ authorized: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: mocks.authorized,
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: mocks.client,
}));
import { GET, PATCH } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
});
it("does not read or mutate quarantine before authorization", async () => {
  mocks.authorized.mockResolvedValue(false);
  const req = new NextRequest("http://localhost/api/admin/quarantine");
  expect((await GET(req)).status).toBe(401);
  expect((await PATCH(req)).status).toBe(401);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("requires a bounded review with an expected previous status", async () => {
  mocks.authorized.mockResolvedValue(true);
  const req = new NextRequest("http://localhost/api/admin/quarantine", {
    method: "PATCH",
    body: JSON.stringify({ id: "1", status: "dismissed" }),
  });
  expect((await PATCH(req)).status).toBe(400);
  expect(mocks.client).not.toHaveBeenCalled();
});
