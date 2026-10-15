import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  client: vi.fn(),
  inspect: vi.fn(),
  update: vi.fn(),
  filters: [] as unknown[][],
  write: { data: [{ id: "car" }], error: null } as any,
}));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: mocks.allowed,
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));
vi.mock("@/lib/images/photo-health", () => ({
  inspectListingPhotos: mocks.inspect,
}));
const row = {
  id: "12345678-1234-1234-1234-123456789abc",
  images: ["https://dealer.test/car.jpg"],
  options: { priceEvidence: { kind: "unknown" } },
  updated_at: "2026-10-14T00:00:00Z",
};
import { POST } from "./route";
const request = (body: unknown = {}) =>
  new Request("https://app.test/api/admin/photo-health", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = [];
  mocks.allowed.mockResolvedValue(true);
  mocks.write = { data: [{ id: row.id }], error: null };
  mocks.inspect.mockResolvedValue({
    state: "unavailable",
    checkedAt: "now",
    verifiedUrl: null,
    checks: [],
    images: row.images,
  });
  mocks.client.mockReturnValue({
    from: () => {
      const q: any = {};
      let writing = false;
      for (const name of [
        "select",
        "eq",
        "not",
        "neq",
        "is",
        "order",
        "limit",
        "in",
      ])
        q[name] = (...args: unknown[]) => {
          mocks.filters.push([name, ...args]);
          return q;
        };
      q.update = (value: unknown) => {
        writing = true;
        mocks.update(value);
        return q;
      };
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          writing ? mocks.write : { data: [row], error: null },
        ).then(resolve);
      return q;
    },
  });
});
it("rejects callers and malformed bodies before constructing a database client", async () => {
  mocks.allowed.mockResolvedValue(false);
  expect((await POST(request())).status).toBe(401);
  expect(mocks.client).not.toHaveBeenCalled();
  mocks.allowed.mockResolvedValue(true);
  for (const body of [
    null,
    [],
    { limit: 21 },
    { limit: 0 },
    { dryRun: "false" },
    { ids: ["not-an-id"] },
    { state: "Missouri" },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(mocks.client).not.toHaveBeenCalled();
});
it("previews by default without any writes", async () => {
  const response = await POST(request());
  expect(await response.json()).toMatchObject({
    dryRun: true,
    checked: 1,
    unavailable: 1,
    written: 0,
  });
  expect(mocks.update).not.toHaveBeenCalled();
});
it("retains original URLs and price evidence while quarantining with a concurrent-write guard", async () => {
  const response = await POST(request({ dryRun: false, ids: [row.id] }));
  expect(await response.json()).toMatchObject({ written: 1, partial: false });
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      updated_at: expect.any(String),
      images: row.images,
      options: expect.objectContaining({
        priceEvidence: row.options.priceEvidence,
        photoAudit: expect.objectContaining({
          state: "unavailable",
          originalImages: row.images,
        }),
      }),
    }),
  );
  expect(mocks.filters).toContainEqual(["eq", "updated_at", row.updated_at]);
});
it("does not mark transient failures missing or claim conflicting writes succeeded", async () => {
  mocks.inspect.mockResolvedValueOnce({ state: "unknown" });
  expect(await (await POST(request({ dryRun: false }))).json()).toMatchObject({
    unknown: 1,
    written: 0,
  });
  expect(mocks.update).not.toHaveBeenCalled();
  mocks.write = { data: [], error: null };
  const response = await POST(request({ dryRun: false }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    conflicts: 1,
    written: 0,
    partial: true,
  });
});
