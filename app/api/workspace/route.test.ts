import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  readError: false,
  writeError: false,
  mismatch: false,
  written: null as any,
  from: vi.fn(),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: mocks.user } }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from: mocks.from }),
}));
import { PUT } from "./route";
const req = (body: object) =>
  new NextRequest("http://localhost/api/workspace", {
    method: "PUT",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  mocks.user = { id: "owner" };
  mocks.readError = false;
  mocks.writeError = false;
  mocks.mismatch = false;
  mocks.written = null;
  mocks.from.mockReset().mockImplementation(() => ({
    select: () => ({
      eq: (_key: string, id: string) => {
        expect(id).toBe("owner");
        return {
          maybeSingle: async () => ({
            data: {
              prefs: { buyerScope: { buyerMode: "personal" }, carsState: "TX" },
            },
            error: mocks.readError ? {} : null,
          }),
        };
      },
    }),
    upsert: (row: any) => {
      mocks.written = row;
      return {
        select: () => ({
          single: async () => ({
            data: { ...row, user_id: mocks.mismatch ? "other" : row.user_id },
            error: mocks.writeError ? {} : null,
          }),
        }),
      };
    },
  }));
});
describe("free workspace persistence", () => {
  it("requires authentication", async () => {
    mocks.user = null;
    expect((await PUT(req({ workspaceMode: "expanded" }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects unsupported modes", async () => {
    expect((await PUT(req({ workspaceMode: "admin" }))).status).toBe(400);
  });
  it("confirms only owner preferences, retaining buyer intent and ignoring privilege/payment input", async () => {
    const res = await PUT(
      req({
        workspaceMode: "expanded",
        user_id: "other",
        plan: "lifetime",
        admin: true,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).prefs.workspaceAccess).toBe("community");
    expect(mocks.written.user_id).toBe("owner");
    expect(mocks.written.prefs.buyerScope.buyerMode).toBe("personal");
    expect(mocks.written.prefs.admin).toBeUndefined();
    expect(
      mocks.from.mock.calls.every((c) => c[0] === "user_preferences"),
    ).toBe(true);
  });
  it("does not overwrite preferences after a failed read", async () => {
    mocks.readError = true;
    expect((await PUT(req({ workspaceMode: "expanded" }))).status).toBe(503);
    expect(mocks.written).toBeNull();
  });
  it("rejects failed or unconfirmed writes", async () => {
    mocks.writeError = true;
    expect((await PUT(req({ workspaceMode: "focused" }))).status).toBe(503);
    mocks.writeError = false;
    mocks.mismatch = true;
    expect((await PUT(req({ workspaceMode: "expanded" }))).status).toBe(503);
  });
});
