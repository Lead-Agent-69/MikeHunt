import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/cache";

const canManage = vi.fn();
const buildRealDataReadiness = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: (...args: unknown[]) => canManage(...args),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createServerComponentClient: () => {
    throw new Error("not used when unconfigured");
  },
}));

vi.mock("@/lib/real-data-readiness", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/real-data-readiness")>();
  return {
    ...actual,
    buildRealDataReadiness: (
      input: Parameters<typeof actual.buildRealDataReadiness>[0],
    ) => {
      buildRealDataReadiness(input);
      return actual.buildRealDataReadiness(input);
    },
  };
});

import { GET, toPublicStatus } from "./route";

const request = () => new Request("http://localhost/api/system/status") as any;

describe("/api/system/status authz", () => {
  beforeEach(() => {
    invalidate("status:full:");
    canManage.mockReset();
    buildRealDataReadiness.mockClear();
  });

  it("returns only the public projection to non-admin callers", async () => {
    canManage.mockResolvedValue(false);
    const res = await GET(request());
    const body = await res.json();
    expect(body.scope).toBe("public");
    expect(body).not.toHaveProperty("sources");
    expect(body).not.toHaveProperty("recentRuns");
    expect(body).not.toHaveProperty("sourceBreakdown");
    expect(body).not.toHaveProperty("valuationAccuracy");
    expect(body).not.toHaveProperty("knowledgeBase");
    expect(body).not.toHaveProperty("learning");
    expect(JSON.stringify(body)).not.toContain("envStatus");
    expect(JSON.stringify(body)).not.toContain("diagnostics");
    expect(typeof body.activeDeals).toBe("number");
    expect(typeof body.sourceHealth.readySources).toBe("number");
    expect(body.authProviders).toHaveProperty("google");
  });

  it("returns the full payload to an admin", async () => {
    canManage.mockResolvedValue(true);
    const res = await GET(request());
    const body = await res.json();
    expect(body.scope).toBeUndefined();
    expect(body).toHaveProperty("sources");
    expect(body).toHaveProperty("recentRuns");
    expect(body).toHaveProperty("readiness.missingEnv");
  });

  it("authorizes every admin read while coalescing full diagnostics", async () => {
    canManage.mockResolvedValue(true);

    const first = GET(request());
    const second = GET(request());
    const responses = await Promise.all([first, second]);
    const third = await GET(request());

    expect(canManage).toHaveBeenCalledTimes(3);
    expect(buildRealDataReadiness).toHaveBeenCalledTimes(1);
    for (const response of [...responses, third]) {
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect((await response.json()).scope).toBeUndefined();
    }
  });

  it("returns only auth readiness without an admin lookup or inventory queries", async () => {
    const res = await GET(
      new Request("http://localhost/api/system/status?scope=auth") as any,
    );
    const body = await res.json();
    expect(body).toEqual({
      scope: "auth",
      authProviders: {
        reachable: false,
        google: null,
        email: null,
        checkedAt: expect.any(String),
      },
    });
    expect(canManage).not.toHaveBeenCalled();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });
});

describe("toPublicStatus", () => {
  it("keeps only sign-in/import readiness items and strips env detail", () => {
    const out = toPublicStatus({
      configured: true,
      activeDeals: 10,
      readiness: {
        ready: false,
        missingEnv: ["SUPABASE_SERVICE_ROLE_KEY"],
        items: [
          {
            id: "google-login",
            label: "Google",
            status: "ready",
            nextStep: "ok",
            envKeys: ["X"],
            envStatus: [{ key: "X", present: true }],
            diagnostics: [{ label: "a", value: "b" }],
          },
          { id: "ai", label: "AI", status: "missing", envKeys: ["Y"] },
        ],
      },
      sources: [{ source: "govdeals", error_message: "stack" }],
    });
    expect(out.readiness.items).toEqual([
      {
        id: "google-login",
        label: "Google",
        status: "ready",
        nextStep: "Google sign-in is available.",
        actionLabel: "Sign in",
      },
    ]);
    expect(out).not.toHaveProperty("sources");
    expect(JSON.stringify(out)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
