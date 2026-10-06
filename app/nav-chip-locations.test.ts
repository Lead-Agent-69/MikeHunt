import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const picker = readFileSync("components/shared/StatePicker.tsx", "utf8");
const chip = readFileSync("components/shared/MyStatesButton.tsx", "utf8");

describe("nav location chip follows home vs search locations", () => {
  it("StatePicker mirrors non-empty picks into prefs.searchLocations", () => {
    expect(picker).toMatch(
      /searchLocationsFromStates\(\s*states,\s*effectiveHome\(prefs\),\s*effectiveSearchLocations\(prefs\),?\s*\)/,
    );
    expect(picker).toContain("...(searchLocations ? { searchLocations } : {})");
  });

  it("chip falls back to home + search locations when there is no carsStates mirror", () => {
    expect(chip).toMatch(
      /statesOverride \|\|\s*prefs\.carsStates \|\|\s*\(hasLocationPrefs/,
    );
    expect(chip).toMatch(
      /legacyStatesMirror\(\s*effectiveHome\(prefs\),\s*effectiveSearchLocations\(prefs\),?\s*\)/,
    );
  });
});
