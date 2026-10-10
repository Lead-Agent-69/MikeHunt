import { describe, expect, it } from "vitest";
import { isSourceLandingPage, sourceLinkLabel } from "./listing-link";

describe("source link labels", () => {
  it("does not call homepages or inventory pages individual listings", () => {
    for (const url of [
      "https://dealer.example",
      "https://dealer.example/",
      "https://dealer.example/used",
      "https://dealer.example/inventory?page=2",
    ])
      expect(sourceLinkLabel(url)).toBe("Seller website");
  });
  it("preserves real detail URLs, including query-based auction IDs", () => {
    for (const url of [
      "https://dealer.example/vehicle-info/used-2024-ford-bronco-sport-vin",
      "https://www.publicsurplus.com/sms/auction/view?auc=123",
      "https://dealer.example/vehicle.php?id=123",
    ])
      expect(sourceLinkLabel(url)).toBe("Original listing");
    expect(isSourceLandingPage(null)).toBe(false);
  });
});
