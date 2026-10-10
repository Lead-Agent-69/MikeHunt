import { describe, expect, it } from "vitest";
import {
  similarListingDetails,
  similarListingTitle,
} from "./similar-listing-display";

describe("similar listing display", () => {
  it("does not repeat a trim already included in the model", () => {
    expect(
      similarListingTitle({
        year: 2022,
        make: "Chevrolet",
        model: "Silverado LTD",
        trim: "LTD",
      }),
    ).toBe("2022 Chevrolet Silverado LTD");
    expect(
      similarListingTitle({ model: "Silverado", trim: "Limited RST" }),
    ).toBe("Silverado Limited RST");
  });
  it("renders missing details explicitly, without empty commas or invented mileage", () => {
    expect(similarListingDetails({ location_state: "MO" })).toBe(
      "Mileage not reported · MO",
    );
    expect(similarListingDetails({ mileage: 0 })).toBe(
      "0 mi · Location not reported",
    );
    expect(
      similarListingDetails({
        mileage: 65261,
        location_city: "Dade City",
        location_state: "FL",
      }),
    ).toBe("65,261 mi · Dade City, FL");
  });
});
