import * as cheerio from "cheerio";
import axios from "axios";
import { getWorkingProxy } from "../tools/free-proxy-manager";
import { enrichAndStore } from "./shared";

// Major metros across high-volume states. Override via the `cities` arg or CL_CITIES env (comma-separated).
const CL_CITIES = process.env.CL_CITIES?.split(",")
  .map((c) => c.trim())
  .filter(Boolean) || [
  "dallas",
  "houston",
  "sanantonio",
  "austin",
  "fortworth",
  "miami",
  "orlando",
  "tampa",
  "jacksonville",
  "chicago",
  "nashville",
  "memphis",
  "atlanta",
  "charlotte",
  "raleigh",
  "phoenix",
  "lasvegas",
  "losangeles",
  "sandiego",
  "sacramento",
  "fresno",
  "seattle",
  "portland",
  "denver",
  "saltlakecity",
  "albuquerque",
  "boston",
  "newyork",
  "brooklyn",
  "detroit",
  "columbus",
  "indianapolis",
  "minneapolis",
  "stlouis",
  "kansascity",
  "omaha",
  "wichita",
  "tulsa",
  "louisville",
  "richmond",
  "baltimore",
  "pittsburgh",
  "milwaukee",
  "neworleans",
];

export async function scrapeCraigslist(
  searchTerm = "cars trucks",
  cities = CL_CITIES,
) {
  let totalFound = 0;

  for (const city of cities) {
    try {
      // Run direct by default. If CL_USE_FREE_PROXY is set, rotate through the free proxy list
      // (useful when GitHub Actions / datacenter IPs get blocked). $0 — no paid proxies.
      let proxy: { host: string; port: number } | null = null;
      let useFree = false;
      if (process.env.CL_USE_FREE_PROXY === "true") {
        const free = await getWorkingProxy();
        if (free) {
          const [host, port] = free.split(":");
          proxy = { host, port: parseInt(port) };
          useFree = true;
        }
      }
      const url = `https://${city}.craigslist.org/search/cto?query=${encodeURIComponent(searchTerm)}&sort=rel`;

      const config: any = {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "text/html",
        },
        timeout: 12000,
      };

      if (proxy) {
        config.proxy = { host: proxy.host, port: proxy.port };
      }

      const res = await axios.get(url, config);
      const $ = cheerio.load(res.data);
      const listings: any[] = [];

      // Handle both old and new CL layouts
      $("li.cl-static-search-result, .result-row").each((_, el) => {
        const price = parseInt(
          $(el)
            .find(".priceinfo, .result-price")
            .first()
            .text()
            .replace(/[^0-9]/g, ""),
        );
        const title =
          $(el).find(".cl-app-anchor, .result-title").attr("title") ||
          $(el).find(".result-title").text().trim();
        const href = $(el).find("a").first().attr("href") || "";
        const pid =
          $(el).attr("data-pid") || href.match(/\/(\d+)\.html/)?.[1] || "";

        // Require a stable id so upsert dedupe works — skip rows we can't identify
        // (a random id would create a fresh duplicate row on every run).
        if (pid && price > 500 && price < 200000 && title) {
          listings.push({
            source: "craigslist",
            source_category: "private",
            external_id: pid,
            title,
            asking_price: price,
            current_bid: price,
            location_city: city,
            location_state: getCLStateFromCity(city),
            listing_url: href.startsWith("http")
              ? href
              : `https://${city}.craigslist.org${href}`,
            images: [],
          });
        }
      });

      for (const listing of listings) {
        await enrichAndStore(listing);
      }

      totalFound += listings.length;

      // Rate limit: 1-2 second delay between cities
      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    } catch (e) {
      console.error(`[CL] ${city} failed:`, (e as Error).message);
    }
  }

  return totalFound;
}

function getCLStateFromCity(city: string): string {
  const map: Record<string, string> = {
    dallas: "TX",
    houston: "TX",
    sanantonio: "TX",
    austin: "TX",
    fortworth: "TX",
    miami: "FL",
    orlando: "FL",
    tampa: "FL",
    jacksonville: "FL",
    chicago: "IL",
    nashville: "TN",
    memphis: "TN",
    atlanta: "GA",
    charlotte: "NC",
    raleigh: "NC",
    phoenix: "AZ",
    lasvegas: "NV",
    losangeles: "CA",
    sandiego: "CA",
    sacramento: "CA",
    fresno: "CA",
    seattle: "WA",
    portland: "OR",
    denver: "CO",
    saltlakecity: "UT",
    albuquerque: "NM",
    boston: "MA",
    newyork: "NY",
    brooklyn: "NY",
    detroit: "MI",
    columbus: "OH",
    indianapolis: "IN",
    minneapolis: "MN",
    stlouis: "MO",
    kansascity: "MO",
    omaha: "NE",
    wichita: "KS",
    tulsa: "OK",
    louisville: "KY",
    richmond: "VA",
    baltimore: "MD",
    pittsburgh: "PA",
    milwaukee: "WI",
    neworleans: "LA",
  };
  return map[city] || "US";
}
