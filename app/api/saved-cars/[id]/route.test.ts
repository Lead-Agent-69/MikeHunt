import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  missing: false,
  mismatch: false,
  from: vi.fn(),
  updates: null as any,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: mocks.user } }),
}));
import { DELETE, PUT } from "./route";
const params = { params: Promise.resolve({ id: "save" }) };
const req = (body?: object) =>
  new NextRequest("http://localhost/api/saved-cars/save", {
    method: body ? "PUT" : "DELETE",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
beforeEach(() => {
  Object.assign(mocks, {
    user: { id: "owner" },
    missing: false,
    mismatch: false,
    updates: null,
  });
  mocks.from.mockReset().mockImplementation((table: string) => {
    expect(table).toBe("saved_cars");
    function chain(mode: "delete" | "update") {
      return {
        eq: (key: string, value: string) => {
          expect(value).toBe(key === "id" ? "save" : "owner");
          return chain(mode);
        },
        select: () =>
          mode === "delete"
            ? Promise.resolve({
                data: mocks.missing
                  ? []
                  : [
                      {
                        id: "save",
                        user_id: mocks.mismatch ? "other" : "owner",
                      },
                    ],
                error: null,
              })
            : {
                single: async () => ({
                  data: mocks.missing
                    ? null
                    : {
                        id: "save",
                        user_id: mocks.mismatch ? "other" : "owner",
                        ...mocks.updates,
                      },
                  error: null,
                }),
              },
      };
    }
    return {
      delete: () => chain("delete"),
      update: (updates: object) => {
        mocks.updates = updates;
        return chain("update");
      },
    };
  });
});
describe("saved vehicle mutations", () => {
  it("requires sign-in for deletion", async () => {
    mocks.user = null;
    expect((await DELETE(req(), params)).status).toBe(401);
  });
  it("confirms exactly one owner-scoped deleted row", async () => {
    expect(await (await DELETE(req(), params)).json()).toEqual({
      success: true,
      id: "save",
    });
  });
  it("does not report a nonexistent or wrong-owner deletion as success", async () => {
    mocks.missing = true;
    expect((await DELETE(req(), params)).status).toBe(404);
    mocks.missing = false;
    mocks.mismatch = true;
    expect((await DELETE(req(), params)).status).toBe(404);
  });
  it("validates statuses, notes and tags", async () => {
    for (const body of [
      { status: "sold" },
      { notes: {} },
      { tags: [42] },
      {},
    ]) {
      expect((await PUT(req(body), params)).status).toBe(400);
    }
    expect(mocks.updates).toBeNull();
  });
  it("returns only a confirmed owner-scoped update", async () => {
    expect(
      (await (await PUT(req({ status: "acquired" }), params)).json()).status,
    ).toBe("acquired");
    mocks.missing = true;
    expect((await PUT(req({ status: "active" }), params)).status).toBe(404);
  });
});
