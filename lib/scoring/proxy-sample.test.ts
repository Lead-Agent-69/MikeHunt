import { describe, expect, it } from "vitest";
import { requireProxySample } from "./proxy-sample";

describe("proxy regression evidence", () => {
  it("rejects empty or small samples instead of reporting zero error", () => {
    expect(() => requireProxySample([])).toThrow("Insufficient");
    expect(() => requireProxySample(Array(49).fill(0))).toThrow("Insufficient");
  });
  it("rejects invalid observations and sample limits", () => {
    expect(() => requireProxySample([NaN], 1)).toThrow("Invalid");
    expect(() => requireProxySample([Infinity], 1)).toThrow("Invalid");
    expect(() => requireProxySample([-1], 1)).toThrow("Invalid");
    expect(() => requireProxySample([], 0)).toThrow("Invalid");
  });
  it("accepts sufficient valid evidence without claiming transaction accuracy", () => {
    expect(() => requireProxySample(Array(50).fill(0.1))).not.toThrow();
  });
});
