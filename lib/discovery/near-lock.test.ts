import { describe, expect, it } from "vitest";
import { nearQueryLock } from "./near-lock";

describe("nearQueryLock", () => {
  it("does not cast 150 miles when a ZIP is present and no radius was asked", () => {
    expect(nearQueryLock({ zip: "77002" })).toEqual({ state: "TX", radius: 0 });
  });

  it("keeps an explicit radius inside the ZIP state", () => {
    expect(nearQueryLock({ zip: "77002", radiusParam: "150" })).toEqual({
      state: "TX",
      radius: 150,
    });
  });

  it("does not treat a bad ZIP as a nationwide search", () => {
    expect(nearQueryLock({ zip: "00000", homeState: "FL" })).toEqual({
      state: null,
      radius: 0,
    });
  });

  it("does not treat the untouched CA default as a state lock", () => {
    expect(
      nearQueryLock({ homeState: "CA", homeLat: null, homeLng: null }),
    ).toEqual({ state: null, radius: 0 });
  });

  it("locks to a saved home state without inventing a radius", () => {
    expect(
      nearQueryLock({ homeState: "fl", homeLat: 25.7, homeLng: -80.2 }),
    ).toEqual({ state: "FL", radius: 0 });
  });

  it("prefers the home ZIP state over a default home_state", () => {
    expect(nearQueryLock({ homeState: "CA", homeZip: "30301" })).toEqual({
      state: "GA",
      radius: 0,
    });
  });
});
