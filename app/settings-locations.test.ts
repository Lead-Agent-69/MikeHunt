import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = readFileSync("app/(dashboard)/settings/page.tsx", "utf8");
const prefsUi = readFileSync("components/settings/LocationPrefs.tsx", "utf8");

describe("Settings home vs search locations", () => {
  it("renders the split location prefs instead of the single default-market select", () => {
    expect(settings).toContain("<LocationPrefs />");
    expect(settings).not.toContain("Default market (state you open to)");
    expect(settings).not.toContain("set({ carsState: e.target.value })");
  });

  it("reads through Amy's effective* fallbacks and writes via shared patches", () => {
    expect(prefsUi).toContain("effectiveHome(prefs)");
    expect(prefsUi).toContain("effectiveSearchLocations(prefs)");
    expect(prefsUi).toContain("homeLocationPatch(");
    expect(prefsUi).toContain("searchLocationsPatch(");
    expect(prefsUi).toContain("Home location");
    expect(prefsUi).toContain("Search locations");
  });
});
