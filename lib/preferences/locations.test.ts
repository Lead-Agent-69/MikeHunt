import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_LOCATIONS,
  effectiveHome,
  effectiveSearchLocations,
  sanitizeLocationPatch,
} from "./locations";

const NOW = "2026-10-05T05:00:00.000Z";

describe("sanitizeLocationPatch", () => {
  it("keeps a clean home location and stamps updatedAt", () => {
    const out = sanitizeLocationPatch(
      {
        homeLocation: {
          state: "mo",
          city: " Springfield ",
          zip: "65806",
          radiusMi: 9000,
          extra: 1,
        },
      },
      NOW,
    );
    expect(out).toEqual({
      patch: {
        homeLocation: {
          state: "MO",
          city: "Springfield",
          zip: "65806",
          radiusMi: 500,
          updatedAt: NOW,
        },
      },
    });
  });

  it("rejects a home location without a real state, and allows an explicit clear", () => {
    expect(
      sanitizeLocationPatch({ homeLocation: { state: "XX" } }, NOW),
    ).toEqual({
      error: "homeLocation needs a valid US state",
    });
    expect(sanitizeLocationPatch({ homeLocation: null }, NOW)).toEqual({
      patch: { homeLocation: null },
    });
  });

  it("dedupes, drops junk, strips markup, and caps search locations", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      state: "TX",
      zip: String(75201 + i),
    }));
    const out = sanitizeLocationPatch(
      {
        searchLocations: [
          { state: "tx", zip: "75201", label: "<b>Dallas</b>" },
          { state: "TX", zip: "75201" },
          { state: "ZZ" },
          "nope",
          ...many,
        ],
      },
      NOW,
    );
    if ("error" in out) throw new Error(out.error);
    const list = out.patch.searchLocations as any[];
    expect(list).toHaveLength(MAX_SEARCH_LOCATIONS);
    expect(list[0]).toMatchObject({
      id: "TX|75201",
      state: "TX",
      zip: "75201",
      label: "bDallas/b",
      addedAt: NOW,
    });
    expect(new Set(list.map((l) => l.id)).size).toBe(list.length);
  });

  it("rejects a non-list searchLocations and leaves other keys alone", () => {
    expect(sanitizeLocationPatch({ searchLocations: "TX" }, NOW)).toEqual({
      error: "searchLocations must be a list",
    });
    expect(sanitizeLocationPatch({ carsState: "MO" }, NOW)).toEqual({
      patch: { carsState: "MO" },
    });
  });
});

describe("effective locations", () => {
  it("prefers homeLocation, then carsState, then buyerScope.state", () => {
    expect(
      effectiveHome({ homeLocation: { state: "IL" }, carsState: "MO" })?.state,
    ).toBe("IL");
    expect(effectiveHome({ carsState: "mo" })).toEqual({ state: "MO" });
    expect(effectiveHome({ buyerScope: { state: "KS" } })).toEqual({
      state: "KS",
    });
    expect(effectiveHome({})).toBeUndefined();
  });

  it("uses searchLocations, else legacy carsStates minus the home state", () => {
    expect(
      effectiveSearchLocations({ searchLocations: [{ state: "TX" }] }).map(
        (l) => l.state,
      ),
    ).toEqual(["TX"]);
    expect(
      effectiveSearchLocations({
        carsState: "MO",
        carsStates: ["MO", "IL", "KS"],
      }).map((l) => l.state),
    ).toEqual(["IL", "KS"]);
    expect(
      effectiveSearchLocations({ searchLocations: [], carsStates: ["IL"] }),
    ).toEqual([]);
  });
});
