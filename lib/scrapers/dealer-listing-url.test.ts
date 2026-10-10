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
