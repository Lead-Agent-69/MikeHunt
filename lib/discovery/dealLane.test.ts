import { describe, it, expect } from "vitest";
import { dealLane } from "./categorize";

// These are exactly the condition/damage values SITE_TYPE_DEFAULTS (lib/scrapers/sources/index.ts)
// injects per curated-site type. This test locks in the bug fix: curated salvage cars must land in
// the salvage/repairable lane (red/orange), NOT the "private" lane they fell into when condition was
// hardcoded to "run_drive". If dealLane stops honoring these, the whole curated network mislabels again.
describe("dealLane — curated-site type defaults map to the right channel", () => {
  it("salvage_yard default (salvage_title) → salvage", () => {
    expect(
      dealLane({ source: "independent_dealer", condition: "salvage_title" }),
    ).toBe("salvage");
  });

  it("auction_proxy default (salvage_title) → salvage", () => {
    expect(
      dealLane({ source: "independent_dealer", condition: "salvage_title" }),
    ).toBe("salvage");
  });

  it("rebuilder_dealer default (rebuilt_title + repairable) → repairable", () => {
    expect(
      dealLane({
        source: "independent_dealer",
        condition: "rebuilt_title",
        damage_type: "repairable",
      }),
    ).toBe("repairable");
  });

  it("independent_dealer default (run_drive) → private", () => {
    expect(
      dealLane({ source: "independent_dealer", condition: "run_drive" }),
    ).toBe("private");
  });

  it("clean_retail default (clean) on a dealer site → private (no retail source)", () => {
    expect(dealLane({ source: "independent_dealer", condition: "clean" })).toBe(
      "private",
    );
  });

  it("auction sources still take the auction lane regardless of condition", () => {
    expect(dealLane({ source: "copart", condition: "salvage_title" })).toBe(
      "auction",
    );
    expect(dealLane({ source: "iaa", condition: "run_drive" })).toBe("auction");
  });

  it("real retail sources land in clean-retail", () => {
    expect(dealLane({ source: "carvana", condition: "clean" })).toBe(
      "clean-retail",
    );
  });
});
