import { describe, expect, it } from "vitest";
import {
  addSearchLocation,
  homeLocationFromForm,
  homeLocationPatch,
  legacyStatesMirror,
  locationLabel,
  removeSearchLocation,
  savedScopeStates,
  searchLocationsFromStates,
  searchLocationsPatch,
} from "./location-form";
import { sanitizeLocationPatch, type SearchLocation } from "./locations";

const NOW = "2026-10-05T06:00:00.000Z";

describe("homeLocationFromForm", () => {
  it("requires a state and a 5-digit ZIP when given", () => {
    expect(homeLocationFromForm({ state: "" })).toEqual({
      error: "Choose your home state.",
    });
    expect(homeLocationFromForm({ state: "TX", zip: "123" })).toEqual({
      error: "ZIP must be 5 digits.",
    });
  });

  it("builds a compact home and clamps the radius", () => {
    expect(
      homeLocationFromForm({
        state: "tx",
        city: "  Austin ",
        zip: "78701",
        radiusMi: "10",
      }),
    ).toEqual({
      home: { state: "TX", city: "Austin", zip: "78701", radiusMi: 25 },
    });
    expect(homeLocationFromForm({ state: "MO", radiusMi: "" })).toEqual({
      home: { state: "MO" },
    });
  });
});

describe("search markets", () => {
  const home = { state: "TX" };

  it("adds, dedupes, and refuses the bare home state", () => {
    const one = addSearchLocation(
      [],
      { state: "OK", radiusMi: 100 },
      home,
      NOW,
    );
    expect(one).toEqual({
      list: [{ id: "OK|", state: "OK", radiusMi: 100, addedAt: NOW }],
    });
    const list = (one as { list: SearchLocation[] }).list;
    expect(addSearchLocation(list, { state: "OK" }, home, NOW)).toEqual({
      error: "That market is already on your list.",
    });
    expect(addSearchLocation(list, { state: "TX" }, home, NOW)).toEqual({
      error: "TX is already your home market.",
    });
    expect(
      "list" in
        addSearchLocation(list, { state: "TX", zip: "77001" }, home, NOW),
    ).toBe(true);
  });

  it("caps the list at 10 markets", () => {
    const full = Array.from({ length: 10 }, (_, i) => ({
      id: `S${i}`,
      state: "CA",
      zip: String(90000 + i),
      addedAt: NOW,
    }));
    expect(addSearchLocation(full, { state: "NV" }, home, NOW)).toEqual({
      error: "You can save up to 10 search markets.",
    });
  });

  it("removes by id", () => {
    const list = [
      { id: "a", state: "OK", addedAt: NOW },
      { id: "b", state: "LA", addedAt: NOW },
    ];
    expect(removeSearchLocation(list, "a")).toEqual([list[1]]);
  });
});

describe("patches keep legacy mirrors in sync and pass Amy's sanitizer", () => {
  const search = [
    { id: "OK|", state: "OK", addedAt: NOW },
    { id: "TX|77001", state: "TX", zip: "77001", addedAt: NOW },
  ];

  it("mirrors carsStates as home first, then unique search states", () => {
    expect(legacyStatesMirror({ state: "TX" }, search)).toEqual(["TX", "OK"]);
    expect(legacyStatesMirror(null, search)).toEqual(["OK", "TX"]);
  });

  it("home patch writes homeLocation + carsState + carsStates", () => {
    const patch = homeLocationPatch({ state: "TX", zip: "78701" }, search);
    expect(patch).toEqual({
      homeLocation: { state: "TX", zip: "78701" },
      carsState: "TX",
      carsStates: ["TX", "OK"],
    });
    expect("patch" in sanitizeLocationPatch(patch, NOW)).toBe(true);
    expect(homeLocationPatch(null, search)).toEqual({
      homeLocation: null,
      carsState: "",
      carsStates: ["OK", "TX"],
    });
  });

  it("search patch writes searchLocations + carsStates", () => {
    const patch = searchLocationsPatch({ state: "TX" }, search);
    expect(patch.carsStates).toEqual(["TX", "OK"]);
    const out = sanitizeLocationPatch(patch, NOW);
    expect("patch" in out && out.patch.searchLocations).toEqual(search);
  });
});

it("labels locations for chips", () => {
  expect(
    locationLabel({ state: "TX", city: "Austin", zip: "78701", radiusMi: 100 }),
  ).toBe("Austin, TX 78701 · 100 mi");
  expect(locationLabel({ state: "OK" })).toBe("OK");
});

describe("searchLocationsFromStates (nav chip picks)", () => {
  const existing = [
    { id: "OK|73101", state: "OK", zip: "73101", radiusMi: 100, addedAt: NOW },
    { id: "LA|", state: "LA", addedAt: NOW },
  ];

  it("keeps saved entries for picked states, adds new ones, drops unpicked and home", () => {
    expect(
      searchLocationsFromStates(
        ["TX", "OK", "ar", "ZZ"],
        { state: "TX" },
        existing,
        NOW,
      ),
    ).toEqual([existing[0], { id: "AR|", state: "AR", addedAt: NOW }]);
  });

  it("caps at 10 markets", () => {
    const states = [
      "AL",
      "AK",
      "AZ",
      "AR",
      "CA",
      "CO",
      "CT",
      "DE",
      "FL",
      "GA",
      "HI",
    ];
    expect(searchLocationsFromStates(states, null, [], NOW)).toHaveLength(10);
  });
});

describe("savedScopeStates (feed / Discover / chip scope)", () => {
  it("prefers the carsStates mirror, including an explicit all-states []", () => {
    expect(
      savedScopeStates({
        carsStates: ["MO", "KS"],
        homeLocation: { state: "TX" },
      }),
    ).toEqual(["MO", "KS"]);
    expect(
      savedScopeStates({ carsStates: [], homeLocation: { state: "TX" } }),
    ).toEqual([]);
  });

  it("falls back to home + search locations when no mirror was written", () => {
    expect(
      savedScopeStates({
        homeLocation: { state: "TX" },
        searchLocations: [{ id: "OK|", state: "OK", addedAt: NOW }],
      }),
    ).toEqual(["TX", "OK"]);
  });

  it("returns undefined when nothing location-related is saved", () => {
    expect(savedScopeStates({ carsState: "MO" })).toBeUndefined();
    expect(savedScopeStates(null)).toBeUndefined();
  });
});
