import { describe, expect, it } from "vitest";
import { hasReportedRepairRisk, includesRepairable } from "./repair-risk";
import { assessDecisionEvidence } from "./decision-guard";
import { dealLane } from "@/lib/discovery/categorize";

describe("repair eligibility and classification", () => {
  it.each([
    "front end",
    "rear end",
    "mechanical",
    "hail",
    "water",
    "minor dents",
  ])("holds clean-title cars with reported %s risk consistently", (damage) => {
    expect(hasReportedRepairRisk("clean_title", damage)).toBe(true);
    expect(dealLane({ condition: "clean_title", damage_type: damage })).toBe(
      "repairable",
    );
    expect(
      assessDecisionEvidence({ condition: "clean_title", damageType: damage })
        .state,
    ).toBe("repairable");
  });
  it.each([
    null,
    "",
    "none",
    "NONE",
    "unknown",
    "n/a",
    "not reported",
    "no damage",
  ])("does not invent damage for placeholder %s", (damage) => {
    expect(hasReportedRepairRisk("clean_title", damage)).toBe(false);
    expect(
      assessDecisionEvidence({ condition: "clean_title", damageType: damage })
        .acquisitionReady,
    ).toBe(false);
  });
  it("separates inclusion from repair capability and buyer mode defaults", () => {
    expect(includesRepairable({ buyerMode: "personal" })).toBe(false);
    expect(includesRepairable({ buyerMode: "diy" })).toBe(true);
    expect(
      includesRepairable({ buyerMode: "personal", includeRepairable: true }),
    ).toBe(true);
    expect(
      includesRepairable({ buyerMode: "dealer", includeRepairable: false }),
    ).toBe(false);
  });
});
