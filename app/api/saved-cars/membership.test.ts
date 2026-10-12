import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  owner: "one" as string | null,
  configured: true,
  error: null as unknown,
  found: true,
}));
const eq = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const limit = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.configured,
  createServerComponentClient: () => ({ from }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: state.owner ? { id: state.owner } : null },
  }),
}));
vi.mock("@/lib/reco/signals", () => ({ recordDealSignal: vi.fn() }));
import { GET } from "./route";

const dealId = "e00f1198-4775-4223-9f28-f14f5835e42c";
const req = (owner = "one", deal = dealId) =>
  new NextRequest(
    `http://localhost/api/saved-cars?view=membership&dealId=${deal}`,
    { headers: { "X-Save-Owner": owner } },
  );
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    owner: "one",
    configured: true,
    error: null,
    found: true,
  });
  const query = { select, eq, limit };
  from.mockReturnValue(query);
  select.mockReturnValue(query);
  eq.mockReturnValue(query);
  limit.mockImplementation(async () => ({
    data: state.found ? [{ id: "old-save" }] : [],
    error: state.error,
  }));
});

describe("exact owned saved membership", () => {
  it("queries the vehicle before the limit so saves beyond the newest 500 remain recognized", async () => {
    const response = await GET(req());
    expect(await response.json()).toEqual({
      ownerId: "one",
      dealId,
      savedId: "old-save",
    });
    expect(select).toHaveBeenCalledWith("id");
    expect(eq.mock.calls).toEqual([
      ["user_id", "one"],
      ["deal_id", dealId],
    ]);
    expect(limit).toHaveBeenCalledWith(1);
    expect(eq.mock.invocationCallOrder[1]).toBeLessThan(
      limit.mock.invocationCallOrder[0],
    );
  });
  it("returns an owned empty receipt rather than a different account's save", async () => {
    state.found = false;
    expect(await (await GET(req())).json()).toEqual({
      ownerId: "one",
      dealId,
      savedId: null,
    });
  });
  it("rejects a changed session before querying", async () => {
    expect((await GET(req("previous"))).status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });
  it("does not authorize a caller-provided owner without a verified session", async () => {
    state.owner = null;
    expect((await GET(req())).status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
  it("rejects invalid vehicle IDs before querying", async () => {
    expect((await GET(req("one", "not-a-vehicle"))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
  });
  it("does not claim unsaved when the database is unavailable", async () => {
    state.configured = false;
    expect((await GET(req())).status).toBe(503);
    expect(from).not.toHaveBeenCalled();
  });
  it("does not turn a failed lookup into an empty receipt", async () => {
    state.error = { message: "lookup failed" };
    const response = await GET(req());
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty("savedId");
  });
});
