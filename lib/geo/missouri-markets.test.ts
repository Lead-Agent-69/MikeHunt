import { describe, expect, it } from "vitest";
import {
  MISSOURI_SEARCH_MARKETS,
  MISSOURI_SEARCH_ZIPS,
} from "./missouri-markets";
import { CRAIGSLIST_SITES } from "@/lib/geo";
import { zipToState } from "./zip-state";
import { metroZipsForState } from "./metro-zips";

describe("Missouri regional coverage", () => {
  it("covers rural regions in addition to the three largest metros", () => {
    expect(MISSOURI_SEARCH_MARKETS.map((market) => market.city)).toEqual([
      "St. Louis",
      "Kansas City",
      "Springfield",
      "Columbia",
      "Joplin",
      "Kirksville",
      "Osage Beach",
      "Cape Girardeau",
      "St. Joseph",
      "Hannibal",
      "Kennett",
      "Rolla",
      "West Plains",
      "Sedalia",
      "Nevada",
      "Maryville",
      "Chillicothe",
    ]);
    expect(new Set(MISSOURI_SEARCH_ZIPS).size).toBe(17);
    for (const zip of MISSOURI_SEARCH_ZIPS) expect(zipToState(zip)).toBe("MO");
  });
  it("keeps bounded sweeps rotating through every anchor without widening the state", () => {
    const visited = new Set<string>();
    for (let offset = 0; offset < MISSOURI_SEARCH_ZIPS.length; offset += 2) {
      const batch = metroZipsForState("MO", 2, offset);
      expect(batch).toHaveLength(2);
      batch.forEach((zip) => visited.add(zip));
    }
    expect(Array.from(visited).sort()).toEqual(
      [...MISSOURI_SEARCH_ZIPS].sort(),
    );
  });
  it("includes all nine officially listed Missouri Craigslist regions exactly once", () => {
    expect(
      CRAIGSLIST_SITES.filter((site) => site.state === "MO")
        .map((site) => site.site)
        .sort(),
    ).toEqual([
      "columbiamo",
      "joplin",
      "kansascity",
      "kirksville",
      "loz",
      "semo",
      "springfield",
      "stjoseph",
      "stlouis",
    ]);
  });
});
