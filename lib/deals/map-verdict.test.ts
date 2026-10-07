import { describe, expect, it } from "vitest";
import { parseMapVerdicts } from "./map-verdict";

describe("parseMapVerdicts", () => {
  it("defaults missing / actionable to go+hold (trust-gate demotes GO→HOLD)", () => {
    expect(parseMapVerdicts(null)).toEqual({
      mode: "in",
      values: ["go", "hold"],
    });
    expect(parseMapVerdicts("actionable")).toEqual({
      mode: "in",
      values: ["go", "hold"],
    });
    expect(parseMapVerdicts("")).toEqual({
      mode: "in",
      values: ["go", "hold"],
    });
  });

  it("keeps a single verdict as eq", () => {
    expect(parseMapVerdicts("go")).toEqual({ mode: "eq", values: ["go"] });
    expect(parseMapVerdicts("hold")).toEqual({ mode: "eq", values: ["hold"] });
  });

  it("accepts comma lists and all", () => {
    expect(parseMapVerdicts("go,hold")).toEqual({
      mode: "in",
      values: ["go", "hold"],
    });
    expect(parseMapVerdicts("all")).toEqual({ mode: "all", values: [] });
  });

  it("falls back to actionable on garbage", () => {
    expect(parseMapVerdicts("nope")).toEqual({
      mode: "in",
      values: ["go", "hold"],
    });
  });
});
