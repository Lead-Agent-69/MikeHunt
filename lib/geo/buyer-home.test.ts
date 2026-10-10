import { describe, expect, it } from "vitest";
import {
  buyerHomeFromPrefs,
  resolveBuyerHome,
  validCoords,
} from "./buyer-home";

describe("resolveBuyerHome", () => {
  it("uses prefs.homeLocation state and an agreeing ZIP", () => {
    expect(
      resolveBuyerHome({ prefsHomeLocation: { state: "mo", zip: "63101" } }),
    ).toEqual({ state: "MO", zip: "63101", from: "prefs" });
  });

  it("drops a prefs ZIP that disagrees with the chosen state", () => {
    const home = resolveBuyerHome({
      prefsHomeLocation: { state: "MO", zip: "77002" },
    });
    expect(home).toEqual({ state: "MO", from: "prefs" });
  });

  it("takes prefs lat/lng when present", () => {
    expect(
      resolveBuyerHome({
        prefsHomeLocation: { state: "MO", lat: 38.627, lng: -90.199 },
      }),
    ).toMatchObject({ state: "MO", lat: 38.627, lng: -90.199 });
  });

  it("uses the profile pin only when it is in the prefs home state", () => {
    const pin = { home_state: "MO", home_lat: 38.6, home_lng: -90.2 };
    expect(
      resolveBuyerHome({ prefsHomeLocation: { state: "MO" }, profile: pin }),
    ).toMatchObject({ state: "MO", lat: 38.6, lng: -90.2 });
    const moved = resolveBuyerHome({
      prefsHomeLocation: { state: "KS" },
      profile: pin,
    });
    expect(moved).toEqual({ state: "KS", from: "prefs" });
  });

  it("prefs home wins over a different legacy profile state", () => {
    expect(
      resolveBuyerHome({
        prefsHomeLocation: { state: "IL" },
        profile: { home_state: "TX" },
      })?.state,
    ).toBe("IL");
  });

  it("falls back to legacy profile ZIP, then home_state", () => {
    expect(
      resolveBuyerHome({ profile: { home_state: "TX", home_zip: "63101" } }),
    ).toEqual({ state: "MO", zip: "63101", from: "profile" });
    expect(resolveBuyerHome({ profile: { home_state: "fl" } })).toEqual({
      state: "FL",
      from: "profile",
    });
  });

  it("never treats the untouched CA column default as a home", () => {
    expect(resolveBuyerHome({ profile: { home_state: "CA" } })).toBeNull();
    // A CA ZIP or a pin means the user really set it.
    expect(
      resolveBuyerHome({ profile: { home_state: "CA", home_zip: "94103" } })
        ?.state,
    ).toBe("CA");
    expect(
      resolveBuyerHome({
        profile: { home_state: "CA", home_lat: 37.77, home_lng: -122.42 },
      }),
    ).toMatchObject({ state: "CA", lat: 37.77, lng: -122.42 });
  });

  it("returns null with nothing saved (guest / no prefs) — no TX or CA default", () => {
    expect(resolveBuyerHome({})).toBeNull();
    expect(
      resolveBuyerHome({ prefsHomeLocation: null, profile: null }),
    ).toBeNull();
    expect(resolveBuyerHome({ prefsHomeLocation: { state: "ZZ" } })).toBeNull();
    expect(resolveBuyerHome({ profile: { home_state: "NA" } })).toBeNull();
  });
});

describe("validCoords", () => {
  it("rejects null island, out-of-range and blanks", () => {
    expect(validCoords(0, 0)).toBeNull();
    expect(validCoords(91, 10)).toBeNull();
    expect(validCoords("", -90)).toBeNull();
    expect(validCoords(null, -90)).toBeNull();
    expect(validCoords("38.6", "-90.2")).toEqual({ lat: 38.6, lng: -90.2 });
  });
});

describe("buyerHomeFromPrefs", () => {
  it("reads homeLocation, then legacy carsState", () => {
    expect(
      buyerHomeFromPrefs({ homeLocation: { state: "MO", zip: "63101" } }),
    ).toEqual({ state: "MO", zip: "63101", from: "prefs" });
    expect(buyerHomeFromPrefs({ carsState: "ok" })).toEqual({
      state: "OK",
      from: "prefs",
    });
  });

  it("is null for guests and empty prefs", () => {
    expect(buyerHomeFromPrefs(null)).toBeNull();
    expect(buyerHomeFromPrefs({})).toBeNull();
  });
});
