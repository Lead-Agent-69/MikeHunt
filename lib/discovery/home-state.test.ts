import { describe, expect, it } from "vitest";
import { discoverHomeState } from "./home-state";

describe("discoverHomeState", () => {
  it("prefers prefs.homeLocation over the profile column", () => {
    expect(discoverHomeState({ state: "tx", zip: "77002" }, "CA")).toBe("TX");
  });
  it("falls back to the profile home_state", () => {
    expect(discoverHomeState(undefined, "fl")).toBe("FL");
    expect(discoverHomeState({ state: "ZZ" }, "MO")).toBe("MO");
  });
  it("returns empty for no usable state", () => {
    expect(discoverHomeState(null, "NA")).toBe("");
    expect(discoverHomeState(undefined, "")).toBe("");
  });
});
