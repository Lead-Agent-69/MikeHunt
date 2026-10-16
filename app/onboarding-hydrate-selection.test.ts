import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUYER_MODES } from "@/hooks/useBuyerIntent";

const page = readFileSync("app/onboarding/page.tsx", "utf8");

describe("onboarding does not flash a default mode while prefs load", () => {
  it("renders no selected mode until prefs hydrate", () => {
    expect(page).not.toContain("selectedMode");
    expect(page).not.toContain("Object.keys(BUYER_MODES)");
    expect(page).toContain("disabled={!prefsHydrated}");
  });

  it("DIY priorities only name evidence the app actually shows", () => {
    const diy = BUYER_MODES.diy.priorities.join(" ");
    expect(diy).not.toMatch(/skill|tools|workspace|difficulty/i);
  });
});
