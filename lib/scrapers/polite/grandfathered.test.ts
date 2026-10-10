/**
 * Jonah's standing rule: never remove or disable a MikeHunt source, and never stop a scraper that is
 * already working. Polite mode (default) must not start skipping grandfathered sources.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRobotsExemptSources } from "../sources-registry";
import { CURATED_SITES } from "../curated-sites";
import { planCuratedRotation } from "../curated-rotation";
import { policyBlockFor } from "../source-compliance";
import { resolveSweepSources } from "../sweep-schedule";
import { DomainLimiter } from "./limiter";
import { MemoryPageCache } from "./cache";
import {
  PoliteCrawler,
  challengeBackoffMs,
  politeGate,
  politeRobotsPathFor,
  resetPoliteCrawler,
} from "./polite-fetch";
import {
  isRobotsExemptSource,
  isRobotsExemptUrl,
  refreshRecentProducers,
  resetRecentProducers,
  setRecentProducers,
} from "./robots-exempt";
import { scraperFetch } from "./scraper-fetch";

const prevMode = process.env.SCRAPER_POLITE_MODE;
afterEach(() => {
  if (prevMode === undefined) delete process.env.SCRAPER_POLITE_MODE;
  else process.env.SCRAPER_POLITE_MODE = prevMode;
  resetPoliteCrawler();
  resetRecentProducers();
  vi.restoreAllMocks();
});

/** Jonah's restored list (2026-10-09). */
const NAMED = [
  ["cargurus", "https://www.cargurus.com/Cars/inventorylisting"],
  ["facebook-marketplace", "https://www.facebook.com/marketplace/dallas/vehicles"],
  ["salvage-trucks-auction", "https://www.salvagetrucksauction.com/inventory"],
  ["ae-of-miami", "https://aeofmiami.com/api/vehicle/listed?page=1"],
  ["royal-drive", "https://www.royaldriveautos.com/inventory"],
  ["parts-farm", "https://thepartsfarm.com/vehicles"],
  ["recar", "https://www.recar.com/vehicles/"],
  ["ebay-sold", "https://www.ebay.com/sch/i.html?LH_Sold=1"],
] as const;

function crawler(routes: Record<string, () => Response>, seen: string[], now = { t: 0 }) {
  return new PoliteCrawler({
    fetchImpl: async (url) => {
      seen.push(url);
      const h = routes[new URL(url).pathname];
      return h ? h() : new Response("ok", { status: 200 });
    },
    sleep: async () => {},
    random: () => 0.5,
    now: () => now.t,
    limiter: new DomainLimiter({ sleep: async () => {}, minGapMs: 0, now: () => now.t }),
    cache: new MemoryPageCache(),
  });
}

describe("robotsExempt registry flag", () => {
  it("covers every source Jonah restored, by id and host", () => {
    const ids = getRobotsExemptSources().map((s) => s.id);
    for (const [id, url] of NAMED) {
      expect(ids, id).toContain(id);
      expect(isRobotsExemptSource(id), id).toBe(true);
      expect(isRobotsExemptUrl(url), url).toBe(true);
    }
    expect(isRobotsExemptSource("ebay_sold")).toBe(true); // runner id form
  });

  it("new sources are not exempt", () => {
    expect(isRobotsExemptUrl("https://brand-new-dealer.example/autos")).toBe(false);
    expect(isRobotsExemptSource("brand_new_source")).toBe(false);
  });
});

describe("robots.txt skip applies only to new / 0-row sources", () => {
  it("a grandfathered host is fetched even when robots.txt disallows everything (delays still apply)", async () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    const seen: string[] = [];
    const c = crawler({ "/robots.txt": () => new Response("User-agent: *\nDisallow: /") }, seen);
    const run = vi.spyOn(c.limiter, "run");
    const res = await c.fetch("https://www.recar.com/vehicles/");
    expect(res.ok).toBe(true);
    expect(res.skipped).toBeUndefined();
    expect(seen.some((u) => u.endsWith("/robots.txt"))).toBe(false);
    expect(run).toHaveBeenCalled(); // per-domain delay slot
  });

  it("a new host is still skipped by a robots.txt disallow", async () => {
    const seen: string[] = [];
    const c = crawler({ "/robots.txt": () => new Response("User-agent: *\nDisallow: /") }, seen);
    const res = await c.fetch("https://brand-new-dealer.example/autos");
    expect(res.skipped).toBe("robots");
  });

  it("a source with rows in the last 7 days is exempt at run time; 0 rows is not", async () => {
    expect(isRobotsExemptUrl("https://www.someyard.example/inv")).toBe(false);
    setRecentProducers({ sources: ["curated_dealers"], hosts: ["someyard.example"] });
    expect(isRobotsExemptUrl("https://www.someyard.example/inv")).toBe(true);
    expect(isRobotsExemptSource("curated-dealers")).toBe(true);
    const seen: string[] = [];
    const c = crawler({ "/robots.txt": () => new Response("User-agent: *\nDisallow: /") }, seen);
    expect((await c.fetch("https://someyard.example/inv")).ok).toBe(true);
  });

  it("refreshRecentProducers reads scraper_runs + deals, and keeps the old set on error", async () => {
    const q = (data: unknown[]) => {
      const chain: any = { select: () => chain, gte: () => chain, gt: () => chain, limit: async () => ({ data, error: null }) };
      return chain;
    };
    const ok = {
      from: (t: string) =>
        t === "scraper_runs"
          ? q([{ source: "gsa_auctions", deals_found: 12 }])
          : q([{ source_url: "https://www.glensautosales.com/vehiclesDetail.php?1" }]),
    };
    expect(await refreshRecentProducers(ok, 1_000_000)).toEqual({ sources: 1, hosts: 1 });
    expect(isRobotsExemptSource("gsa_auctions")).toBe(true);
    expect(isRobotsExemptUrl("https://glensautosales.com/x")).toBe(true);
    const bad = { from: () => ({ select: () => { throw new Error("db down"); } }) };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await refreshRecentProducers(bad, 1_000_000 + 2 * 3_600_000)).toBeNull();
    expect(isRobotsExemptUrl("https://glensautosales.com/x")).toBe(true);
  });
});

