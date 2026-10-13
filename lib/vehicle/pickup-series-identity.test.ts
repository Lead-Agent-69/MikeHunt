import { describe, expect, it } from "vitest";
import { pickupSeriesIdentity } from "./pickup-series-identity";

describe("reported pickup series identity", () => {
  it.each(["Silverado 3500 HD WT", "SILVERADO3500HDWT", "Silverado-3500-HD"])(
    "preserves the reported 3500 series in %s",
    (title) => {
      expect(
        pickupSeriesIdentity({ make: "Chevrolet", model: "Silverado", title }),
      ).toEqual({ family: "Silverado", series: "3500", conflicting: false });
    },
  );
  it("handles structured models and explicit numeric trims", () => {
    expect(
      pickupSeriesIdentity({ make: "GMC", model: "Sierra 2500HD" })?.series,
    ).toBe("2500");
    expect(
      pickupSeriesIdentity({
        make: "Chevrolet",
        model: "Silverado",
        trim: "1500",
      })?.series,
    ).toBe("1500");
  });
  it.each([
    "Silverado with $3500 down payment",
    "2018 Silverado price $1500",
    "Silverado with 2500 miles",
    "Silverado 35000",
  ])("does not infer the truck series from unrelated amounts: %s", (title) => {
    expect(
      pickupSeriesIdentity({ make: "Chevrolet", model: "Silverado", title })
        ?.series,
    ).toBeNull();
  });
  it("marks conflicting title and structured model evidence", () => {
    expect(
      pickupSeriesIdentity({
        make: "Chevrolet",
        model: "Silverado 1500",
        title: "Silverado 3500HD",
      })?.conflicting,
    ).toBe(true);
  });
  it("does not classify other makes or models as this truck family", () => {
    expect(
      pickupSeriesIdentity({
        make: "Ford",
        model: "F-150",
        title: "Silverado 3500HD",
      }),
    ).toBeNull();
    expect(
      pickupSeriesIdentity({
        make: "Chevrolet",
        model: "Suburban",
        title: "3500",
      }),
    ).toBeNull();
  });
});
