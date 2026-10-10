import { describe, expect, it } from "vitest";
import {
  cleanGovName,
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
    expect(scrubGovText("2018 Honda Accord")).toBe("2018 Honda Accord");
  });

  // Ren #331 R1 plants: shared scrubContact (emails, extensions, international) + glued VINs.
  for (const [input, leak] of [
    ["Tahoe contact bob.smith@norfolk.gov", "bob.smith@norfolk.gov"],
    ["Tahoe call 757-555-0142x22 today", "555-0142"],
    ["Tahoe call 757-555-0142 ext. 22", "555-0142"],
    ["Land Rover +44 20 7946 0958", "7946"],
    ["Land Rover +44 (0)20 7946 0958", "7946"],
    ["Tahoe SN1GNSKAKC0FR000001 runs", "1GNSKAKC0FR000001"],
    ["Tahoe VIN#1GNSKAKC0FR000001x", "1GNSKAKC0FR000001"],
    ["Tahoe vin:1gnskakc0fr000001,", "1gnskakc0fr000001"],
    ["F-150 1FTFW1E50JFA00001-2018", "1FTFW1E50JFA00001"],
    ["see https://govdeals.com/x?id=1 or www.example.com", "govdeals.com"],
  ] as const)
    it(`plant: ${input}`, () => {
      const out = scrubGovText(input);
      expect(out).not.toContain(leak);
      expect(out).not.toMatch(/\[(url|email|phone)\]/);
    });

  it("keeps ordinary vehicle text (years, model numbers, prices)", () => {
    for (const ok of [
      "2016 Ford F-250 Super Duty",
      "2019 Ram 2500",
      "Chevrolet Silverado 1500 4x4",
    ])
      expect(scrubGovText(ok)).toBe(ok);
  });

  it("cleanGovName: scrubbed, plain characters, capped at 40", () => {
    expect(cleanGovName("Chevrolet <b>Tahoe</b> 757-555-0142")).toBe(
      "Chevrolet b Tahoe /b",
    );
    expect(cleanGovName("x".repeat(80))).toHaveLength(40);
    expect(cleanGovName("Ford bob@x.gov")).toBe("Ford");
    expect(cleanGovName("   ")).toBeNull();
    expect(cleanGovName(42)).toBeNull();
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
        model: "Tahoe 1GNSKAKC0FR000001 call 757-555-0142x22 ".padEnd(90, "z"),
        currentBid: 9000,
        assetAuctionEndDateUtc: "2026-09-01T00:00:00Z",
        assetShortDescription:
          "2015 Chevy Tahoe VIN 1GNSKAKC0FR000001 call 555-123-4567",
        locationState: "VA",
      } as any,
      { idPrefix: "gd" } as any,
      new Date("2026-10-10T00:00:00Z"),
    );
    expect(row?.model).toMatch(/^Tahoe call z+$/);
    expect(row!.model!.length).toBeLessThanOrEqual(40);
    expect(row?.title).not.toMatch(/1GNSKAKC0FR000001|555/);
    expect(row?.title).toMatch(
      /^2015 Chevrolet Tahoe call z+ \(GovDeals sold lot/,
    );
  });
});

describe("/api/sold gov lane never reads the stored title", () => {
  it("the gov query's select has no title column", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/sold/route.ts", "utf8");
    const gov = src.slice(src.indexOf("let gq = supabase"));
    const select = gov.match(/\.select\(\s*"([^"]*)"/)?.[1] ?? "";
    expect(select).toContain("attribution");
    expect(select.split(",").map((c) => c.trim())).not.toContain("title");
  });
});
