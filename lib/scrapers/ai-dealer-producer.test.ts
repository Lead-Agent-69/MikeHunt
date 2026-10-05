import { describe, it, expect, vi } from "vitest";
import {
  queueCuratedDealerInventory,
  maybeQueueCuratedDealerInventoryFromEnv,
} from "./ai-dealer-producer";
import type { CuratedSite } from "./curated-sites";

// A deterministic fixture: 2 dealers + 1 salvage + 1 rebuilder, plus an auction_proxy that MUST be skipped,
// and one site relying on the root url vs an explicit inventoryUrl.
const SITES: CuratedSite[] = [
  { url: "https://a.example", name: "A Lot", type: "independent_dealer" },
  {
    url: "https://b.example",
    name: "B Salvage",
    type: "salvage_yard",
    inventoryUrl: "https://b.example/inventory",
  },
  { url: "https://c.example", name: "C Rebuild", type: "rebuilder_dealer" },
  { url: "https://gov.example", name: "Gov", type: "auction_proxy" }, // must be ignored
  { url: "https://d.example", name: "D Clean", type: "clean_retail" },
];

describe("queueCuratedDealerInventory", () => {
  it("crawls only dealer types and respects maxSites + perSiteCap", async () => {
    const urls: string[] = [];
    const crawl = vi.fn(async (url: string, _d: unknown, _cap: number) => {
      urls.push(url);
      return 3;
    });
    const res = await queueCuratedDealerInventory({
      sites: SITES,
      maxSites: 2,
      perSiteCap: 5,
      crawl,
    });
    // auction_proxy excluded → dealer pool is [A,B,C,D]; maxSites=2 → A and B.
    expect(res.sitesAttempted).toBe(2);
    expect(res.sitesSucceeded).toBe(2);
    expect(res.vdpQueued).toBe(6);
    expect(crawl).toHaveBeenCalledTimes(2);
    // A falls back to root url; B's inventoryUrl override is honored; cap threads through.
    expect(urls).toEqual(["https://a.example", "https://b.example/inventory"]);
    expect(crawl).toHaveBeenNthCalledWith(1, "https://a.example", undefined, 5);
  });

  it("skips auction_proxy sites entirely", async () => {
    const urls: string[] = [];
    const crawl = vi.fn(async (url: string) => {
      urls.push(url);
      return 1;
    });
    const res = await queueCuratedDealerInventory({
      sites: SITES,
      maxSites: 99,
      crawl,
    });
    expect(urls).not.toContain("https://gov.example");
    expect(res.sitesAttempted).toBe(4); // A,B,C,D — not gov
  });

  it("is best-effort: a throwing site does not fail the run", async () => {
    const crawl = vi.fn(async (url: string) => {
      if (url.includes("b.example")) throw new Error("walled");
      return 2;
    });
    const res = await queueCuratedDealerInventory({
      sites: SITES,
      maxSites: 3,
      crawl,
    });
    expect(res.sitesAttempted).toBe(3);
    expect(res.sitesSucceeded).toBe(2);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("walled");
    expect(res.vdpQueued).toBe(4);
  });

  it("no-ops when maxSites <= 0", async () => {
    const crawl = vi.fn(async () => 1);
    const res = await queueCuratedDealerInventory({ sites: SITES, maxSites: 0, crawl });
    expect(crawl).not.toHaveBeenCalled();
    expect(res.sitesAttempted).toBe(0);
    expect(res.vdpQueued).toBe(0);
  });
});

describe("maybeQueueCuratedDealerInventoryFromEnv", () => {
  const original = process.env;

  it("returns null (disabled) unless ENABLE_AI_DEALER_CRAWL=1", async () => {
    process.env = { ...original, ENABLE_AI_DEALER_CRAWL: "0" };
    try {
      await expect(maybeQueueCuratedDealerInventoryFromEnv()).resolves.toBeNull();
    } finally {
      process.env = original;
    }
  });
});
