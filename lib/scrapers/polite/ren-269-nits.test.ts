/**
 * Ren's #269 review findings. None of these stop a source:
 *  1. robots Crawl-delay is the minimum gap even for grandfathered (exempt) hosts; disallow is not applied.
 *  2. registry rateLimit (Copart/IAA 2 per 60s) is a per-domain gap floor in DomainLimiter.
 *  3. static exemptions are source-plus-path: ebay-sold does not exempt ebay_motors.
 *  4. photos are copied to Storage only for api/allowed sources.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DomainLimiter } from "./limiter";
import { MemoryPageCache } from "./cache";
import { PoliteCrawler, politeGate, resetPoliteCrawler } from "./polite-fetch";
import {
  isRobotsExemptUrl,
  pathMatches,
  resetRecentProducers,
  setRecentProducers,
} from "./robots-exempt";
import { withPoliteSource } from "./source-context";
import {
  buildDomainGapFloors,
  rateLimitGapMs,
  registryGapFloorMs,
} from "./source-limits";
import { accessClassFor, photoCacheAllowed } from "../access-class";

const prevMode = process.env.SCRAPER_POLITE_MODE;
afterEach(() => {
  if (prevMode === undefined) delete process.env.SCRAPER_POLITE_MODE;
  else process.env.SCRAPER_POLITE_MODE = prevMode;
  resetPoliteCrawler();
  resetRecentProducers();
});

function crawler(routes: Record<string, () => Response>, seen: string[]) {
  const limiter = new DomainLimiter({
    sleep: async () => {},
    minGapMs: 0,
    random: () => 0,
    now: () => 0,
    domainFloorMs: () => 0,
  });
  return new PoliteCrawler({
    fetchImpl: async (url) => {
      seen.push(url);
      const h = routes[new URL(url).pathname];
      return h ? h() : new Response("ok", { status: 200 });
    },
    sleep: async () => {},
    random: () => 0,
    now: () => 0,
    limiter,
    cache: new MemoryPageCache(),
  });
}

describe("1. Crawl-delay applies to exempt hosts (disallow does not)", () => {
  it("politeFetch on a grandfathered host reads Crawl-delay, ignores Disallow", async () => {
    const seen: string[] = [];
    const c = crawler(
      {
        "/robots.txt": () =>
          new Response("User-agent: *\nCrawl-delay: 12\nDisallow: /"),
      },
      seen,
    );
    const res = await c.fetch("https://www.recar.com/vehicles/");
    expect(res.ok).toBe(true);
    expect(res.skipped).toBeUndefined();
    expect(seen.some((u) => u.endsWith("/robots.txt"))).toBe(true);
    expect(c.limiter.baseGapMs("recar.com")).toBe(12_000);
  });

  it("politeGate (legacy request path) also takes the Crawl-delay", async () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    const c = crawler(
      {
        "/robots.txt": () =>
          new Response("User-agent: *\nCrawl-delay: 7\nDisallow: /"),
      },
      [],
    );
    resetPoliteCrawler(c);
    const out = await politeGate(
      "https://www.cargurus.com/Cars/x",
      async () => ({ status: 200 }),
      (r) => r.status,
    );
    expect(out.status).toBe(200);
    expect(c.limiter.baseGapMs("cargurus.com")).toBe(7_000);
  });

  it("a 403 on robots.txt for an exempt host adds no breaker strike and does not stop the request", async () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    const c = crawler(
      { "/robots.txt": () => new Response("", { status: 403 }) },
      [],
    );
    resetPoliteCrawler(c);
    for (let i = 0; i < 4; i++) {
      (c as any).robots.clear();
      await politeGate(
        "https://www.recar.com/v",
        async () => ({ status: 200 }),
        (r) => r.status,
      );
    }
    expect(c.breaker.isOpen("recar.com")).toBe(false);
  });
});

describe("2. registry rateLimit is a per-domain gap floor", () => {
  it("2 per 60s = 30s; bad limits = 0", () => {
    expect(rateLimitGapMs({ requests: 2, perMs: 60_000 })).toBe(30_000);
    expect(rateLimitGapMs({ requests: 0, perMs: 60_000 })).toBe(0);
    expect(rateLimitGapMs(undefined)).toBe(0);
  });

  it("Copart and IAA get their registry gap; unknown hosts get none", () => {
    expect(registryGapFloorMs("copart.com")).toBe(30_000);
    expect(registryGapFloorMs("iaai.com")).toBe(30_000);
    expect(registryGapFloorMs("brand-new-dealer.example")).toBe(0);
  });

  it("the slowest source on a shared host wins, and the limiter uses it", () => {
    const floors = buildDomainGapFloors([
      {
        url: "https://a.example",
        rateLimit: { requests: 10, perMs: 10_000 },
      } as any,
      {
        url: "https://www.a.example/x",
        rateLimit: { requests: 1, perMs: 5_000 },
      } as any,
    ]);
    expect(floors.get("a.example")).toBe(5_000);
    const l = new DomainLimiter({
      minGapMs: 3_000,
      random: () => 0,
      domainFloorMs: () => 30_000,
    });
    expect(l.gapMs("copart.com")).toBe(30_000);
    const def = new DomainLimiter({ minGapMs: 3_000, random: () => 0 });
    expect(def.gapMs("copart.com")).toBe(30_000);
    expect(def.gapMs("other.example")).toBe(3_000);
  });
});

describe("3. static exemptions are source-plus-path", () => {
  it("ebay-sold's search is exempt, ebay_motors' category search is not", () => {
    expect(
      isRobotsExemptUrl("https://www.ebay.com/sch/i.html?_nkw=civic&LH_Sold=1"),
    ).toBe(true);
    expect(isRobotsExemptUrl("https://www.ebay.com/")).toBe(true); // ebay-sold cookie warm-up
    expect(
      isRobotsExemptUrl("https://www.ebay.com/sch/6001/i.html?_nkw=civic"),
    ).toBe(false);
    expect(isRobotsExemptUrl("https://www.ebay.com/itm/123")).toBe(false);
  });

  it("the calling source must be the one the exemption was granted to", () => {
    const sold = "https://www.ebay.com/sch/i.html?_nkw=civic&LH_Sold=1";
    expect(withPoliteSource("ebay_sold", () => isRobotsExemptUrl(sold))).toBe(
      true,
    );
    expect(withPoliteSource("ebay_motors", () => isRobotsExemptUrl(sold))).toBe(
      false,
    );
    expect(isRobotsExemptUrl(sold, "ebay_motors")).toBe(false);
    // curated_dealers crawls ReCar, so its exemption carries over; another runner's does not.
    expect(
      isRobotsExemptUrl("https://www.recar.com/vehicles/", "curated_dealers"),
    ).toBe(true);
    expect(
      isRobotsExemptUrl("https://www.recar.com/vehicles/", "autotempest"),
    ).toBe(false);
  });

  it("Facebook's exemption is the Marketplace path, not all of facebook.com", () => {
    expect(
      isRobotsExemptUrl("https://www.facebook.com/marketplace/dallas/vehicles"),
    ).toBe(true);
    expect(isRobotsExemptUrl("https://www.facebook.com/groups/cars")).toBe(
      false,
    );
  });

  it("run-time producer hosts stay host-wide (unchanged; waits on Jonah)", () => {
    setRecentProducers({ sources: ["ebay_motors"], hosts: ["ebay.com"] });
    expect(
      isRobotsExemptUrl("https://www.ebay.com/sch/6001/i.html", "ebay_motors"),
    ).toBe(true);
  });

  it("path patterns: exact and prefix", () => {
    expect(pathMatches("/sch/i.html", ["/sch/i.html"])).toBe(true);
    expect(pathMatches("/sch/6001/i.html", ["/sch/i.html"])).toBe(false);
    expect(pathMatches("/inventory/123", ["/inventory/*"])).toBe(true);
    expect(pathMatches("/inventory", ["/inventory/*"])).toBe(true);
    expect(pathMatches("/anything", null)).toBe(true);
  });
});

describe("4. photo cache-to-storage only for api/allowed sources", () => {
  it("classifies sources", () => {
    expect(
      accessClassFor({
        source: "gov_auction",
        source_url: "https://www.gsaauctions.gov/auctions/x",
      }),
    ).toBe("api");
    expect(
      accessClassFor({
        source: "independent_dealer",
        source_url: "https://www.glensautosales.com/v/1", // curated-sites.ts host
      }),
    ).toBe("allowed");
    // Ren #312 P1: not in curated-sites.ts → unreviewed, even as independent_dealer.
    expect(
      accessClassFor({
        source: "independent_dealer",
        source_url: "https://random-dealer.example/v/1",
      }),
    ).toBe("unreviewed");
    expect(
      accessClassFor({
        source: "craigslist_dealer",
        source_url: "https://dallas.craigslist.org/x",
      }),
    ).toBe("restricted");
    expect(
      accessClassFor({
        source: "copart",
        source_url: "https://www.copart.com/lot/1",
      }),
    ).toBe("restricted");
    // Operator-restored and grandfathered hosts: operator_override (not permission; #290).
    expect(
      accessClassFor({
        source: "independent_dealer",
        source_url: "https://aeofmiami.com/v/1",
      }),
    ).toBe("operator_override");
    expect(
      accessClassFor({
        source: "independent_dealer",
        source_url: "https://www.recar.com/v/1",
      }),
    ).toBe("operator_override");
    expect(
      accessClassFor({
        source: "something_new",
        source_url: "https://x.example/1",
      }),
    ).toBe("unreviewed");
  });

  it("only api and allowed may be cached", () => {
    expect(
      photoCacheAllowed({
        source: "gov_auction",
        source_url: "https://gsaauctions.gov/a",
      }),
    ).toBe(true);
    expect(
      photoCacheAllowed({
        source: "independent_dealer",
        source_url: "https://glensautosales.com/a",
      }),
    ).toBe(true);
    expect(
      photoCacheAllowed({
        source: "craigslist",
        source_url: "https://x.craigslist.org/a",
      }),
    ).toBe(false);
    expect(
      photoCacheAllowed({
        source: "something_new",
        source_url: "https://x.example/1",
      }),
    ).toBe(false);
  });
});
