import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createServerComponentClient: () => {
    throw new Error("not used");
  },
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: null } }),
}));

import { PUT } from "./route";

const put = (body: string) =>
  new NextRequest("http://localhost/api/preferences", {
    method: "PUT",
    body,
    headers: { "content-type": "application/json" },
  });

describe("PUT /api/preferences", () => {
  it("persists a watched dealer list for guests in the prefs cookie", async () => {
    const res = await PUT(
      put(JSON.stringify({ watchedDealerHosts: ["a.com", "a.com"] })),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefs.watchedDealerHosts).toEqual(["a.com"]);
    expect(res.headers.get("set-cookie")).toContain("mh_guest_prefs=");
  });

  it("rejects a non-array watch list", async () => {
    const res = await PUT(put(JSON.stringify({ watchedDealerHosts: "a.com" })));
    expect(res.status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    const res = await PUT(put(JSON.stringify({ blob: "x".repeat(40_000) })));
    expect(res.status).toBe(413);
  });
});

it("tells guests that location demand needs sign-in", async () => {
  const res = await PUT(put(JSON.stringify({ homeLocation: { state: "MO" } })));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.locationDemand).toEqual({
    requiresAuth: true,
    states: [],
  });
  expect(body.prefs.homeLocation.state).toBe("MO");
});
