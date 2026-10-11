import { describe, expect, it } from "vitest";
import { readCondition } from "@/lib/intelligence/condition";
import {
  conditionDisplayLabel,
  needsOperabilityFacts,
} from "./condition-display";

describe("source-aware condition presentation", () => {
  it.each(["clean_title", "rebuilt_title", "salvage_title"])(
    "does not confuse a dealer's %s title history with unknown operability",
    (condition) => {
      const listing = { source: "salvagezone", condition };
      expect(needsOperabilityFacts(listing)).toBe(false);
      expect(needsOperabilityFacts({ ...listing, lane: "salvage" })).toBe(
        false,
      );
      expect(conditionDisplayLabel(readCondition(condition)!, listing)).toBe(
        "",
      );
      expect(readCondition(condition)!.runs).toBe("unknown");
      expect(
        needsOperabilityFacts({ ...listing, damageType: "FRONT END" }),
      ).toBe(true);
    },
  );
  it.each([
    "independent_dealer",
    "carvana",
    "cars_com",
    "craigslist",
    "facebook",
  ])(
    "does not infer running or show an auction warning on ordinary %s inventory",
    (source) => {
      const condition = readCondition("clean_title")!;
      expect(needsOperabilityFacts({ source, condition: "clean_title" })).toBe(
        false,
      );
      expect(conditionDisplayLabel(condition, { source })).toBe("");
      expect(condition.runs).toBe("unknown");
    },
  );
  it.each(["copart", "iaa", "manheim", "gov_auction"])(
    "preserves unreported operability for %s",
    (source) => {
      expect(
        conditionDisplayLabel(readCondition("clean_title")!, { source }),
      ).toBe("Running status not reported");
      expect(needsOperabilityFacts({ source })).toBe(true);
    },
  );
  it.each(["non_runner", "parts_only", "flood", "repairable"])(
    "does not suppress %s evidence just because the seller is a dealer",
    (condition) => {
      const listing = { source: "independent_dealer", condition };
      expect(needsOperabilityFacts(listing)).toBe(true);
      expect(
        conditionDisplayLabel(readCondition(condition)!, listing),
      ).not.toBe("");
    },
  );
  it("retains explicit runs-and-drives without treating all dealer cars as running", () => {
    expect(
      conditionDisplayLabel(readCondition("run_drive")!, {
        source: "independent_dealer",
      }),
    ).toBe("Runs & drives");
    expect(
      needsOperabilityFacts({
        source: "independent_dealer",
        condition: "clean_title",
        damageType: "FRONT END",
      }),
    ).toBe(true);
    expect(
      needsOperabilityFacts({
        source: "independent_dealer",
        titleType: "salvage",
      }),
    ).toBe(false);
    expect(
      needsOperabilityFacts({
        source: "independent_dealer",
        condition: "certified",
      }),
    ).toBe(false);
  });
  it("keeps marketplace auction context without inventing auction facts on conflicting retail records", () => {
    expect(
      needsOperabilityFacts({ source: "ebay_motors", lane: "auction" }),
    ).toBe(true);
    expect(
      needsOperabilityFacts({
        source: "independent_dealer",
        lane: "auction",
        condition: "clean_title",
      }),
    ).toBe(false);
  });
});
