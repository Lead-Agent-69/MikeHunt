import { describe, expect, it } from "vitest";
import { titleBadgeModel } from "@/lib/deals/title-badge-model";
import { titleClass } from "@/lib/discovery/categorize";

describe("TitleBadge model (Amy's title-category helper underneath)", () => {
  it("maps the five buckets from deals.condition only", () => {
    expect(titleBadgeModel({ condition: "clean_title" }).label).toBe(
      "Clean title",
    );
    expect(titleBadgeModel({ condition: "rebuilt_title" }).category).toBe(
      "rebuilt",
    );
    expect(titleBadgeModel({ condition: "repairable" }).label).toBe(
      "Rebuildable",
    );
    expect(titleBadgeModel({ condition: "run_drive" }).label).toBe(
      "Title unknown",
    );
    expect(titleBadgeModel({ condition: null }).category).toBe("unknown");
  });

  it("parts-only is Salvage with a sub-chip; flood/fire/hail is unknown + damage chip", () => {
    const parts = titleBadgeModel({ condition: "parts_only" });
    expect(parts.category).toBe("salvage");
    expect(parts.partsOnly).toBe(true);
    const flood = titleBadgeModel({ condition: "flood" });
    expect(flood.label).toBe("Title unknown");
    expect(flood.damage).toBe("flood");
    expect(
      titleBadgeModel({ condition: "salvage_title", damageType: "Fire" })
        .damage,
    ).toBe("fire");
  });

  it("a source-default title is weaker than a listing-stated one", () => {
    const weak = titleBadgeModel({
      condition: "salvage_title",
      titleSource: "source_default",
    });
    expect(weak.weak).toBe(true);
    expect(weak.label).toBe("Salvage title (reported by source)");
    expect(weak.tone).toBe("muted");
    const strong = titleBadgeModel({
      condition: "salvage_title",
      titleSource: "listing",
    });
    expect(strong.weak).toBe(false);
    expect(strong.tone).toBe("red");
  });

  it("keeps #195's rule: clean claim + repair evidence reads Title unconfirmed", () => {
    expect(
      titleBadgeModel({ condition: "clean_title", damageType: "flood damage" })
        .label,
    ).toBe("Title unconfirmed");
    expect(
      titleBadgeModel({ condition: "clean_title", repairableEvidence: true })
        .unconfirmed,
    ).toBe(true);
  });

  it("never upgrades to Clean from text that isn't the clean_title enum", () => {
    expect(titleBadgeModel({ condition: "Clean Carfax" }).category).toBe(
      "unknown",
    );
    expect(titleClass("Clean Carfax")).toBe("unknown");
    expect(titleClass("parts_only")).toBe("parts");
    expect(titleClass("salvage_title")).toBe("salvage");
  });
});
