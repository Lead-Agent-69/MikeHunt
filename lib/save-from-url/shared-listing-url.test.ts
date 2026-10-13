import { describe, expect, it } from "vitest";
import { sharedListingUrl } from "./shared-listing-url";

describe("shared listing links", () => {
  it.each([
    ["https://seller.example/car/1", "https://seller.example/car/1"],
    [
      "https://seller.example/car/1\nA great truck",
      "https://seller.example/car/1",
    ],
    [
      "Found this truck: https://seller.example/car/1 under budget",
      "https://seller.example/car/1",
    ],
    ["<https://seller.example/car/1>", "https://seller.example/car/1"],
    [
      "HTTPS://seller.example/car/1?trim=crew&year=2020",
      "https://seller.example/car/1?trim=crew&year=2020",
    ],
  ])(
    "extracts a URL rather than posting shared prose: %s",
    (input, expected) => {
      expect(sharedListingUrl(input)).toBe(expected);
    },
  );
  it.each([
    undefined,
    "",
    "No vehicle link",
    "http-not-a-link",
    "javascript:alert(1)",
    "file:///car",
    "https://",
    "https://user:secret@seller.example/car",
  ])("rejects an invalid share: %s", (input) =>
    expect(sharedListingUrl(input)).toBeNull(),
  );
  it("falls through invalid URL and text fields to a usable title link", () => {
    expect(
      sharedListingUrl(
        "http-not-a-link",
        "No link here",
        "Truck https://seller.example/car/2",
      ),
    ).toBe("https://seller.example/car/2");
  });
  it("prefers the explicit shared URL", () => {
    expect(
      sharedListingUrl(
        "https://seller.example/car/1",
        "https://seller.example/car/2",
      ),
    ).toBe("https://seller.example/car/1");
  });
});
