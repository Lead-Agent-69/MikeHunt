import { describe, expect, it } from "vitest";
import { dealerListingUrl } from "./dealer-listing-url";

describe("dealer listing URLs", () => {
  const valid = (href: string) =>
    dealerListingUrl(href, "https://dealer.example", "/inventory");
  it("resolves vehicle URLs and preserves identifying query parameters", () => {
    expect(valid("/cars/123#photos")).toBe("https://dealer.example/cars/123");
    expect(valid("/vehicle.php?id=123")).toBe(
      "https://dealer.example/vehicle.php?id=123",
    );
  });
  it("rejects homepage, inventory variants and account links", () => {
    for (const href of [
      "/",
      "https://dealer.example",
      "/inventory/?page=2",
      "/used",
      "/mysavedvehicles",
      "/deposit/123",
      "/login",
    ])
      expect(valid(href)).toBeNull();
  });
  it("accepts a query-selected vehicle on an inventory endpoint, not pagination or filters", () => {
    for (const key of [
      "id",
      "vid",
      "vehicleId",
      "vehicle_id",
      "listingId",
      "stock",
      "stockNumber",
      "vin",
    ])
      expect(valid(`/inventory?${key}=ABC123`)).toBe(
        `https://dealer.example/inventory?${key}=ABC123`,
      );
    for (const query of ["page=2", "make=Ford", "q=123", "id=", "stock=+"])
      expect(valid(`/inventory?${query}`)).toBeNull();
    expect(
      dealerListingUrl(
        "/vehicles.php?id=123",
        "https://dealer.example",
        "/vehicles.php",
      ),
    ).toBe("https://dealer.example/vehicles.php?id=123");
    expect(
      dealerListingUrl(
        "/vehicles.php?id=123",
        "https://dealer.example",
        "/vehicles.php?id=123",
      ),
    ).toBeNull();
  });
  it("rejects non-navigational, cross-site and credential-bearing links", () => {
    for (const href of [
      "#photos",
      "javascript:void(0)",
      "mailto:dealer@example.com",
      "data:text/html,car",
      "https://other.example/cars/123",
      "https://user:pass@dealer.example/cars/123",
    ])
      expect(valid(href)).toBeNull();
  });
});
