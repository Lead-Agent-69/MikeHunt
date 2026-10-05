import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("legacy location readers prefer the #66 fields", () => {
  it("NearbyDeals centers on effectiveHome, not raw carsState", () => {
    const src = read("components/discovery/NearbyDeals.tsx");
    expect(src).toContain('effectiveHome(prefs)?.state || ""');
    expect(src).not.toContain("prefs.carsState ||");
  });

  it("feed seeds its scope from savedScopeStates", () => {
    const src = read("app/(dashboard)/feed/page.tsx");
    expect(src).toContain("setScope(savedScopeStates(prefs) || [])");
    expect(src).not.toContain("prefs.carsStates as string[]");
    // Seeding waits for prefs to load instead of seeding "all states" from the empty default.
    expect(src).toMatch(/scope === null && !prefsLoading/);
    expect(src).toContain(
      "if (busy.current || done || scope === null) return;",
    );
  });

  it("Discover reads saved scope and home through the helpers", () => {
    const src = read("app/(dashboard)/discover/page.tsx");
    expect(src).toContain("const savedStates = savedScopeStates(prefs);");
    expect(src).toContain('effectiveHome(prefs)?.state || ""');
    expect(src).not.toContain("prefs.carsState ||");
  });
});
