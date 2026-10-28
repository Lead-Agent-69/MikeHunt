import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  authError: false,
  readError: false,
  writeError: false,
  mismatch: false,
  written: null as any,
  from: vi.fn(),
  rpc: vi.fn(),
  touches: false,
  kick: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: { id: "owner" } },
    error: mocks.authError ? new Error("unavailable") : null,
  }),
}));
vi.mock("@/lib/preferences/kick-location-demand", () => ({
  kickLocationDemand: mocks.kick,
  locationDemandPrefsStamp: (kick: any) => ({
    locationDemandAt: kick.queued ? kick.demandedAt : null,
    locationDemandStates: kick.states,
  }),
  demandStatesFromPrefs: (prefs: any) =>
    prefs.homeLocation?.state ? [prefs.homeLocation.state] : [],
  locationPatchTouchesDemand: () => mocks.touches,
}));
vi.mock("@/lib/preferences/sync-home-state", () => ({
  syncPrefsHomeLocationToProfile: vi.fn(),
}));
import { PUT } from "./route";
const req = (body = { buyerScope: { buyerMode: "personal" } } as object) =>
  new NextRequest("http://localhost/api/preferences", {
    method: "PUT",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  Object.assign(mocks, {
    authError: false,
    readError: false,
    writeError: false,
    mismatch: false,
    written: null,
    touches: false,
  });
  mocks.kick.mockReset().mockResolvedValue(null);
  mocks.from.mockReset().mockImplementation((table: string) => {
    expect(table).toBe("user_preferences");
    return {
      select: () => ({
        eq: (_key: string, id: string) => {
          expect(id).toBe("owner");
          return {
            abortSignal: () => ({
              maybeSingle: async () => ({
                data: {
                  user_id: "owner",
                  prefs: {
                    workspaceMode: "expanded",
                    workspaceAccess: "community",
                  },
                },
                error: mocks.readError ? {} : null,
              }),
            }),
          };
        },
      }),
    };
  });
  mocks.rpc.mockReset().mockImplementation((name: string, input: any) => {
    expect(name).toBe("compare_and_set_user_preferences");
    expect(input.p_user_id).toBe("owner");
    return {
      abortSignal: async () => {
        mocks.written = { user_id: input.p_user_id, prefs: input.p_next_prefs };
        return {
          data: [
            { ...mocks.written, user_id: mocks.mismatch ? "other" : "owner" },
          ],
          error: mocks.writeError ? {} : null,
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

it("does not queue collection after a failed preference write", async () => {
  mocks.touches = true;
  mocks.writeError = true;
  expect((await PUT(req({ homeLocation: { state: "MO" } }))).status).toBe(500);
  expect(mocks.kick).not.toHaveBeenCalled();
});
it("queues only after confirmed persistence, then stamps conditionally", async () => {
  mocks.touches = true;
  mocks.kick.mockImplementation(async () => {
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.written.prefs.homeLocation.state).toBe("MO");
    expect(mocks.written.prefs.locationDemandAt).toBeNull();
    return {
      states: ["MO"],
      queued: true,
      deduplicated: false,
      jobId: "job",
      sourceIds: [],
      demandedAt: "2026-10-28T00:00:00Z",
    };
  });
  const response = await PUT(req({ homeLocation: { state: "MO" } }));
  expect(response.status).toBe(200);
  expect((await response.json()).locationDemand.queued).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});
it("keeps saved settings and clears warming when queueing fails", async () => {
  mocks.touches = true;
  mocks.kick.mockRejectedValue(new Error("offline"));
  const response = await PUT(req({ homeLocation: { state: "MO" } }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.prefs.homeLocation.state).toBe("MO");
  expect(body.prefs.locationDemandAt).toBeNull();
  expect(body.locationDemand).toBeUndefined();
});
