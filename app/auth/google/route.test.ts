import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  configured: true,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: any) => ({
    auth: {
      signInWithOAuth: async (input: unknown) => {
        options.cookies.setAll([
          {
            name: "sb-test-code-verifier",
            value: "verifier",
            options: { httpOnly: true, sameSite: "lax", path: "/" },
          },
        ]);
        return mocks.signInWithOAuth(input);
      },
    },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.configured,
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.signInWithOAuth.mockResolvedValue({
    data: { url: "https://accounts.google.com/o/oauth2/v2/auth?state=test" },
    error: null,
  });
});

describe("Google OAuth start", () => {
  it("redirects through Google and returns the PKCE verifier cookie", async () => {
    const response = await GET(
      new NextRequest("http://localhost/auth/google?next=/deal/123"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("accounts.google.com");
    expect(response.cookies.get("sb-test-code-verifier")?.value).toBe(
      "verifier",
    );
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: expect.objectContaining({
        redirectTo: "http://localhost/auth/callback?next=%2Fdeal%2F123",
        skipBrowserRedirect: true,
      }),
    });
  });

  it("rejects an external post-login destination", async () => {
    await GET(
      new NextRequest(
        "http://localhost/auth/google?next=https://attacker.example/steal",
      ),
    );
    expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: "http://localhost/auth/callback?next=%2Fmarket",
        }),
      }),
    );
  });

  it("uses the public forwarded origin in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      await GET(
        new NextRequest("http://internal/auth/google?next=/market", {
          headers: {
            "x-forwarded-host": "dealerhunt.example",
            "x-forwarded-proto": "https",
          },
        }),
      );
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            redirectTo:
              "https://dealerhunt.example/auth/callback?next=%2Fmarket",
          }),
        }),
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns to a recoverable login state when OAuth cannot start", async () => {
    mocks.signInWithOAuth.mockResolvedValueOnce({
      data: { url: null },
      error: { message: "provider failure" },
    });
    const response = await GET(new NextRequest("http://localhost/auth/google"));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=oauth_start",
    );
  });
});
