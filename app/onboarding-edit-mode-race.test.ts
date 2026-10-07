import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("onboarding edit mode hydrate race", () => {
  const page = readFileSync("app/onboarding/page.tsx", "utf8");

  it("does not let late prefs hydrate overwrite a mode click", () => {
    expect(page).toContain("modeTouchedRef");
    expect(page).toContain("prefsHydrated");
    expect(page).toContain("disabled={!prefsHydrated}");
    expect(page).toContain("if (!modeTouchedRef.current)");
    expect(page).toContain("modeTouchedRef.current = true");
  });
});
