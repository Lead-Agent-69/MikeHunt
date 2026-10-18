import { describe, it, expect } from "vitest";
import { dealLane, titleClass } from "./categorize";

// These are exactly the condition/damage values SITE_TYPE_DEFAULTS (lib/scrapers/sources/index.ts)
// injects per curated-site type. This test locks in the bug fix: curated salvage cars must land in
// the salvage/repairable lane (red/orange), NOT the "private" lane they fell into when condition was
// hardcoded to "run_drive". If dealLane stops honoring these, the whole curated network mislabels again.
describe("dealLane — curated-site type defaults map to the right channel", () => {
  it("running condition is not proof of a clean title", () => {
    expect(
      dealLane({
        source: "ebay_motors",
        options: { priceEvidence: { kind: "current_bid" } },
      }),
    ).toBe("auction");
    expect(
      dealLane({
        source: "ebay_motors",
        priceEvidence: { kind: "current_bid" },
      }),
    ).toBe("auction");
    expect(titleClass("run_drive")).toBe("unknown");
    expect(titleClass("clean_title")).toBe("clean");
  });

  it("government auction sources remain in the auction lane", () => {
    expect(dealLane({ source: "govdeals", condition: "run_drive" })).toBe(
      "auction",
    );
    expect(
      dealLane({ source: "publicsurplus", condition: "clean_title" }),
    ).toBe("auction");
  });
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

  it("keeps independent dealers in retail rather than private", () => {
    expect(
      dealLane({ source: "independent_dealer", condition: "run_drive" }),
    ).toBe("clean-retail");
  });

  it("keeps clean-title independent dealer inventory in retail", () => {
    expect(dealLane({ source: "independent_dealer", condition: "clean" })).toBe(
      "clean-retail",
    );
  });
  it("honors explicit marketplace seller evidence without replacing repair condition", () => {
    expect(
      dealLane({
        source: "ebay_motors",
        condition: "clean_title",
        seller_type: "private",
      }),
    ).toBe("private");
    expect(
      dealLane({
        source: "facebook_marketplace",
        condition: "clean_title",
        options: { sellerType: "dealer" },
      }),
    ).toBe("clean-retail");
    expect(
      dealLane({
        source: "independent_dealer",
        condition: "salvage_title",
        seller_type: "dealer",
      }),
    ).toBe("salvage");
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
