import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BUYER_MODES } from "@/hooks/useBuyerIntent";

const page = readFileSync("app/onboarding/page.tsx", "utf8");

describe("onboarding does not flash a default mode while prefs load", () => {
  it("renders no selected mode until prefs hydrate", () => {
    expect(page).toContain(
      "const selectedMode: BuyerMode | null = prefsHydrated ? buyerMode : null;",
    );
    const start = page.indexOf("(Object.keys(BUYER_MODES) as BuyerMode[]).map");
    const end = page.indexOf("{item.question}", start);
    const modeGrid = page.slice(start, end);
    expect(modeGrid).not.toContain("buyerMode === mode");
    expect(modeGrid.match(/selectedMode === mode/g)?.length).toBe(5);
    expect(modeGrid).toContain("aria-busy={!prefsHydrated}");
  });

  it("DIY priorities only name evidence the app actually shows", () => {
    const diy = BUYER_MODES.diy.priorities.join(" ");
    expect(diy).not.toMatch(/skill|tools|workspace|difficulty/i);
  });
});
