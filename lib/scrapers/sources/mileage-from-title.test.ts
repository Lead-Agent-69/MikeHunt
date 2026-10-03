import { describe, it, expect } from "vitest";
import {
  extractAeOfMiamiVinFromHtml,
  mileageFromDealerText,
  mileageFromTitle,
} from "./index";

describe("mileageFromTitle", () => {
  it("parses the common Craigslist title mileage formats", () => {
    expect(mileageFromTitle("2015 Ford F-150 XLT 90k miles")).toBe(90000);
    expect(mileageFromTitle("Honda Accord EX 90k")).toBe(90000);
    expect(mileageFromTitle("2012 Camry - 143,250 miles")).toBe(143250);
    expect(mileageFromTitle("Silverado 1500 85000 mi")).toBe(85000);
    expect(mileageFromTitle("2018 Civic 45k mi clean title")).toBe(45000);
  });

  it("does not misread a price as mileage", () => {
    // $15k is a price, not miles — and there's no real odometer in the title.
    expect(mileageFromTitle("2015 Ford F-150 $15k OBO")).toBeUndefined();
    expect(mileageFromTitle("Clean truck only $12,000")).toBeUndefined();
  });

  it("ignores out-of-range / absent numbers", () => {
    expect(mileageFromTitle("2015 Ford F-150 XLT")).toBeUndefined();
    expect(mileageFromTitle("")).toBeUndefined();
    expect(mileageFromTitle(null)).toBeUndefined();
    // 900k miles is implausible → rejected
    expect(mileageFromTitle("Project car 900k miles")).toBeUndefined();
  });
});

describe("mileageFromDealerText", () => {
  it("parses dealer API odometer strings without mi/miles suffixes", () => {
    expect(mileageFromDealerText("61,692 Actual")).toBe(61692);
    expect(mileageFromDealerText("88750 ACT")).toBe(88750);
    expect(mileageFromDealerText("45,200 odometer")).toBe(45200);
  });

  it("rejects uncertain and implausible dealer odometer strings", () => {
    expect(mileageFromDealerText("Not Actual")).toBeUndefined();
    expect(mileageFromDealerText("Unknown")).toBeUndefined();
    expect(mileageFromDealerText("Stock L06591")).toBeUndefined();
    expect(mileageFromDealerText("900,000 Actual")).toBeUndefined();
    expect(
      mileageFromDealerText("2023 GMC Terrain Vehicle Details"),
    ).toBeUndefined();
  });
});

describe("extractAeOfMiamiVinFromHtml", () => {
  it("extracts the real VIN from AE vehicle detail descriptions", () => {
    const html = `
      <div id="ActionCard">
        <h3>Vehicle Details</h3>
        <p><strong>2022 Lincoln Corsair - Sport Utility 4D - FWD - 5LMCJ1C96NUL06591<br /></strong></p>
      </div>
    `;

    expect(extractAeOfMiamiVinFromHtml(html)).toBe("5LMCJ1C96NUL06591");
  });

  it("ignores random 17-character page tokens that are not valid VINs", () => {
    expect(
      extractAeOfMiamiVinFromHtml("asset zVg5gWU0CEnA2KMat loaded"),
    ).toBeNull();
  });

  it("can recover a valid VIN from raw dealer HTML even when text is noisy", () => {
    const html = `
      <div>VIN Stock Title Lots of labels 2023 GMC Terrain 3GKALMEG7PL239037 contact us</div>
    `;

    expect(extractAeOfMiamiVinFromHtml(html)).toBe("3GKALMEG7PL239037");
  });
});
