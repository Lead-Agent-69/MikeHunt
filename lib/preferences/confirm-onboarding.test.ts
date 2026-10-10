import { describe, expect, it } from "vitest";
import { confirmOnboardingSave } from "./confirm-onboarding";

describe("onboarding save confirmation", () => {
  for (const buyerMode of ["personal", "diy", "parts", "reseller", "dealer"]) {
    it(`confirms the persisted ${buyerMode} scope`, () => {
      const patch = {
        buyerScope: {
          buyerMode,
          state: "TX",
          vehicles: ["Trucks"],
          maxPrice: 0,
        },
      };
      expect(() =>
        confirmOnboardingSave(
          { authed: true, prefs: { ...patch, workspaceAccess: "community" } },
          "preferences",
          patch,
          true,
        ),
      ).not.toThrow();
    });
  }
  it("rejects guest-only saves in a configured app", () => {
    expect(() =>
      confirmOnboardingSave(
        { authed: false, local: true, profile: { onboarded: true } },
        "profile",
        { onboarded: true },
        true,
      ),
    ).toThrow("session has expired");
  });
  it("allows explicitly local demo onboarding", () => {
    expect(() =>
      confirmOnboardingSave(
        { authed: false, local: true, profile: { onboarded: true } },
        "profile",
        { onboarded: true },
        false,
      ),
    ).not.toThrow();
  });
  it("rejects missing, mismatched and partial scope data", () => {
    for (const prefs of [
      undefined,
      {},
      { buyerScope: { buyerMode: "dealer" } },
      { buyerScope: { buyerMode: "personal", vehicles: ["SUVs"] } },
    ]) {
      expect(() =>
        confirmOnboardingSave(
          { prefs },
          "preferences",
          { buyerScope: { buyerMode: "personal", vehicles: ["Trucks"] } },
          true,
        ),
      ).toThrow("could not be confirmed");
    }
  });
  it("requires the profile identity and completion flag", () => {
    for (const profile of [
      { onboarded: true },
      { id: "owner", onboarded: false },
    ]) {
      expect(() =>
        confirmOnboardingSave(
          { profile },
          "profile",
          { onboarded: true },
          true,
        ),
      ).toThrow();
    }
    expect(() =>
      confirmOnboardingSave(
        { profile: { id: "owner", onboarded: true } },
        "profile",
        { onboarded: true },
        true,
      ),
    ).not.toThrow();
  });
});
