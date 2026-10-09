import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  authError: false,
  readError: false,
  writeError: false,
  mismatch: false,
  written: null as any,
  from: vi.fn(),
  kick: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: { id: "owner" } },
    error: mocks.authError ? new Error("unavailable") : null,
  }),
}));
vi.mock("@/lib/preferences/kick-location-demand", () => ({
  kickLocationDemand: mocks.kick,
  locationDemandPrefsStamp: () => ({}),
  locationPatchTouchesDemand: () => false,
}));
vi.mock("@/lib/preferences/sync-home-state", () => ({
  syncPrefsHomeLocationToProfile: vi.fn(),
}));
import { PUT } from "./route";
const req = () =>
  new NextRequest("http://localhost/api/preferences", {
    method: "PUT",
    body: JSON.stringify({ buyerScope: { buyerMode: "personal" } }),
  });
beforeEach(() => {
  Object.assign(mocks, {
    authError: false,
    readError: false,
    writeError: false,
    mismatch: false,
    written: null,
  });
  mocks.from.mockReset().mockImplementation((table: string) => {
    expect(table).toBe("user_preferences");
    return {
      select: () => ({
        eq: (_key: string, id: string) => {
          expect(id).toBe("owner");
          return {
            maybeSingle: async () => ({
              data: {
                prefs: {
                  workspaceMode: "expanded",
                  workspaceAccess: "community",
                },
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
    };
  });
});
describe("account preferences persistence", () => {
  it("does not replace preferences after failed reads", async () => {
    mocks.readError = true;
    expect((await PUT(req())).status).toBe(503);
    expect(mocks.written).toBeNull();
  });
  it("does not fall back to a guest cookie on authentication service failure", async () => {
    mocks.authError = true;
    const response = await PUT(req());
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("retains free upgrades and confirms the owner-scoped persisted result", async () => {
    const response = await PUT(req());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.authed).toBe(true);
    expect(body.prefs.workspaceAccess).toBe("community");
    expect(body.prefs.workspaceMode).toBe("expanded");
    expect(mocks.written.user_id).toBe("owner");
  });
  it("rejects failed or wrong-owner write results", async () => {
    mocks.writeError = true;
    expect((await PUT(req())).status).toBe(500);
    mocks.writeError = false;
    mocks.mismatch = true;
    expect((await PUT(req())).status).toBe(500);
  });
});
