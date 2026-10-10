import { expect, it, vi } from "vitest";
import {
  getUserPlan,
  hasFullCustomerAccess,
  isPaid,
  meterDealView,
} from "./plan";
it("free community access is not a paid or admin plan", async () => {
  const from = vi.fn((table: string) => ({
    select: () => ({
      eq: (_k: string, id: string) => {
        expect(id).toBe("owner");
        return {
          maybeSingle: async () => ({
            data:
              table === "user_profiles"
                ? { plan: "free" }
                : { prefs: { workspaceAccess: "community" } },
          }),
        };
      },
    }),
  }));
  expect(await getUserPlan({ from } as any, "owner")).toBe("community");
  expect(isPaid("community")).toBe(false);
  expect(hasFullCustomerAccess("community")).toBe(true);
  expect(hasFullCustomerAccess("free")).toBe(true);
  expect(hasFullCustomerAccess("admin")).toBe(false);
});
it("legacy gating configuration never paywalls free customers", async () => {
  vi.stubEnv("GATING_ENABLED", "true");
  try {
    const insert = vi.fn(async () => {
      throw new Error("telemetry offline");
    });
    const from = vi.fn(() => ({ insert }));
    const result = await meterDealView(
      { from } as any,
      "owner",
      "deal",
      "free",
    );
    expect(result).toEqual({
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      plan: "free",
    });
    expect(from).toHaveBeenCalledWith("deal_views");
  } finally {
    vi.unstubAllEnvs();
  }
});
it("does not invent a paid plan when metering is disabled", async () => {
  vi.stubEnv("GATING_ENABLED", "true");
  const from = vi.fn(() => ({ insert: vi.fn(async () => ({})) }));
  const result = await meterDealView(
    { from } as any,
    "owner",
    "deal",
    "community",
  );
  expect(result).toEqual({
    allowed: true,
    remaining: Infinity,
    limit: Infinity,
    plan: "community",
  });
  vi.unstubAllEnvs();
});
