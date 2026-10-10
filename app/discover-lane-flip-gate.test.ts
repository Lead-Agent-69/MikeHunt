import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { laneAllowedForMode } from "@/lib/buyer/lane-access";

const read = (path: string) => readFileSync(path, "utf8");

describe("wholesale auction lane is flip-desk only", () => {
  it("helper hides the auction lane for personal / DIY / parts / unknown", () => {
    for (const mode of ["personal", "diy", "parts", undefined]) {
      expect(laneAllowedForMode("auction", mode)).toBe(false);
      expect(laneAllowedForMode("damaged", mode)).toBe(true);
      expect(laneAllowedForMode("government", mode)).toBe(true);
    }
    expect(laneAllowedForMode("auction", "dealer")).toBe(true);
    expect(laneAllowedForMode("auction", "reseller")).toBe(true);
  });

  it("Discover lane dropdown renders only mode-allowed lanes", () => {
    const page = read("app/(dashboard)/discover/page.tsx");
    expect(page).toContain("laneAllowedForMode(value, buyerScope?.buyerMode)");
    expect(page).toContain("{laneOptions.map(([value, label]) => (");
    expect(page).not.toContain("{Object.entries(LANE_VALUE_TO_LABEL).map(");
    expect(page).toContain("laneValue: laneValueDraft,");
  });

  it("BuyerScopeBuilder lanes and recipes are filtered by mode", () => {
    const builder = read("components/discovery/BuyerScopeBuilder.tsx");
    expect(builder).toContain("{visibleLanes.map((item) => {");
    expect(builder).toContain("{visibleRecipes.map((recipe) => (");
    expect(builder).not.toContain("{LANES.map((item) => {");
    expect(builder).not.toContain("{GOAL_RECIPES.map((recipe) => (");
  });
});
