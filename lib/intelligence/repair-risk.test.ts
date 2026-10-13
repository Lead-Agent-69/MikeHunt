import { describe, expect, it } from "vitest";
import { hasReportedRepairRisk, includesRepairable } from "./repair-risk";
import { assessDecisionEvidence } from "./decision-guard";
import { dealLane } from "@/lib/discovery/categorize";

describe("repair eligibility and classification", () => {
  it.each([
    "2003 Ford Escape $800 OBO *Mechanic's Special",
    "Mechanic\u2019s special",
    "Mechanics-special",
    "Classic Restoration Project",
    "Needs an engine",
    "doesn't run",
    "parts-only",
  ])("screens explicit seller repair wording: %s", (title) => {
    expect(hasReportedRepairRisk("clean_title", "none", title)).toBe(true);
    expect(dealLane({ condition: "clean_title", title })).toBe("repairable");
    expect(
      assessDecisionEvidence({ condition: "clean_title", title }).state,
    ).toBe("repairable");
  });
  it.each([
    "Pontiac Firebird",
    "New parts installed",
    "No repairs needed",
    "Special edition",
    "Work truck",
    "Engine serviced",
  ])("does not diagnose damage from ordinary wording: %s", (title) => {
    expect(hasReportedRepairRisk("clean_title", "none", title)).toBe(false);
  });
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
