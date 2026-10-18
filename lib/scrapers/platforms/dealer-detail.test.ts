import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import {
  dealerDetailAllInPrice,
  dealerDetailMileage,
  parseDealerOdometer,
} from "./dealer-detail";
import { CURATED_SITES } from "../curated-sites";
import { dealerCmsSiteFromCurated } from "./dealer-cms";

describe("dealer detail odometer evidence", () => {
  it("accepts an explicit all-in price on either side of its label and rejects conflicting prices", () => {
    expect(
      dealerDetailAllInPrice(
        "Retail $21,700 Savings $2,180 $19,520 All In Price*",
      ),
    ).toBe(19520);
    expect(dealerDetailAllInPrice("All In Price $19,520")).toBe(19520);
    expect(dealerDetailAllInPrice("Savings $2,180")).toBeUndefined();
    expect(
      dealerDetailAllInPrice("$19,520 All In Price $20,520 All In Price"),
    ).toBeUndefined();
  });
  it("reads DriveNation's labelled field instead of its shipping radius", () => {
    const $ = load(
      '<p>Free shipping within 200 miles. Call 573-524-2400</p><div><span class="d-title">Mileage</span><spam class="d-value">54,124</spam></div>',
    );
    expect(dealerDetailMileage($)).toBe(54124);
  });
  it("does not read an unlabelled shipping distance", () => {
    expect(
      dealerDetailMileage(
        load("<p>200 miles free shipping</p><p>Stock 6054772</p>"),
      ),
    ).toBeUndefined();
  });
  it("never concatenates unrelated numeric fields", () => {
    expect(parseDealerOdometer("54,124 VIN 5XXG14J25PG166770")).toBeUndefined();
    expect(parseDealerOdometer("6,054,772")).toBeUndefined();
    expect(parseDealerOdometer("Not actual")).toBeUndefined();
  });
  it("bounds structured values and converts explicitly reported kilometers", () => {
    expect(dealerDetailMileage(load(""), { value: 6054772 })).toBeUndefined();
    expect(
      dealerDetailMileage(load(""), { value: 100000, unitCode: "KMT" }),
    ).toBe(62137);
    expect(parseDealerOdometer(0)).toBe(0);
    expect(parseDealerOdometer(100, "HUR")).toBeUndefined();
  });
  it("allows explicit prose mileage without using a shipping-distance fallback", () => {
    expect(
      dealerDetailMileage(
        load("<p>200 miles free delivery. Mileage: 54,124 Title Clean</p>"),
      ),
    ).toBe(54124);
    expect(
      dealerDetailMileage(load("<p>Mileage: 6,054,772</p>")),
    ).toBeUndefined();
  });
  it("does not classify all DriveNation vehicles as repairable", () => {
    const site = CURATED_SITES.find(
      (s) => s.url === "https://www.drivenation.com",
    )!;
    expect(dealerCmsSiteFromCurated(site)?.defaultDamage).toBeUndefined();
  });
});
