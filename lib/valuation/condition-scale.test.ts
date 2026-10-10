import { describe, expect, it } from "vitest";
import {
  conditionGrade,
  conditionScale,
  damageSeverity,
} from "./condition-scale";
import { titleSeverityMultiplier } from "@/lib/scoring/condition-value";

describe("damageSeverity", () => {
  it.each([
    ["FRONT END", "moderate"],
    ["REAR END", "moderate"],
    ["SIDE", "moderate"],
    ["MECHANICAL", "moderate"],
    ["HAIL", "minor"],
    ["MINOR DENT/SCRATCHES", "minor"],
    ["WATER/FLOOD", "severe"],
    ["BURN", "severe"],
    ["FRAME DAMAGE", "severe"],
    ["ALL OVER", "severe"],
    ["PARTS ONLY", "parts"],
    ["none", "none"],
  ])("%s → %s", (damageType, sev) => {
    expect(damageSeverity({ damageType }).severity).toBe(sev);
  });

  it("title brands are not damage", () => {
    expect(damageSeverity({ condition: "clean_title" }).severity).toBe("none");
    expect(damageSeverity({ condition: "salvage_title" }).severity).toBe(
      "none",
    );
  });

  it("no fields at all is unknown, not none", () => {
    expect(damageSeverity({}).severity).toBe("unknown");
  });

  it("does not read 'inside' or 'outside' as side damage", () => {
    expect(damageSeverity({ title: "clean inside and outside" }).severity).toBe(
      "unknown",
    );
  });
});

describe("conditionGrade", () => {
  it.each([
    ["Excellent", "excellent"],
    ["like new", "excellent"],
    ["Good", "good"],
    ["used", "good"],
    ["Fair", "fair"],
    ["rough", "fair"],
    ["clean_title", "unknown"],
    ["", "unknown"],
  ])("%s → %s", (c, g) => expect(conditionGrade(c)).toBe(g));
});

describe("conditionScale factors", () => {
  it("mirrors condition-value severity multipliers (no new severity numbers)", () => {
    const pairs: Array<[string, string]> = [
      ["FIRE", "fire"],
      ["WATER/FLOOD", "flood"],
      ["HAIL", "hail"],
      ["PARTS ONLY", "parts"],
      ["FRONT END", "front end"],
    ];
    for (const [dmg, cv] of pairs) {
      expect(conditionScale({ damageType: dmg }).severityFactor).toBe(
        titleSeverityMultiplier({ damage_type: cv } as any).mult,
      );
    }
  });

  it("grade applies only when damage is none/minor/unknown", () => {
    expect(conditionScale({ condition: "Excellent" }).factor).toBe(1.05);
    expect(conditionScale({ condition: "fair" }).factor).toBe(0.9);
    expect(
      conditionScale({ condition: "fair", damageType: "HAIL" }).factor,
    ).toBe(0.765);
    expect(
      conditionScale({ condition: "excellent", damageType: "FRONT END" })
        .factor,
    ).toBe(0.58);
  });

  it("unknown everything = factor 1 (no adjustment)", () => {
    expect(conditionScale({}).factor).toBe(1);
  });
});
