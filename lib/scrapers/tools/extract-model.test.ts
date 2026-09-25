import { describe, it, expect } from "vitest";
import { extractModel } from "./deal-normalizer";

describe("extractModel — multi-word models pool with their comps", () => {
  it("joins known multi-word models (the truncation bug)", () => {
    expect(extractModel("2021 Jeep Grand Cherokee Limited", "Jeep")).toBe(
      "Grand Cherokee",
    );
    expect(extractModel("2022 Tesla Model 3 Long Range", "Tesla")).toBe(
      "Model 3",
    );
    expect(extractModel("2020 Tesla Model Y Performance", "Tesla")).toBe(
      "Model Y",
    );
    expect(extractModel("2019 Hyundai Santa Fe SEL", "Hyundai")).toBe(
      "Santa Fe",
    );
    expect(extractModel("2018 Dodge Grand Caravan SXT", "Dodge")).toBe(
      "Grand Caravan",
    );
  });

  it("does NOT over-capture trim on single-word models", () => {
    expect(extractModel("2020 Chevrolet Silverado LT", "Chevrolet")).toBe(
      "Silverado",
    );
    expect(extractModel("2021 Ford F-150 XLT", "Ford")).toBe("F-150");
    expect(extractModel("2019 Honda Accord Sport", "Honda")).toBe("Accord");
    expect(extractModel("2022 Ram 1500 Big Horn", "Ram")).toBe("1500");
  });

  it("returns undefined when title/make missing", () => {
    expect(extractModel("", "Ford")).toBeUndefined();
    expect(extractModel("2020 Ford F-150", "")).toBeUndefined();
  });
});
