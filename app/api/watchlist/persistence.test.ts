import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const dealId = "00000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  readError: false,
  existing: false,
  mismatch: false,
  inserted: null as any,
  from: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: { id: "owner" } } }),
}));
import { POST } from "./route";
const req = (id = dealId) =>
  new NextRequest("http://localhost/api/watchlist", {
    method: "POST",
    body: JSON.stringify({ deal_id: id, user_id: "other" }),
  });
beforeEach(() => {
  Object.assign(mocks, {
    readError: false,
    existing: false,
    mismatch: false,
    inserted: null,
  });
  mocks.from.mockReset().mockImplementation(() => {
    const read = {
      eq: (key: string, value: string) => {
        expect(value).toBe(key === "user_id" ? "owner" : dealId);
        return read;
      },
      maybeSingle: async () => ({
        data: mocks.existing ? { id: "watch" } : null,
        error: mocks.readError ? {} : null,
      }),
    };
    return {
      select: () => read,
      insert: (row: object) => {
        mocks.inserted = row;
        return {
          select: () => ({
            single: async () => ({
              data: {
                id: "watch",
                ...row,
                user_id: mocks.mismatch ? "other" : "owner",
              },
              error: null,
            }),
          }),
        };
      },
    };
  });
});
describe("watchlist persistence", () => {
  it("ignores caller identity and confirms the saved account row", async () => {
    const response = await POST(req());
    expect(response.status).toBe(200);
    expect((await response.json()).user_id).toBe("owner");
    expect(mocks.inserted.user_id).toBe("owner");
  });
  it("returns the existing entry identity without another insert", async () => {
    mocks.existing = true;
    const response = await POST(req());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      id: "watch",
      deal_id: dealId,
    });
    expect(mocks.inserted).toBeNull();
  });
  it("does not insert after a failed read", async () => {
    mocks.readError = true;
    expect((await POST(req())).status).toBe(503);
    expect(mocks.inserted).toBeNull();
  });
  it("rejects a wrong-owner result and malformed input", async () => {
    mocks.mismatch = true;
    expect((await POST(req())).status).toBe(503);
    expect((await POST(req("not-a-uuid"))).status).toBe(400);
  });
});
