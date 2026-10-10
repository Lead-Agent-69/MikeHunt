import { describe, expect, it } from "vitest";
import { detectSource } from "./detect-source";

describe("save-from-url detectSource (hostname, not substring)", () => {
  it("an attacker URL that mentions copart.com is not copart", () => {
    expect(
      detectSource(
        "https://attacker.example/lot/12345678/2020-ford-f150?copart.com",
      ),
    ).toBe("web-share");
    expect(
      detectSource("https://copart.com.attacker.example/lot/12345678"),
    ).toBe("web-share");
    expect(
      detectSource("https://copart.com@attacker.example/lot/12345678"),
    ).toBe("web-share");
    expect(detectSource("https://attacker.example/#craigslist.org")).toBe(
      "web-share",
    );
  });

  it("classiccars.com is not cars.com", () => {
    expect(detectSource("https://www.classiccars.com/listings/view/1")).toBe(
      "web-share",
    );
    expect(detectSource("https://www.cars.com/vehicledetail/abc/")).toBe(
      "cars-com",
    );
  });

  it("real hosts and their subdomains still match", () => {
    expect(detectSource("https://www.copart.com/lot/12345678/x")).toBe(
      "copart",
    );
    expect(detectSource("https://copart.com/lot/12345678")).toBe("copart");
    expect(detectSource("https://sfbay.craigslist.org/cto/d/x/1.html")).toBe(
      "craigslist",
    );
    expect(detectSource("https://m.facebook.com/marketplace/item/1")).toBe(
      "facebook-marketplace",
    );
    expect(detectSource("https://www.iaai.com/VehicleDetail/123")).toBe("iaa");
    expect(detectSource("https://www.ebay.com/itm/1")).toBe("ebay-motors");
    expect(detectSource("https://ebay.to/abc")).toBe("ebay-motors");
    expect(detectSource("https://www.autotrader.com/x")).toBe("autotrader");
    expect(detectSource("https://www.cargurus.com/x")).toBe("cargurus");
    expect(detectSource("https://www.carmax.com/car/1")).toBe("carmax");
    expect(detectSource("https://www.carvana.com/vehicle/1")).toBe("carvana");
  });

  it("an unknown host is the generic bucket, a non-http URL is rejected", () => {
    expect(detectSource("https://somedealer.example/inventory/1")).toBe(
      "web-share",
    );
    expect(detectSource("javascript:alert(1)//copart.com")).toBeNull();
    expect(detectSource("not a url at all")).toBeNull();
  });
});