describe("grandfathered sources keep their own request, with polite delays added", () => {
  it("scraperFetch keeps the original headers for an exempt host (inside politeGate)", async () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
    const init = { headers: { "User-Agent": "legacy-ua", Accept: "application/json" } };
    const res = await scraperFetch("https://aeofmiami.com/api/vehicle/listed?page=1", init);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith("https://aeofmiami.com/api/vehicle/listed?page=1", init);
  });

  it("legacy branch is chosen for exempt URLs, polite branch for new ones", () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    expect(politeRobotsPathFor("https://www.cargurus.com/x")).toBe(false);
    expect(politeRobotsPathFor("https://brand-new-dealer.example/x")).toBe(true);
  });

  it("politeGate: breaker stays on (429s trip it, a paused domain throws, not a removal)", async () => {
    process.env.SCRAPER_POLITE_MODE = "1";
    const c = crawler({}, []);
    resetPoliteCrawler(c);
    for (let i = 0; i < 3; i++)
      await politeGate("https://www.ebay.com/sch", async () => ({ status: 429 }), (r) => r.status);
    expect(c.breaker.isOpen("ebay.com")).toBe(true);
    await expect(politeGate("https://www.ebay.com/sch", async () => 1)).rejects.toThrow(/paused/);
  });
});

describe("bot challenge = 'challenged' outcome + short backoff, retried next schedule", () => {
  it("records a challenge and pauses only for the challenge backoff (< sweep interval)", async () => {
    const now = { t: 1_000_000 };
    const c = crawler(
      {
        "/robots.txt": () => new Response("User-agent: *\nAllow: /"),
        "/inv": () => new Response("<title>Just a moment...</title> cf-chl", { status: 200 }),
      },
      [],
      now,
    );
    const res = await c.fetch("https://walled.example/inv");
    expect(res.challenge).toBe(true);
    const snap = c.metrics.snapshot();
    expect(snap.challenged).toBe(1);
    expect(snap.challengedDomains).toEqual([{ domain: "walled.example", challenges: 1 }]);
    const pausedFor = c.breaker.pausedUntil("walled.example") - now.t;
    expect(pausedFor).toBe(challengeBackoffMs());
    expect(pausedFor).toBeLessThan(4 * 3_600_000); // default sweep interval
    now.t += challengeBackoffMs() + 1;
    expect(c.breaker.isOpen("walled.example", now.t)).toBe(false);
  });
});

describe("every grandfathered source still gets scheduled", () => {
  const scheduledBy = (mode: string) => {
    process.env.SCRAPER_POLITE_MODE = mode;
    const sweep = resolveSweepSources("");
    const eligible = CURATED_SITES.filter((s) => !policyBlockFor(s.url));
    const curated = planCuratedRotation(eligible, { lastAttempted: {} } as never, []).map((s) =>
      new URL(s.url).hostname.replace(/^www\./, ""),
    );
    return { sweep, curated };
  };

  it("runner sources (eBay sold) and curated dealers (A&E, ReCar, Royal Drive, Parts Farm, Salvage Trucks)", () => {
    const { sweep, curated } = scheduledBy("1");
    expect(sweep).toContain("ebay_sold");
    expect(sweep).toContain("curated_dealers");
    for (const host of [
      "aeofmiami.com",
      "recar.com",
      "royaldriveautos.com",
      "thepartsfarm.com",
      "salvagetrucksauction.com",
    ])
      expect(curated, host).toContain(host);
  });

  it("polite mode does not change what is scheduled", () => {
    expect(scheduledBy("1")).toEqual(scheduledBy("0"));
  });
});
