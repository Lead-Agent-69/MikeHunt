import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("onboarding edit mode hydrate race", () => {
  const page = readFileSync("app/onboarding/page.tsx", "utf8");

  it("keeps account permissions separate and blocks editing before hydration", () => {
    expect(page).toContain(
      "setBuyerMode(buyingWorkspaceScope(saved).buyerMode)",
    );
    expect(page).toContain("<BuyingPurposeChoices");
    expect(page).toContain("prefsHydrated");
    expect(page).toContain("disabled={!prefsHydrated}");
    expect(page).toContain("BUYING_WORKSPACE_MODE");
    expect(page).toContain("legacyBuyerMode:");
  });
});
