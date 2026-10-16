import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("onboarding edit mode hydrate race", () => {
  const page = readFileSync("app/onboarding/page.tsx", "utf8");

  it("does not expose role choices or allow editing before hydration", () => {
    expect(page).not.toContain("setBuyerMode");
    expect(page).toContain("prefsHydrated");
    expect(page).toContain("disabled={!prefsHydrated}");
    expect(page).toContain("BUYING_WORKSPACE_MODE");
    expect(page).toContain("legacyBuyerMode:");
  });
});
