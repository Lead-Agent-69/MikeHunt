import { describe, expect, it } from "vitest";
import { nearQueryLock } from "./near-lock";

describe("nearQueryLock", () => {
  it("does not cast 150 miles when a ZIP is present and no radius was asked", () => {
    expect(nearQueryLock({ zip: "77002" })).toMatchObject({ state: "TX", radius: 0 });
  });

  it("keeps an explicit radius inside the ZIP state", () => {
    expect(nearQueryLock({ zip: "77002", radiusParam: "150" })).toMatchObject({
      state: "TX",
      radius: 150,
    });
  });

  it("does not treat a bad ZIP as a nationwide search", () => {
    expect(nearQueryLock({ zip: "00000", homeState: "FL" })).toMatchObject({
      state: null,
      radius: 0,
    });
  });

  it("does not treat the untouched CA default as a state lock", () => {
    expect(
      nearQueryLock({ homeState: "CA", homeLat: null, homeLng: null }),
    ).toMatchObject({ state: null, radius: 0 });
  });

  it("locks to a saved home state without inventing a radius", () => {
    expect(
      nearQueryLock({ homeState: "fl", homeLat: 25.7, homeLng: -80.2 }),
    ).toMatchObject({ state: "FL", radius: 0 });
  });

  it("prefers the home ZIP state over a default home_state", () => {
    expect(nearQueryLock({ homeState: "CA", homeZip: "30301" })).toMatchObject({
      state: "GA",
      radius: 0,
    });
  });
});

describe("nearQueryLock prefs.homeLocation", () => {
  it("prefers prefs.homeLocation over profile columns", () => {
    expect(
      nearQueryLock({
        prefsHomeLocation: { state: "TX", zip: "77002" },
        homeState: "FL",
        homeZip: "33101",
      }),
    ).toEqual({ state: "TX", radius: 0, from: "prefs", homeZip: "77002" });
  });

  it("uses the prefs state even when its ZIP disagrees (ZIP dropped)", () => {
    expect(
      nearQueryLock({ prefsHomeLocation: { state: "TX", zip: "33101" } }),
    ).toEqual({ state: "TX", radius: 0, from: "prefs" });
  });

  it("a query ZIP still beats prefs", () => {
    expect(
      nearQueryLock({ zip: "30301", prefsHomeLocation: { state: "TX" } }),
    ).toMatchObject({ state: "GA", from: "zip" });
  });

  it("ignores an invalid prefs home and falls back to the profile", () => {
    expect(
      nearQueryLock({ prefsHomeLocation: { state: "ZZ" }, homeState: "FL", homeLat: 1, homeLng: 2 }),
    ).toMatchObject({ state: "FL", from: "profile" });
  });
});
