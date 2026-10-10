import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("location copy for buyers", () => {
  it("Settings: Home is where you live, extras are Search locations", () => {
    const prefs = read("components/settings/LocationPrefs.tsx");
    expect(prefs).toContain("The state you live in.");
    expect(prefs).toContain("Search locations");
    expect(prefs).not.toMatch(/near you|dealer (location|market|yard)/i);
    expect(prefs).not.toContain("home market");
    expect(prefs).not.toContain("Search market");
  });

  it("onboarding labels Home as where you live", () => {
    const onboarding = read("app/onboarding/page.tsx");
    expect(onboarding).toContain("Where you live.");
    expect(onboarding).not.toMatch(/near you|dealer location/i);
  });

  it("the nav chip describes its scope as Listings in …", () => {
    const chip = read("components/shared/MyStatesButton.tsx");
    expect(chip).toContain('"Listings in all states"');
    expect(chip).toContain('`Listings in ${states.join(", ")}`');
  });

  it("home-state rails say 'Listings in your home state' off the flip desk", () => {
    for (const page of ["app/(dashboard)/discover/page.tsx"]) {
      const source = read(page);
      expect(source).toMatch(
        /flipDesk \? "(📍 )?Near you" : "Listings in your home state"/,
      );
    }
  });
});
