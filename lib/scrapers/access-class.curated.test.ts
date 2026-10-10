import { describe, expect, it } from "vitest";
import { CURATED_SITES } from "./curated-sites";
import { OPERATOR_RESTORED_HOSTS, SITE_POLICY_BLOCKS } from "./source-compliance";
import { grandfatheredHosts } from "./polite/robots-exempt";
import {
  RESTRICTED_HOSTS,
  accessClassFor,
  curatedHosts,
  isCuratedHost,
  photoCacheAllowed,
} from "./access-class";

const hostOf = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, "");
const blockedOrRestored = (h: string) =>
  [
    ...OPERATOR_RESTORED_HOSTS,
    ...grandfatheredHosts(),
    ...Object.keys(SITE_POLICY_BLOCKS),
    ...RESTRICTED_HOSTS,
  ].some(
    (b) => h === b || h.endsWith(`.${b}`),
  );

describe("Ren #312 P1: independent_dealer is allowed only on curated hosts", () => {
  it("reads every curated-sites.ts host", () => {
    expect(curatedHosts().length).toBeGreaterThanOrEqual(100);
    for (const s of CURATED_SITES) expect(isCuratedHost(s.url)).toBe(true);
  });

  it("a curated host stored as independent_dealer is allowed and cacheable (unless blocked, restored or grandfathered)", () => {
    // Official API hosts (access-class.ts API_HOSTS) outrank the dealer rule and stay "api", also cacheable.
    const apiHosts = ["gsaauctions.gov", "api.gsa.gov", "ppms.gov"];
    let checked = 0;
    for (const s of CURATED_SITES) {
      const h = hostOf(s.url);
      if (blockedOrRestored(h)) continue;
      const row = { source: "independent_dealer", source_url: `https://www.${h}/inventory/1` };
      expect({ h, c: accessClassFor(row), p: photoCacheAllowed(row) }).toEqual({
        h,
        c: apiHosts.includes(h) ? "api" : "allowed",
        p: true,
      });
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("any other host stored as independent_dealer is unreviewed and not cacheable", () => {
    for (const url of [
      "https://random-dealer.example/cars/1",
      "https://some-auto-sales.com/vdp/123",
      "https://glensautosales.com.evil.example/a", // curated name as a label of another host
      "https://notglensautosales.com/a", // suffix without a dot boundary
      "not a url",
      "",
    ]) {
      const row = { source: "independent_dealer", source_url: url };
      expect({ url, c: accessClassFor(row) }).toEqual({ url, c: "unreviewed" });
      expect(photoCacheAllowed(row)).toBe(false);
    }
  });

  it("carparts.com is restricted under any source, and never cacheable", () => {
    for (const source of ["independent_dealer", "unknown", "web-share", "carparts_com"]) {
      for (const url of ["https://www.carparts.com/p/1", "https://shop.carparts.com/x"]) {
        const row = { source, source_url: url };
        expect({ source, url, c: accessClassFor(row) }).toEqual({ source, url, c: "restricted" });
        expect(photoCacheAllowed(row)).toBe(false);
      }
    }
    expect(CURATED_SITES.some((s) => hostOf(s.url) === "carparts.com")).toBe(false);
  });
});
