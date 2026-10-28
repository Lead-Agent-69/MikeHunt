// @vitest-environment node
import { AuthSessionMissingError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  cookies: [] as { name: string; value: string }[],
  error: null as unknown,
  admin: vi.fn(),
  queue: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => state.cookies,
    get: (name: string) => state.cookies.find((c) => c.name === name),
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: state.error }),
    },
  }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: state.admin,
}));
vi.mock("@/lib/preferences/confirmed-location-demand", () => ({
  clearLocationDemand: vi.fn(),
  queueConfirmedLocationDemand: state.queue,
}));
vi.mock("@/lib/preferences/sync-home-state", () => ({
  syncPrefsHomeLocationToProfile: vi.fn(),
}));
import { GET, PUT } from "./route";
const request = (body?: unknown, required = false) =>
  new NextRequest("https://app.test/api/preferences", {
    method: body === undefined ? "GET" : "PUT",
    headers: {
      cookie: state.cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      "content-type": "application/json",
      ...(required ? { "x-require-account": "true" } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  state.cookies = [
    {
      name: "mh_guest_prefs",
      value: Buffer.from(
        JSON.stringify({
          theme: "dark",
          buyerScope: { buyerMode: "personal" },
        }),
      ).toString("base64url"),
    },
  ];
  state.error = new AuthSessionMissingError();
  state.admin.mockReset().mockImplementation(() => {
    throw new Error("Guest must not access account storage");
  });
  state.queue.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it("returns supported local preferences for a real SDK signed-out session", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    authed: false,
    local: true,
    prefs: { theme: "dark", buyerScope: { buyerMode: "personal" } },
  });
  expect(state.admin).not.toHaveBeenCalled();
});
it("merges a guest patch without losing unrelated local choices or starting collection", async () => {
  const response = await PUT(request({ homeLocation: { state: "MO" } }));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({
    authed: false,
    local: true,
    prefs: {
      theme: "dark",
      buyerScope: { buyerMode: "personal" },
      homeLocation: { state: "MO" },
    },
    locationDemand: { requiresAuth: true, states: [] },
  });
  expect(response.headers.get("set-cookie")).toContain("mh_guest_prefs=");
  expect(state.admin).not.toHaveBeenCalled();
  expect(state.queue).not.toHaveBeenCalled();
});
it("cannot silently downgrade an account-required save to a guest cookie", async () => {
  const response = await PUT(request({ theme: "light" }, true));
  expect(response.status).toBe(401);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(state.admin).not.toHaveBeenCalled();
});
it("keeps expired account cookies out of the guest fallback", async () => {
  state.cookies.push({ name: "sb-project-auth-token.0", value: "expired" });
  const read = await GET(request());
  const write = await PUT(request({ theme: "light" }));
  expect(read.status).toBe(401);
  expect(write.status).toBe(401);
  expect(write.headers.get("set-cookie")).toBeNull();
  expect(state.admin).not.toHaveBeenCalled();
  expect(state.queue).not.toHaveBeenCalled();
});
it("does not treat a genuine provider outage as a successful local save", async () => {
  state.error = new Error("network unavailable");
  const response = await PUT(request({ theme: "light" }));
  expect(response.status).toBe(503);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(state.admin).not.toHaveBeenCalled();
});
