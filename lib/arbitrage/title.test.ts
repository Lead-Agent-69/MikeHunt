import { describe, expect, it } from "vitest";
import { titleCategory as dealTitleCategory } from "@/lib/deals/title-category";
import { soldTitleCategory, titleCategory } from "./title";

describe("lib/arbitrage/title delegates to lib/deals/title-category", () => {
  it("every listing_condition enum value matches Amy's module (capitalized)", () => {
    for (const c of [
      "clean_title",
      "rebuilt_title",
      "salvage_title",
      "parts_only",
      "repairable",
      "run_drive",
      "hail",
      "flood",
      "fire",
    ]) {
      const amy = dealTitleCategory({ condition: c });
      expect(titleCategory(c).toLowerCase()).toBe(amy);
    }
    expect(titleCategory("run_drive")).toBe("Unknown");
    expect(titleCategory("flood")).toBe("Unknown");
  });

  it("sold headlines: only explicit clean-title claims are Clean; branded words are branded", () => {
    expect(soldTitleCategory("2018 Honda Accord EX")).toBe("Unknown");
    expect(soldTitleCategory("2018 Honda Accord EX, clean title")).toBe(
      "Clean",
    );
    expect(soldTitleCategory("2018 Honda Accord, not clean title")).toBe(
      "Unknown",
    );
    expect(soldTitleCategory("2017 F-150 rebuilt title")).toBe("Rebuilt");
    expect(soldTitleCategory("rebuilt from salvage")).toBe("Salvage");
    expect(soldTitleCategory("Flood damaged Camry")).toBe("Salvage");
    expect(soldTitleCategory(null)).toBe("Unknown");
  });
});
