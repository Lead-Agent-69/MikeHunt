import { describe, expect, it } from "vitest";
import { CURATED_SITES } from "./curated-sites";
import {
  CURATED_RING_SIZE,
  curatedRingStates,
  scopeDemandStates,
  selectCuratedSitesForDemand,
} from "./curated-rotation";
import {
  demandStatesFromPrefs,
  locationDemandSourceIds,
} from "@/lib/preferences/kick-location-demand";

const empty = { version: 1 as const, lastAttempted: {} as Record<string, number> };

describe("per-state curated demand ring", () => {
  it("reads the state(s) a location-demand kick put on the job scope", () => {
    expect(scopeDemandStates({ state: "ks" })).toEqual(["KS"]);
    expect(scopeDemandStates({ state: "KS", states: ["OK", "KS", "x"] })).toEqual(["OK", "KS"]);
    expect(scopeDemandStates(undefined)).toEqual([]);
  });

  it("puts the demanded states first, then their nearest neighbours", () => {
    const ring = curatedRingStates(["KS"]);
    expect(ring[0]).toBe("KS");
    expect(ring).toHaveLength(CURATED_RING_SIZE);
    expect(ring).toContain("MO");
  });

  it("crawls only the ring, demanded state first, even when other dealers are older in rotation", () => {
    const sites = [
      { url: "https://fl.example", state: "FL" },
      { url: "https://mo.example", state: "MO" },
      { url: "https://ks.example", state: "KS" },
      { url: "https://national.example" },
    ];
    const rotation = { version: 1 as const, lastAttempted: { "ks.example": 999 } };
    const picked = selectCuratedSitesForDemand(sites, rotation, ["KS"]);
    expect(picked.map((s) => s.url)).toEqual(["https://ks.example", "https://mo.example"]);
  });

  it("a newly added dealer joins its state's ring by its state tag alone", () => {
    const added = { url: "https://brand-new-yard.example", state: "TN" };
    const picked = selectCuratedSitesForDemand([...CURATED_SITES, added], empty, ["TN"]);
    // In-state dealers come first; the new one is among them without any other wiring.
    const firstOutOfState = picked.findIndex((s) => s.state !== "TN");
    const at = picked.indexOf(added);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(firstOutOfState === -1 || at < firstOutOfState).toBe(true);
  });

  it("every demanded state reaches at least one curated dealer through its ring or the rotation", () => {
    const states = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
    for (const st of states)
      expect(selectCuratedSitesForDemand(CURATED_SITES, empty, [st]).length).toBeGreaterThan(0);
  });

  it("home + saved-search states are what the preferences kick puts on the job", () => {
    expect(
      demandStatesFromPrefs({
        homeLocation: { state: "TN", zip: "37203" },
        searchLocations: [{ state: "KY" }],
      } as never),
    ).toEqual(["KY", "TN"]);
  });

  it("the state-populate kick includes the curated dealer crawl", () => {
    const prev = process.env.SCRAPE_SOURCES;
    delete process.env.SCRAPE_SOURCES;
    try {
      expect(locationDemandSourceIds()).toContain("curated_dealers");
    } finally {
      if (prev !== undefined) process.env.SCRAPE_SOURCES = prev;
    }
  });
});
