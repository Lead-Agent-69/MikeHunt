import { describe, it, expect } from "vitest";
import {
  parseRobotsSitemaps,
  parseSitemap,
  scoreInventoryUrl,
  discoverListingUrls,
} from "./crawl-discovery";

describe("parseRobotsSitemaps", () => {
  it("pulls Sitemap: directives (case-insensitive, deduped)", () => {
    const robots = `User-agent: *\nDisallow: /admin\nSitemap: https://x.com/sitemap.xml\nSITEMAP: https://x.com/sitemap.xml\nSitemap: https://x.com/inventory-sitemap.xml`;
    expect(parseRobotsSitemaps(robots)).toEqual([
      "https://x.com/sitemap.xml",
      "https://x.com/inventory-sitemap.xml",
    ]);
  });
});

describe("parseSitemap", () => {
  it("reads page URLs from a urlset", () => {
    const xml = `<urlset><url><loc>https://x.com/used-cars/1</loc></url><url><loc>https://x.com/about</loc></url></urlset>`;
    const { urls, sitemaps } = parseSitemap(xml);
    expect(urls).toHaveLength(2);
    expect(sitemaps).toHaveLength(0);
  });

  it("reads child sitemaps from a sitemapindex", () => {
    const xml = `<sitemapindex><sitemap><loc>https://x.com/sm1.xml</loc></sitemap><sitemap><loc>https://x.com/sm2.xml</loc></sitemap></sitemapindex>`;
    const { urls, sitemaps } = parseSitemap(xml);
    expect(sitemaps).toHaveLength(2);
    expect(urls).toHaveLength(0);
  });
});

describe("scoreInventoryUrl", () => {
  it("ranks inventory + detail pages above generic pages", () => {
    expect(scoreInventoryUrl("https://x.com/used-cars/")).toBeGreaterThan(0);
    expect(
      scoreInventoryUrl("https://x.com/inventory/2018-ford-f150-1FTEW1E5XJ"),
    ).toBeGreaterThan(scoreInventoryUrl("https://x.com/used-cars/"));
  });

  it("drops non-inventory + asset URLs", () => {
    expect(scoreInventoryUrl("https://x.com/blog/best-trucks")).toBe(0);
    expect(scoreInventoryUrl("https://x.com/about-us")).toBe(0);
    expect(scoreInventoryUrl("https://x.com/inventory/photo.jpg")).toBe(0);
    expect(scoreInventoryUrl("https://x.com/parts-and-service")).toBe(0);
  });
});

describe("discoverListingUrls — end to end with a fake fetcher", () => {
  it("robots → sitemap-index → child sitemaps → ranked inventory URLs", async () => {
    const files: Record<string, string> = {
      "https://dealer.com/robots.txt":
        "Sitemap: https://dealer.com/sitemap_index.xml",
      "https://dealer.com/sitemap_index.xml": `<sitemapindex><sitemap><loc>https://dealer.com/inv.xml</loc></sitemap></sitemapindex>`,
      "https://dealer.com/inv.xml": `<urlset>
        <url><loc>https://dealer.com/used-cars/2019-ram-1500</loc></url>
        <url><loc>https://dealer.com/inventory/2020-civic</loc></url>
        <url><loc>https://dealer.com/blog/news</loc></url>
        <url><loc>https://dealer.com/contact</loc></url>
      </urlset>`,
    };
    const fetchImpl = async (url: string) => ({
      ok: url in files,
      text: async () => files[url] || "",
    });

    const urls = await discoverListingUrls("https://dealer.com/", {
      fetchImpl,
    });
    expect(urls).toContain("https://dealer.com/used-cars/2019-ram-1500");
    expect(urls).toContain("https://dealer.com/inventory/2020-civic");
    expect(urls).not.toContain("https://dealer.com/blog/news");
    expect(urls).not.toContain("https://dealer.com/contact");
  });

  it("falls back to /sitemap.xml when robots has no Sitemap directive", async () => {
    const files: Record<string, string> = {
      "https://d2.com/robots.txt": "User-agent: *\nDisallow:",
      "https://d2.com/sitemap.xml": `<urlset><url><loc>https://d2.com/vehicles/x</loc></url></urlset>`,
    };
    const fetchImpl = async (url: string) => ({
      ok: url in files,
      text: async () => files[url] || "",
    });
    const urls = await discoverListingUrls("https://d2.com/", { fetchImpl });
    expect(urls).toEqual(["https://d2.com/vehicles/x"]);
  });
});
