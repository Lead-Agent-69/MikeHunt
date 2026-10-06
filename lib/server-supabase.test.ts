// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined }),
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true }));

import { isSupabaseAuthCookieName } from "./server-supabase";

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
