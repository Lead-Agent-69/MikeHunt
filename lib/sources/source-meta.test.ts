import { describe, expect, it } from "vitest";
import {
  dealerSourceIdForHost,
  dealerSourceIdFromUrl,
  displaySource,
  sourceMeta,
  dealerSourceOptions,
  sourceFromUrl,
} from "./source-meta";
import { CURATED_SITES } from "@/lib/scrapers/curated-sites";

describe("source display metadata", () => {
  it("gives every nationwide registered dealer a stable, named filter identity", () => {
    const options = dealerSourceOptions();
    for (const site of CURATED_SITES) {
      if (sourceMeta(sourceFromUrl(site.url)).channel === "gov") continue;
      const id = dealerSourceIdFromUrl(site.url);
      expect(id, site.url).toBeTruthy();
      expect(options.some((option) => option.id === id)).toBe(true);
      expect(sourceMeta(id).channel).not.toBe("marketplace");
      expect(sourceMeta(id).label).not.toMatch(/^Dealer /);
    }
    expect(new Set(options.map((option) => option.id)).size).toBe(
      options.length,
    );
  });

  it("does not mistake lookalike or query-string hosts for a dealer", () => {
    expect(
      dealerSourceIdFromUrl("https://dgautollc.com.example.org/car"),
    ).toBeNull();
    expect(
      dealerSourceIdFromUrl("https://example.org/?url=aeofmiami.com"),
    ).toBeNull();
  });
  it("uses listing URLs to show the real government source", () => {
    const source = displaySource(
      "gov_auction",
      "https://www.govdeals.com/asset/1234/25370",
    );

    expect(source).toBe("govdeals");
    expect(sourceMeta(source).label).toBe("GovDeals");
  });

  it("normalizes named small dealer source ids", () => {
    expect(sourceMeta("ae-of-miami").label).toBe("AE of Miami");
    expect(sourceMeta("stjames-auto").label).toBe("St. James Auto");
  });

  it("resolves small dealer source ids from hosts and listing URLs", () => {
    expect(dealerSourceIdForHost("https://www.aeofmiami.com/inventory")).toBe(
      "ae-of-miami",
    );
    expect(dealerSourceIdForHost("stjamesautoparts.com")).toBe("stjames-auto");
    expect(
      dealerSourceIdFromUrl("https://www.dgautollc.com/inventory/123", [
        "dg-auto",
      ]),
    ).toBe("dg-auto");
    expect(
      dealerSourceIdFromUrl("https://www.dgautollc.com/inventory/123", [
        "ae-of-miami",
      ]),
    ).toBeNull();
  });
});
