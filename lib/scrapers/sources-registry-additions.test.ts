import { describe, expect, it } from "vitest";
import {
  OFFICIAL_API_SOURCES,
  OPEN_GOV_EXTRA_SOURCES,
  RESEARCHED_SITES_2026_10_10,
  SOURCES_MASTER_ADDITIONS,
} from "./sources-registry-additions";
import {
  AGGREGATORS,
  ALL_SOURCES,
  DEALER_PLATFORMS,
  GOVERNMENT_SOURCES,
  INDEPENDENT_DEALERS,
  ONLINE_MARKETPLACES,
  PARTS_SOURCES,
  SALVAGE_AUCTIONS,
} from "./sources-registry";
import { CURATED_SITES } from "./curated-sites";

const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");

describe("sources-master additions (2026-10-10)", () => {
  it("are all in ALL_SOURCES with unique ids", () => {
    const ids = ALL_SOURCES.map((s) => s.id.replace(/_/g, "-"));
    expect(new Set(ids).size).toBe(ids.length);
    const all = new Set(ALL_SOURCES.map((s) => s.id));
    for (const s of SOURCES_MASTER_ADDITIONS) expect(all.has(s.id)).toBe(true);
  });

  it("stay catalog-only: nothing new runs without an operator", () => {
    expect(SOURCES_MASTER_ADDITIONS.length).toBeGreaterThanOrEqual(30);
    expect(
      SOURCES_MASTER_ADDITIONS.every(
        (s) => s.status === "planned" || s.status === "disabled",
      ),
    ).toBe(true);
  });

  it("registers the SC and VT AssetWorks storefronts as deep links to official state pages", () => {
    const scvt = OPEN_GOV_EXTRA_SOURCES.filter((s) =>
      ["SC", "VT"].includes(s.states?.[0] ?? ""),
    );
    expect(scvt).toHaveLength(2);
    for (const s of scvt) {
      expect(s.notes).toMatch(/Deep link only/);
      expect(host(s.url)).toMatch(/\.(sc|vermont)\.gov$/);
    }
  });

  it("never points a registered URL at a gated venue", () => {
    for (const s of OPEN_GOV_EXTRA_SOURCES) {
      expect(s.url).not.toMatch(
        /govdeals|copart|publicsurplus|hibid|bidadoo|oaikc/i,
      );
    }
  });

  it("lists the licensed API paths", () => {
    expect(OFFICIAL_API_SOURCES.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        "gsa-auctions-api",
        "ebay-browse-api",
        "auto-dev-listings",
        "marketcheck-inventory",
      ]),
    );
  });

  it("doesn't duplicate a host already catalogued or curated", () => {
    const before = new Set(
      [
        ...SALVAGE_AUCTIONS,
        ...INDEPENDENT_DEALERS,
        ...GOVERNMENT_SOURCES,
        ...ONLINE_MARKETPLACES,
        ...DEALER_PLATFORMS,
        ...PARTS_SOURCES,
        ...AGGREGATORS,
        ...CURATED_SITES,
      ].map((s) => host(s.url)),
    );
    expect(
      RESEARCHED_SITES_2026_10_10.filter((s) => before.has(host(s.url))),
    ).toEqual([]);
  });
});
