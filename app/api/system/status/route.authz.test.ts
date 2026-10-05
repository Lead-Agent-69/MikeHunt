import { beforeEach, describe, expect, it, vi } from "vitest";

const canManage = vi.fn();

vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: (...args: unknown[]) => canManage(...args),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createServerComponentClient: () => {
    throw new Error("not used when unconfigured");
  },
}));

import { GET, toPublicStatus } from "./route";

const request = () => new Request("http://localhost/api/system/status") as any;

describe("/api/system/status authz", () => {
  beforeEach(() => canManage.mockReset());

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
        nextStep: "ok",
        actionLabel: undefined,
        userImpact: undefined,
      },
    ]);
    expect(out).not.toHaveProperty("sources");
    expect(JSON.stringify(out)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
