import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { homeLocationPatch } from "@/lib/preferences/location-form";

describe("Settings home state default", () => {
  const settings = readFileSync("app/(dashboard)/settings/page.tsx", "utf8");

  it("starts with no state picked instead of CA", () => {
    expect(settings).not.toContain('"CA"');
    expect(settings).toContain('home_state: "",');
    expect(settings).toContain(
      'home_state: profileData.profile.home_state || "",',
    );
    const locations = readFileSync(
      "components/settings/LocationPrefs.tsx",
      "utf8",
    );
    expect(locations).toContain('state: "",');
    expect(locations).not.toContain('state: "CA"');
    expect(settings).toContain("<LocationPrefs />");
  });

  it("clears home explicitly through the single location editor, not an unrelated profile save", () => {
    expect(homeLocationPatch(null, [])).toEqual({
      homeLocation: null,
      carsState: "",
      carsStates: [],
    });
    const locations = readFileSync(
      "components/settings/LocationPrefs.tsx",
      "utf8",
    );
    expect(locations).toContain("homeLocationPatch(null, search)");
    const payload = settings.slice(
      settings.indexOf('const res = await fetch("/api/profile"'),
      settings.indexOf("const data = await res.json()"),
    );
    expect(payload).not.toContain("home_state:");
  });

  it("the dealer-defaults hook does not guess CA either", () => {
    const hook = readFileSync("hooks/useDealerDefaults.ts", "utf8");
    expect(hook).not.toContain('"CA"');
  });
});
