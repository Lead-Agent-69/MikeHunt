import { describe, expect, it } from "vitest";
import { matchesCuratedTarget } from "./curated-targets";
import { planScrapeForBuyerScope } from "./buyer-scope";
import { vendorIdentity } from "../sources/vendor-identity";
import { CURATED_SITES } from "./curated-sites";
import { DEALER_CMS_SITES } from "./platforms/dealer-cms";

describe("explicit dealer collection targets", () => {
  const drive = { url: "https://www.drivenation.com" };
  it("resolves DriveNation to the actual CMS identity and only the curated runner", () => {
    const plan = planScrapeForBuyerScope({
      state: "MO",
      dealerHosts: ["drivenation.com"],
    });
    expect(plan.sourceIds).toEqual(["curated_dealers"]);
    expect(plan.scope.dealerSourceIds).toEqual(["4cdg-drivenation-com"]);
    expect(
      matchesCuratedTarget(
        drive,
        plan.scope.dealerSourceIds,
        plan.scope.dealerHosts,
      ),
    ).toBe(true);
    expect(
      vendorIdentity(
        "independent_dealer",
        "https://www.drivenation.com/vehiclesDetail.php?1539",
      ).label,
    ).toBe("DriveNation");
  });
  it("supports a cataloged host without broadening to unrelated sites", () => {
    const plan = planScrapeForBuyerScope({
      state: "MO",
      dealerHosts: ["glensautosales.com"],
    });
    expect(plan.sourceIds).toEqual(["curated_dealers"]);
    expect(
      matchesCuratedTarget(
        { url: "https://www.glensautosales.com/" },
        [],
        plan.scope.dealerHosts,
      ),
    ).toBe(true);
    expect(matchesCuratedTarget(drive, [], plan.scope.dealerHosts)).toBe(false);
  });
  it("rejects spoofed or unresolved targets instead of crawling every dealer", () => {
    expect(matchesCuratedTarget(drive, ["unknown-source"], [])).toBe(false);
    expect(
      matchesCuratedTarget(drive, [], ["drivenation.com.evil.example"]),
    ).toBe(false);
    expect(matchesCuratedTarget(drive, [], [])).toBe(true);
  });
  it.each(DEALER_CMS_SITES)(
    "can target $sourceId by adapter ID without widening the crawl",
    ({ sourceId, baseUrl }) => {
      const expected = new URL(baseUrl).hostname.replace(/^www\./, "");
      const matches = CURATED_SITES.filter((site) =>
        matchesCuratedTarget(site, [sourceId]),
      );
      expect(
        matches.map((site) => new URL(site.url).hostname.replace(/^www\./, "")),
      ).toEqual([expected]);
      expect(
        matchesCuratedTarget({ url: `https://${expected}.invalid` }, [
          sourceId,
        ]),
      ).toBe(false);
    },
  );
});
