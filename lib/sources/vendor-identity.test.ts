import { describe, expect, it } from "vitest";
import { vendorIdentity } from "./vendor-identity";

describe("listing vendor identity", () => {
  it("uses the actual DriveNation identity without trusting a spoofed host", () => {
    expect(
      vendorIdentity(
        "independent_dealer",
        "https://www.drivenation.com/vehiclesDetail.php?1539",
      ).label,
    ).toBe("DriveNation");
    expect(
      vendorIdentity(
        "independent_dealer",
        "https://drivenation.com.evil.example/car",
      ).label,
    ).toBe("drivenation.com.evil.example");
  });
  it("uses the actual listing vendor even when the scraper label differs", () => {
    const result = vendorIdentity(
      "copart",
      "https://stlouis.craigslist.org/cto/123.html",
    );
    expect(result.label).toBe("Craigslist");
    expect(result.mark).toBe("/brand/vendors/craigslist.ico");
  });
  it("does not assign vendor artwork to a spoofed domain", () => {
    const result = vendorIdentity(
      "craigslist",
      "https://craigslist.org.example.com/car",
    );
    expect(result.mark).toBeUndefined();
    expect(result.label).toBe("craigslist.org.example.com");
    expect(result.channelLabel).toBeUndefined();
  });
  it("names independent sellers by their real host rather than a database enum", () => {
    expect(
      vendorIdentity("independent_dealer", "https://www.exampledealer.com/car")
        .label,
    ).toBe("exampledealer.com");
  });
  it("retains known auction channel language", () => {
    expect(
      vendorIdentity("retail", "https://www.copart.com/lot/123").channelLabel,
    ).toBe("Auction");
  });
  it.each(["/ctd/d/vehicle/123.html", "/nco/ctd/d/vehicle/123.html"])(
    "identifies Craigslist dealer sections without assuming private sellers: %s",
    (path) => {
      const vendor = vendorIdentity(
        "craigslist",
        `https://stlouis.craigslist.org${path}`,
      );
      expect(vendor.label).toBe("Craigslist");
      expect(vendor.channelLabel).toBe("Dealer");
    },
  );
  it("does not infer a seller channel from a Craigslist hostname alone", () => {
    expect(
      vendorIdentity("craigslist", "https://stlouis.craigslist.org/")
        .channelLabel,
    ).toBeUndefined();
    expect(
      vendorIdentity("craigslist_dealer", "https://stlouis.craigslist.org/")
        .channelLabel,
    ).toBe("Dealer");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,test",
    "/deal/1",
    "not a url",
    "https://user:password@copart.com/lot/1",
  ])("never makes an unsafe or malformed link clickable: %s", (url) => {
    expect(vendorIdentity("copart", url).href).toBeUndefined();
  });
});
