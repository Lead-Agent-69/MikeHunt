import { describe, it, expect } from "vitest";
import { normalizeCondition } from "./normalize-condition";

describe("normalizeCondition — coerce free text to the listing_condition enum", () => {
  it("passes through valid enum values (snake or spaced)", () => {
    expect(normalizeCondition("salvage_title")).toBe("salvage_title");
    expect(normalizeCondition("clean title")).toBe("clean_title");
    expect(normalizeCondition("run_drive")).toBe("run_drive");
  });

  it("maps the AI/free-text strings that were breaking inserts", () => {
    expect(normalizeCondition("Clean Title")).toBe("clean_title");
    expect(normalizeCondition("Salvage Title")).toBe("salvage_title");
    expect(normalizeCondition("Non-Repairable")).toBe("parts_only");
    expect(normalizeCondition("Rebuilt")).toBe("rebuilt_title");
    expect(normalizeCondition("Runs & Drives")).toBe("run_drive");
  });

  it("recognizes damage/brand phrasings", () => {
    expect(normalizeCondition("Flood Damage")).toBe("flood");
    expect(normalizeCondition("Burn / Fire")).toBe("fire");
    expect(normalizeCondition("Hail")).toBe("hail");
    expect(normalizeCondition("Totaled Loss")).toBe("salvage_title");
    expect(normalizeCondition("Repairable")).toBe("repairable");
    expect(normalizeCondition("Clear")).toBe("clean_title"); // damage.com's clean-title badge
  });

  it("returns undefined for empty/unknown rather than an invalid enum", () => {
    expect(normalizeCondition("")).toBeUndefined();
    expect(normalizeCondition(null)).toBeUndefined();
    expect(normalizeCondition("purple monkey")).toBeUndefined();
  });
});
