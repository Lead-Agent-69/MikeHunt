import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/auth/scrape-gate", () => ({
  scrapeSecret: vi.fn(() => "test-secret"),
}));

const ORIGINAL_ENV = process.env;

describe("systemReadiness", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it("classifies provider dashboard and env blockers without exposing secrets", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      SCRAPE_SECRET: "scrape-secret",
      GOOGLE_OAUTH_VERIFIED: "",
      SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET: "",
      OPENAI_API_KEY: "",
      GOOGLE_GENERATIVE_AI_API_KEY: "",
    };
    const { systemReadiness } = await import("./system-readiness");

    const readiness = systemReadiness();
    const google = readiness.items.find((item) => item.id === "google-login");
    const ai = readiness.items.find((item) => item.id === "ai-provider");

    expect(google).toMatchObject({
      status: "partial",
      blockerType: "provider_dashboard",
    });
    expect(google?.envStatus).toEqual(
      expect.arrayContaining([
        { key: "NEXT_PUBLIC_APP_URL", present: true },
        { key: "GOOGLE_OAUTH_VERIFIED", present: false },
      ]),
    );
    expect(google?.diagnostics).toEqual(
      expect.arrayContaining([
        {
          label: "Google Cloud authorized redirect URI",
          value: "https://example.supabase.co/auth/v1/callback",
          help: expect.stringContaining("Google OAuth client"),
        },
        {
          label: "Supabase Site URL",
          value: "http://localhost:3000",
          help: expect.stringContaining("Supabase Auth URL Configuration"),
        },
        {
          label: "Supabase additional redirect URL",
          value: "http://localhost:3000/auth/callback",
          help: expect.stringContaining("PKCE"),
        },
      ]),
    );
    expect(JSON.stringify(google)).not.toContain("service-role-key");
    expect(ai).toMatchObject({
      status: "missing",
      blockerType: "env",
    });
    expect(ai?.userImpact).toContain("deterministic buy/pass math");
    expect(ai?.userImpact).toContain("provider AI is the upgrade");
    expect(ai?.envStatus).toEqual(
      expect.arrayContaining([
        { key: "OPENAI_API_KEY", present: false },
        { key: "GOOGLE_GENERATIVE_AI_API_KEY", present: false },
      ]),
    );
    expect(readiness.summary).toMatchObject({
      readyCount: 3,
      total: 5,
      envBlockers: 1,
      providerDashboardBlockers: 1,
      verificationBlockers: 0,
    });
    expect(readiness.summary.nextAction).toContain(
      "Enable Google provider in Supabase Auth",
    );
  });

  it("does not mark Google OAuth ready from local provider secrets alone", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET: "local-secret",
      GOOGLE_OAUTH_VERIFIED: "",
    };
    const { systemReadiness } = await import("./system-readiness");

    const readiness = systemReadiness();
    const google = readiness.items.find((item) => item.id === "google-login");

    expect(google).toMatchObject({
      status: "partial",
      blockerType: "provider_dashboard",
    });
    expect(readiness.missingEnv).toContain("GOOGLE_OAUTH_VERIFIED");
    expect(readiness.missingEnv).not.toContain(
      "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET",
    );
  });

  it("marks Google OAuth ready only after the redirect flow is verified", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      GOOGLE_OAUTH_VERIFIED: "true",
    };
    const { systemReadiness } = await import("./system-readiness");

    const readiness = systemReadiness();
    const google = readiness.items.find((item) => item.id === "google-login");

    expect(google).toMatchObject({
      status: "ready",
      blockerType: "verification",
    });
  });
});
