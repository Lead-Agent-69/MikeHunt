// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthSessionMissingError } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  configured: true,
  cookie: "",
  getUser: vi.fn(),
  authCookies: [] as { name: string; value: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => mocks.authCookies,
    get: () => (mocks.cookie ? { value: mocks.cookie } : undefined),
  }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.configured,
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

import {
  getServerUser,
  hasAuthSessionCookie,
  isSupabaseAuthCookieName,
} from "./server-supabase";

beforeEach(() => {
  mocks.configured = true;
  mocks.authCookies = [];
  mocks.cookie = Buffer.from(
    JSON.stringify({ id: "demo-preview", email: "admin@example.test" }),
  ).toString("base64url");
  mocks.getUser.mockReset().mockResolvedValue({
    data: { user: { id: "verified-user", email: "buyer@example.test" } },
    error: null,
  });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("production identity boundary", () => {
  it("never authenticates a demo cookie under missing production configuration", async () => {
    mocks.configured = false;
    vi.stubEnv("NODE_ENV", "production");
    expect((await getServerUser()).data.user).toBeNull();
    expect(await hasAuthSessionCookie()).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("retains local development demo mode", async () => {
    mocks.configured = false;
    vi.stubEnv("NODE_ENV", "development");
    expect((await getServerUser()).data.user?.id).toBe("demo-preview");
    expect(await hasAuthSessionCookie()).toBe(true);
  });
  it("uses verified provider identity rather than the supplied demo cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await getServerUser()).data.user?.id).toBe("verified-user");
    expect(mocks.getUser).toHaveBeenCalledOnce();
  });
  it("does not let local demo cookies impersonate real account IDs", async () => {
    mocks.configured = false;
    vi.stubEnv("NODE_ENV", "development");
    mocks.cookie = Buffer.from(
      JSON.stringify({
        id: "00000000-0000-0000-0000-000000000001",
        email: "buyer@example.test",
      }),
    ).toString("base64url");
    expect((await getServerUser()).data.user).toBeNull();
  });
  it("does not return a user when provider verification fails", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "unverified" } },
      error: new Error("verification failed"),
    });
    expect((await getServerUser()).data.user).toBeNull();
  });
  it("treats the real SDK missing-session result as an expected guest only without a session cookie", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthSessionMissingError(),
    });
    mocks.authCookies = [
      { name: "mh_guest_prefs", value: "local" },
      { name: "sb-project-auth-token-code-verifier", value: "verifier" },
    ];
    expect(await getServerUser()).toMatchObject({
      data: { user: null },
      error: null,
    });
  });
  it("preserves missing-session errors for an expired account cookie", async () => {
    const error = new AuthSessionMissingError();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    mocks.authCookies = [{ name: "sb-project-auth-token.0", value: "expired" }];
    expect((await getServerUser()).error).toBe(error);
  });
  it("preserves provider failures even without session cookies", async () => {
    const error = new Error("network unavailable");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    expect((await getServerUser()).error).toBe(error);
  });
});

describe("isSupabaseAuthCookieName", () => {
  it("matches Supabase SSR session cookies, including chunks", () => {
    expect(isSupabaseAuthCookieName("sb-abcd1234-auth-token")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-abcd1234-auth-token.0")).toBe(true);
    expect(isSupabaseAuthCookieName("sb-abcd1234-auth-token.12")).toBe(true);
  });

  it("ignores unrelated cookies", () => {
    expect(isSupabaseAuthCookieName("mh_guest_profile")).toBe(false);
    expect(isSupabaseAuthCookieName("sb-abcd-auth-token-code-verifier")).toBe(
      false,
    );
    expect(isSupabaseAuthCookieName("auth-token")).toBe(false);
  });
});
