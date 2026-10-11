import { describe, expect, it } from "vitest";
import { vendorIdentity } from "./vendor-identity";

describe("listing vendor identity", () => {
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
