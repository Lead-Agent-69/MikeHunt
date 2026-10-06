import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  onboardingHomeState,
  onboardingLocationPatch,
} from "./onboarding-location";
import { sanitizeLocationPatch } from "./locations";

describe("onboardingHomeState", () => {
  it("prefers explicit homeLocation, then saved intent state, then legacy", () => {
    expect(
      onboardingHomeState({ homeLocation: { state: "IL" } }, "Nationwide"),
    ).toBe("IL");
    expect(onboardingHomeState({ carsState: "MO" }, "TX")).toBe("TX");
    expect(onboardingHomeState({ carsState: "MO" })).toBe("MO");
    expect(onboardingHomeState(null)).toBe("");
  });
});

describe("onboardingLocationPatch", () => {
  it("writes homeLocation and legacy mirrors, keeping search markets", () => {
    const patch = onboardingLocationPatch("TX", {
      searchLocations: [
        { id: "OK|", state: "OK", addedAt: "2026-10-01T00:00:00.000Z" },
      ],
    });
    expect(patch).toEqual({
      homeLocation: { state: "TX" },
      carsState: "TX",
      carsStates: ["TX", "OK"],
    });
    expect("searchLocations" in patch).toBe(false);
    expect("patch" in sanitizeLocationPatch(patch)).toBe(true);
  });

  it("keeps city / ZIP / radius when the home state is unchanged", () => {
    expect(
      onboardingLocationPatch("TX", {
        homeLocation: {
          state: "TX",
          city: "Austin",
          zip: "78701",
          radiusMi: 100,
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
      }).homeLocation,
    ).toEqual({ state: "TX", city: "Austin", zip: "78701", radiusMi: 100 });
    expect(
      onboardingLocationPatch("MO", {
        homeLocation: { state: "TX", zip: "78701" },
      }).homeLocation,
    ).toEqual({ state: "MO" });
  });

  it("carries legacy carsStates (minus the old home) into the mirror", () => {
    expect(
      onboardingLocationPatch("TX", {
        carsState: "MO",
        carsStates: ["MO", "KS"],
      }).carsStates,
    ).toEqual(["TX", "KS"]);
  });

  it("leaves location prefs alone for Nationwide or blank", () => {
    expect(onboardingLocationPatch("Nationwide", {})).toEqual({});
    expect(onboardingLocationPatch("", {})).toEqual({});
  });

  it("is what the onboarding page sends", () => {
    const page = readFileSync("app/onboarding/page.tsx", "utf8");
    expect(page).toContain("...onboardingLocationPatch(state, savedPrefs)");
    expect(page).not.toContain("carsStates: [state]");
    expect(page).toContain("onboardingHomeState(prefs, saved?.state)");
  });
});
