import { describe, it, expect } from "vitest";
import { mileageFromTitle } from "./index";

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
