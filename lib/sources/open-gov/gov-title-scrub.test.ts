import { describe, expect, it } from "vitest";
import {
  govTitle,
  govVenueLabel,
  scrubGovText,
  gsaClosingBidRows,
} from "./sold-comps";
import { maestroAssetToSoldComp } from "@/lib/scrapers/sources/lqdt-maestro";

describe("gov titles carry no VINs or phone numbers", () => {
  it("scrubGovText removes VIN-shaped tokens and US phone numbers", () => {
    expect(
      scrubGovText("2016 Ford F-250 1FT7W2BT8GED11804 call (757) 555-0134"),
    ).toBe("2016 Ford F-250 call");
    expect(scrubGovText("Tahoe 757.555.0134 / +1 757 555 0134")).toBe(
      "Tahoe /",
    );
    expect(scrubGovText("2018 Honda Accord")).toBe("2018 Honda Accord");
  });

  it("govTitle builds from fields and scrubs them", () => {
    expect(govTitle([2016, "Ford", "F-250 1FT7W2BT8GED11804"], "x")).toBe(
      "2016 Ford F-250 (x)",
    );
    expect(govVenueLabel("gsa_closing_bid")).toMatch(/GSA/);
  });

  it("GSA rows: title is year/make/model, never the lot text", () => {
    const rows = gsaClosingBidRows(
      [
        {
          id: "g1",
          category: "vehicles",
          title: "2018 Honda Accord VIN 1HGCV1F30JA000001 contact 202-555-0188",
          current_or_final_bid: "4200",
          sold: "true",
          ended_at: "2026-09-01",
          source_url: "https://gsaauctions.gov/auctions/g1",
          state: "VA",
        },
      ] as any,
      new Date("2026-10-10T00:00:00Z"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).not.toMatch(/1HGCV1F30JA000001|555/);
    expect(rows[0].title).toMatch(/^2018 Honda Accord \(GSA/);
  });

  it("GovDeals/AllSurplus sold rows: title from year/make/model, not the description", () => {
    const row = maestroAssetToSoldComp(
      {
        assetId: 1,
        accountId: 2,
        isSoldAuction: true,
        modelYear: "2015",
        makebrand: "Chevrolet",
        model: "Tahoe",
        currentBid: 9000,
        assetAuctionEndDateUtc: "2026-09-01T00:00:00Z",
        assetShortDescription:
          "2015 Chevy Tahoe VIN 1GNSKAKC0FR000001 call 555-123-4567",
        locationState: "VA",
      } as any,
      { idPrefix: "gd" } as any,
      new Date("2026-10-10T00:00:00Z"),
    );
    expect(row?.title).toBe(
      "2015 Chevrolet Tahoe (GovDeals sold lot, winning bid before buyer's premium)",
    );
  });
});
