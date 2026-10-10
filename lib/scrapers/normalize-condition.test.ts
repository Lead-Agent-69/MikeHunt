import { describe, it, expect } from "vitest";
import {
  normalizeCondition,
  resolveListingCondition,
} from "./normalize-condition";

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

describe("certified + title provenance", () => {
  it("certified pre-owned is not a title brand", () => {
    for (const v of [
      "certified",
      "Certified",
      "CPO",
      "certified pre-owned",
      "cert",
    ])
      expect(normalizeCondition(v)).toBeUndefined();
    expect(normalizeCondition("Certified, clean title")).toBe("clean_title");
  });

  it("resolveListingCondition prefers the listing, tags source defaults, else nothing", () => {
    expect(resolveListingCondition("rebuilt_title", "salvage_title")).toEqual({
      condition: "rebuilt_title",
      title_source: "listing",
    });
    expect(resolveListingCondition(undefined, "salvage_title")).toEqual({
      condition: "salvage_title",
      title_source: "source_default",
    });
    expect(resolveListingCondition(undefined, undefined)).toEqual({});
  });
});
