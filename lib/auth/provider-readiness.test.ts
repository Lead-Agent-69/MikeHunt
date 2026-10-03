import { afterEach, describe, expect, it, vi } from "vitest";
import type { SystemReadinessResult } from "@/lib/system-readiness";
import {
  applyAuthProviderReadiness,
  readAuthProviderReadiness,
} from "./provider-readiness";

const ORIGINAL_ENV = process.env;

function readiness(): SystemReadinessResult {
  return {
    ready: false,
    items: [
      {
        id: "google-login",
        label: "Google login",
        status: "partial",
        blockerType: "provider_dashboard",
        detail: "Pending",
        nextStep: "Configure provider",
        envKeys: ["NEXT_PUBLIC_APP_URL", "GOOGLE_OAUTH_VERIFIED"],
        envStatus: [
          { key: "NEXT_PUBLIC_APP_URL", present: true },
          { key: "GOOGLE_OAUTH_VERIFIED", present: false },
        ],
        unlocks: "Accounts",
        userImpact: "No Google login",
        verifyPath: "/login",
        actionLabel: "Configure",
      },
      {
        id: "ai-provider",
        label: "AI provider",
        status: "missing",
        blockerType: "env",
        detail: "Missing",
        nextStep: "Set OPENAI_API_KEY",
        envKeys: ["OPENAI_API_KEY"],
        envStatus: [{ key: "OPENAI_API_KEY", present: false }],
        unlocks: "AI",
        userImpact: "Fallback only",
        verifyPath: "/api/market/analyst",
        actionLabel: "Connect AI",
      },
    ],
    missingEnv: ["GOOGLE_OAUTH_VERIFIED", "OPENAI_API_KEY"],
    summary: {
      readyCount: 0,
      total: 2,
      envBlockers: 1,
      providerDashboardBlockers: 1,
      verificationBlockers: 0,
      nextAction: "Configure provider",
    },
  };
}

describe("auth provider readiness", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("reads the public Supabase Auth provider settings without exposing keys", async () => {
    process.env = {
      ...ORIGINAL_ENV,
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
    };
    const fetchImpl = vi.fn(async (_url, init) => {
      expect(init?.headers).toMatchObject({ apikey: "public-key" });
      return new Response(
        JSON.stringify({ external: { google: true, email: true } }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await readAuthProviderReadiness(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/settings",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(result).toMatchObject({
      reachable: true,
      google: true,
      email: true,
      source: "supabase-auth-settings",
    });
    expect(JSON.stringify(result)).not.toContain("public-key");
  });

  it("uses live provider state and removes the obsolete verification env blocker", () => {
    const result = applyAuthProviderReadiness(readiness(), {
      reachable: true,
      google: true,
      email: true,
      checkedAt: new Date().toISOString(),
      source: "supabase-auth-settings",
    });

    expect(result.items[0]).toMatchObject({
      status: "ready",
      blockerType: "none",
      actionLabel: "Test Google login",
    });
    expect(result.missingEnv).toEqual(["OPENAI_API_KEY"]);
    expect(result.summary).toMatchObject({
      readyCount: 1,
      providerDashboardBlockers: 0,
      envBlockers: 1,
    });
  });

  it("keeps the conservative static result when Supabase Auth is unreachable", () => {
    const original = readiness();
    const result = applyAuthProviderReadiness(original, {
      reachable: false,
      google: null,
      email: null,
      checkedAt: new Date().toISOString(),
      source: "supabase-auth-settings",
      error: "unreachable",
    });

    expect(result).toBe(original);
  });
});
