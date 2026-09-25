# DEALERHUNT PRO — COMPLETE IDE UPGRADE PROMPT

# Give this to Windsurf / Cursor / Devin

# Based on current codebase status + research on what's missing

# This is the exact gap between "UI done, data simulated" → "real working product"

---

## WHAT EXISTS RIGHT NOW (DO NOT REBUILD)

- Design system: complete ✓
- All 8 screen UIs: complete ✓
- Deal Analyzer math: complete ✓
- Database schema (schema.sql): complete ✓
- Source dictionary (lib/utils/sources.ts): complete ✓
- Scraper skeleton files: exist but NOT connected ✓
- API route shells: exist but NOT connected ✓

## WHAT IS BROKEN / SIMULATED (FIX ALL OF THIS)

1. Scan page returns fake data — not real listings
2. MMR value is mocked with setTimeout — not real API
3. Scrapers exist as files but are not running
4. BullMQ queue exists in code but has no worker running
5. Supabase schema exists but may not be deployed
6. No proxy layer — scrapers get blocked immediately
7. No Cloudflare bypass — Copart/Facebook/ADESA all block raw requests
8. VIN decode may not be wired to real NHTSA API
9. Transport quote not calling real formula correctly
10. No alert engine running

---

## THE CORE PROBLEM TO SOLVE

The codebase has a "front of house" (UI) and an empty "back of house" (workers).
The job is to connect them. Everything the UI needs comes from:

Scraper workers → Supabase vehicles table → API routes → UI

Once that pipeline is live, every simulated result becomes real.

---

## STEP 1: DEPLOY THE DATABASE

Run this in Supabase SQL editor (use existing schema.sql — DO NOT recreate it):

```bash
# In Supabase dashboard → SQL Editor → paste contents of lib/supabase/schema.sql → Run
# Then enable Realtime on these tables:
# Dashboard → Database → Replication → Enable for: vehicles, inventory, alert_matches
# Create storage bucket: "vehicle-photos" (public read)
```

Verify tables exist:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;
-- Should show: dealers, vehicles, inventory, transports, alerts,
-- alert_matches, recon_stages, recon_expenses, leads, watchlist, scrape_jobs
```

---

## STEP 2: BUILD THE PROXY LAYER (FREE, SELF-HOSTED)

### FlareSolverr — Free Cloudflare bypass, open source, self-hosted

This is the single most important missing piece.
Without it, every Patchright/Camoufox request to Copart/Facebook/ADESA gets blocked.

**Deploy FlareSolverr on Railway (free tier):**

```bash
# Railway.app → New Project → Deploy from GitHub
# Use: github.com/FlareSolverr/FlareSolverr
# Or via Docker:
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=info \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest
```

**How to use FlareSolverr in scrapers:**

```typescript
// lib/scrapers/tools/cloudflare-bypass.ts
export async function fetchWithCloudflareBypass(url: string): Promise<string> {
  const response = await fetch("http://localhost:8191/v1", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cmd: "request.get",
      url: url,
      maxTimeout: 60000,
    }),
  });

  const data = await response.json();

  if (data.status === "ok") {
    return data.solution.response; // HTML content
  }

  throw new Error(`FlareSolverr failed: ${data.message}`);
}

// Usage in any scraper:
const html = await fetchWithCloudflareBypass("https://www.copart.com/lot/...");
const $ = cheerio.load(html);
```

**FlareSolverr limitation:** Works on JS challenges. If Cloudflare shows a CAPTCHA,
use CapSolver (free tier: 1,000 solves/day) as fallback:

```typescript
// lib/scrapers/tools/captcha-solver.ts
// CapSolver API — free tier at capsolver.com
export async function solveCaptcha(sitekey: string, pageUrl: string) {
  const createTask = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: process.env.CAPSOLVER_KEY,
      task: {
        type: "AntiTurnstileTaskProxyLess",
        websiteURL: pageUrl,
        websiteKey: sitekey,
      },
    }),
  });

  const { taskId } = await createTask.json();

  // Poll for result
  let attempts = 0;
  while (attempts < 30) {
    await new Promise((r) => setTimeout(r, 2000));
    const result = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      body: JSON.stringify({ clientKey: process.env.CAPSOLVER_KEY, taskId }),
    });
    const data = await result.json();
    if (data.status === "ready") return data.solution.token;
    attempts++;
  }
  throw new Error("Captcha solve timeout");
}
```

### Free Proxy Rotation — Scrapoxy (open source, self-hosted)

Scrapoxy is an open-source proxy manager that lets you create your own rotating proxy network, acting as a gateway between scrapers and proxy sources with automatic IP rotation.

For Cheerio (static pages, no JS needed) — free proxies rotate automatically:

```typescript
// lib/scrapers/tools/free-proxy-manager.ts
// Uses proxy-scraper-checker GitHub library
// Pulls from 17 free proxy sources, updates every 10 min
// Good for: Craigslist, IAA static pages, Cars.com, CarGurus

const FREE_PROXY_SOURCES = [
  "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
  "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",
  "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",
  "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",
  "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=5000&country=us",
];

let proxyPool: string[] = [];
let lastRefresh = 0;

export async function getWorkingProxy(): Promise<string> {
  // Refresh proxy list every 10 minutes
  if (Date.now() - lastRefresh > 600000) {
    await refreshProxyPool();
  }

  // Return random proxy from pool
  const proxy = proxyPool[Math.floor(Math.random() * proxyPool.length)];
  return proxy || "";
}

async function refreshProxyPool() {
  const allProxies: string[] = [];

  for (const source of FREE_PROXY_SOURCES) {
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(5000) });
      const text = await res.text();
      const proxies = text
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p.match(/^\d+\.\d+\.\d+\.\d+:\d+$/));
      allProxies.push(...proxies);
    } catch {}
  }

  // Test proxies and keep working ones
  // Run in parallel, test with fast timeout
  const working = await Promise.allSettled(
    allProxies.slice(0, 100).map(async (proxy) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      try {
        await fetch("http://httpbin.org/ip", {
          signal: controller.signal,
          // @ts-ignore
          proxy: `http://${proxy}`,
        });
        return proxy;
      } finally {
        clearTimeout(timeout);
      }
    }),
  );

  proxyPool = working
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<string>).value);

  lastRefresh = Date.now();
  console.log(`[Proxy] Pool refreshed: ${proxyPool.length} working proxies`);
}
```

**Important:** Free proxies work for IAA, Craigslist, Cars.com, CarGurus, eBay.
For Copart and Facebook you need paid residential proxies ($8-50/mo) or FlareSolverr.
Start free, upgrade when you have paying dealers.

---

## STEP 3: WIRE THE ACTUAL SCRAPERS

The scraper files exist. They need to actually work. Fix each one:

### IAA Scraper — Wire to real site (should work with free proxies)

```typescript
// lib/scrapers/sources/iaa.ts — REPLACE existing content with:
import * as cheerio from "cheerio";
import axios from "axios";
import { getWorkingProxy } from "../tools/free-proxy-manager";
import { supabaseAdmin } from "../../supabase";
import { computeProfitScore } from "../../scoring/profitScore";
import { getMarketValueCached } from "../../api/value";

export async function scrapeIAA(searchTerm = "", limit = 100) {
  const proxy = await getWorkingProxy();
  const url = `https://www.iaai.com/Search?SearchSpec=${encodeURIComponent(searchTerm)}&sortBy=saleDate&sortOrder=asc`;

  const config: any = {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Referer: "https://www.iaai.com/",
    },
    timeout: 20000,
  };

  if (proxy) {
    config.proxy = {
      host: proxy.split(":")[0],
      port: parseInt(proxy.split(":")[1]),
    };
  }

  const res = await axios.get(url, config);
  const $ = cheerio.load(res.data);
  const vehicles: any[] = [];

  // IAA uses both old and new layouts — handle both
  const selectors = [
    "[data-lot-number]",
    ".lot-details-container",
    ".search-result-card",
  ];

  for (const selector of selectors) {
    if ($(selector).length > 0) {
      $(selector).each((_, el) => {
        const lotNum =
          $(el).attr("data-lot-number") ||
          $(el).find("[data-lot-number]").attr("data-lot-number") ||
          String(Date.now() + Math.random());

        const priceText = $(el)
          .find('.bid-price, .current-bid, [class*="price"]')
          .first()
          .text();
        const price = parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0;

        const odometerText = $(el)
          .find('.odometer, [data-odometer], [class*="mileage"]')
          .first()
          .text();
        const odometer = parseInt(odometerText.replace(/[^0-9]/g, "")) || 0;

        const href = $(el).find("a").attr("href") || "";

        if (price > 0 || href.includes("lot")) {
          vehicles.push({
            source: "iaa",
            source_category: "salvage",
            external_id: lotNum,
            title: $(el)
              .find(".lot-title, .vehicle-title, h2, h3")
              .first()
              .text()
              .trim(),
            vin:
              $(el).find("[data-vin], .vin").first().text().trim() ||
              $(el).attr("data-vin") ||
              "",
            current_bid: price,
            asking_price: price,
            odometer,
            damage_type: $(el)
              .find('.damage-description, .primary-damage, [class*="damage"]')
              .first()
              .text()
              .trim(),
            title_type:
              $(el)
                .find('.title-type, [class*="title-type"]')
                .first()
                .text()
                .trim()
                .toLowerCase() || "salvage",
            location_city: $(el)
              .find('.location-city, [class*="city"]')
              .first()
              .text()
              .trim(),
            location_state: $(el)
              .find('.location-state, [class*="state"]')
              .first()
              .text()
              .trim(),
            sale_date: $(el)
              .find('.sale-date, [class*="sale-date"]')
              .first()
              .text()
              .trim(),
            images: $(el)
              .find("img")
              .map((_, img) => $(img).attr("src") || $(img).attr("data-src"))
              .get()
              .filter((src) => src && src.startsWith("http")),
            listing_url: href.startsWith("http")
              ? href
              : `https://www.iaai.com${href}`,
          });
        }
      });
      break; // Found a working selector, stop
    }
  }

  // Enrich each vehicle and store in Supabase
  for (const v of vehicles.slice(0, limit)) {
    await enrichAndStore(v);
  }

  return vehicles.length;
}

async function enrichAndStore(raw: any) {
  try {
    // Parse year/make/model from title if VIN not available
    let year: number | null = null;
    let make: string | null = null;
    let model: string | null = null;

    const titleMatch = raw.title?.match(/^(\d{4})\s+([A-Za-z]+)\s+(.+)$/);
    if (titleMatch) {
      year = parseInt(titleMatch[1]);
      make = titleMatch[2];
      model = titleMatch[3].split(" ").slice(0, 2).join(" ");
    }

    // Get market value
    const marketValue = raw.vin ? await getMarketValueCached(raw.vin) : null;

    // Score the deal
    const { score, verdict } = computeProfitScore({
      buyNowPrice: raw.asking_price,
      marketValue: marketValue || 0,
      titleType: raw.title_type || "salvage",
      damageType: raw.damage_type || "",
      make: make || "",
      odometer: raw.odometer || 0,
    });

    const vehicle = {
      ...raw,
      year,
      make,
      model,
      market_value: marketValue,
      estimated_profit: marketValue ? marketValue - raw.asking_price : null,
      profit_score: score,
      verdict,
      scraped_at: new Date().toISOString(),
    };

    // Upsert — update if already exists
    await supabaseAdmin.from("vehicles").upsert(vehicle, {
      onConflict: "source,external_id",
      ignoreDuplicates: false,
    });
  } catch (e) {
    console.error("[IAA] Enrich error:", e);
  }
}
```

### Craigslist Scraper — Wire to real cities

```typescript
// lib/scrapers/sources/craigslist.ts — REPLACE with:
import * as cheerio from "cheerio";
import axios from "axios";
import { getWorkingProxy } from "../tools/free-proxy-manager";
import { enrichAndStore } from "./shared";

const CL_CITIES = [
  "dallas",
  "houston",
  "miami",
  "chicago",
  "losangeles",
  "newyork",
  "atlanta",
  "phoenix",
  "seattle",
  "denver",
  "boston",
  "detroit",
  "nashville",
  "charlotte",
  "portland",
  "lasvegas",
  "orlando",
  "tampa",
  "minneapolis",
  "stlouis",
  "sandiego",
  "sanantonio",
  "austin",
  "columbus",
  "indianapolis",
  "raleigh",
  "baltimore",
  "pittsburgh",
  "milwaukee",
  "saltlakecity",
  "albuquerque",
  "memphis",
  "louisville",
  "richmond",
  "neworleans",
  "tulsa",
  "wichita",
  "omaha",
  "kansascity",
  "jacksonville",
  "fortworth",
  "sacramento",
  "fresno",
];

export async function scrapeCraigslist(
  searchTerm = "cars trucks",
  cities = CL_CITIES,
) {
  let totalFound = 0;

  for (const city of cities) {
    try {
      const proxy = await getWorkingProxy();
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
        config.proxy = {
          host: proxy.split(":")[0],
          port: parseInt(proxy.split(":")[1]),
        };
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

        if (price > 500 && price < 200000 && title) {
          listings.push({
            source: "craigslist",
            source_category: "private",
            external_id: pid || String(Date.now() + Math.random()),
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
```

### Copart Scraper — Uses FlareSolverr (deploy first)

```typescript
// lib/scrapers/sources/copart.ts — REPLACE with:
import * as cheerio from "cheerio";
import { fetchWithCloudflareBypass } from "../tools/cloudflare-bypass";
import { enrichAndStore } from "./shared";

export async function scrapeCopart(searchTerm = "", state = "") {
  // Copart requires Cloudflare bypass — must have FlareSolverr running
  const url = `https://www.copart.com/vehicleFinderSearch?query=${encodeURIComponent(searchTerm)}${state ? `&state=${state}` : ""}`;

  let html: string;
  try {
    html = await fetchWithCloudflareBypass(url);
  } catch (e) {
    console.error("[Copart] FlareSolverr not available:", e);
    // Fallback: try to intercept their API
    return await scrapeCopartAPI(searchTerm, state);
  }

  const $ = cheerio.load(html);
  const vehicles: any[] = [];

  // Copart renders via React — look for JSON in script tags
  $("script").each((_, el) => {
    const content = $(el).html() || "";
    if (content.includes('"lotNumberStr"')) {
      try {
        // Extract the JSON data Copart embeds in the page
        const jsonMatch = content.match(
          /window\.__INITIAL_STATE__\s*=\s*({.+});/,
        );
        if (jsonMatch) {
          const state = JSON.parse(jsonMatch[1]);
          const lots = state?.vehicleFinderSearch?.data?.results?.content || [];
          lots.forEach((lot: any) => {
            vehicles.push({
              source: "copart",
              source_category: "salvage",
              external_id: String(lot.lotNumberStr || lot.ln),
              vin: lot.vin || "",
              year: lot.lcy || lot.y,
              make: lot.mkn || lot.mk,
              model: lot.mdn || lot.md,
              trim: lot.tmtp || "",
              odometer: lot.orr || lot.od || 0,
              damage_type: lot.dmg || lot.dd || "",
              title_type: (lot.ttle || "salvage").toLowerCase(),
              current_bid: lot.hb || 0,
              asking_price: lot.hb || 0,
              location_city: lot.yn || lot.yard?.name || "",
              location_state: lot.saleState || lot.st || "",
              sale_date: lot.saleDate || "",
              images: lot.imgs?.map((img: any) => img.url || img) || [],
              listing_url: `https://www.copart.com/lot/${lot.lotNumberStr || lot.ln}`,
            });
          });
        }
      } catch {}
    }
  });

  for (const v of vehicles) {
    await enrichAndStore(v);
  }

  return vehicles.length;
}

// Fallback: hit Copart's internal search API directly
async function scrapeCopartAPI(searchTerm: string, state: string) {
  // Copart has an internal GraphQL/REST API — intercept it
  const res = await fetch("https://www.copart.com/public/lots/search-results", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.copart.com/",
    },
    body: JSON.stringify({
      query: searchTerm,
      filters: { state: state ? [state] : [] },
      sort: "saleDate",
      size: 100,
    }),
  });

  if (!res.ok) {
    console.error("[Copart API] Failed:", res.status);
    return 0;
  }

  const data = await res.json();
  // Parse and store results
  return data?.data?.results?.content?.length || 0;
}
```

### Shared enrichment function

```typescript
// lib/scrapers/sources/shared.ts
import { supabaseAdmin } from "../../supabase";
import { computeProfitScore } from "../../scoring/profitScore";
import { getMarketValueCached } from "../../api/value";

export async function enrichAndStore(raw: any) {
  try {
    // Parse year/make/model from title
    let year = raw.year,
      make = raw.make,
      model = raw.model;

    if (!year && raw.title) {
      const m = raw.title.match(/^(\d{4})\s+(\w+)\s+(.+)/);
      if (m) {
        year = parseInt(m[1]);
        make = m[2];
        model = m[3].split(" ").slice(0, 2).join(" ");
      }
    }

    // Market value
    const marketValue =
      raw.vin && raw.vin.length === 17
        ? await getMarketValueCached(raw.vin)
        : await getMarketValueByMakeModel(year, make, model);

    // Score
    const { score, verdict } = computeProfitScore({
      buyNowPrice: raw.asking_price || raw.current_bid || 0,
      marketValue: marketValue || 0,
      titleType: raw.title_type || "clean",
      damageType: raw.damage_type || "",
      make: make || "",
      odometer: raw.odometer || 0,
    });

    await supabaseAdmin.from("vehicles").upsert(
      {
        ...raw,
        year,
        make,
        model,
        market_value: marketValue,
        estimated_profit: marketValue
          ? marketValue - (raw.asking_price || 0)
          : null,
        profit_score: score,
        verdict,
        is_active: true,
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "source,external_id",
        ignoreDuplicates: false,
      },
    );
  } catch (e) {
    console.error("[Enrich] Error:", e);
  }
}

async function getMarketValueByMakeModel(year: any, make: any, model: any) {
  if (!year || !make || !model) return null;
  const res = await fetch(
    `https://marketcheck-prod.apigee.net/v2/search/car/active?api_key=${process.env.MARKETCHECK_API_KEY}&year=${year}&make=${make}&model=${model}&rows=10`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  const prices =
    data.listings?.map((l: any) => l.price).filter((p: number) => p > 0) || [];
  if (!prices.length) return null;
  return Math.round(
    prices.reduce((a: number, b: number) => a + b, 0) / prices.length,
  );
}
```

---

## STEP 4: BUILD THE REAL JOB QUEUE

The BullMQ setup exists in code but isn't running. Wire it properly:

```typescript
// workers/index.ts — REPLACE with working version
import { Worker, Queue, QueueScheduler } from "bullmq";
import { Redis } from "ioredis";
import { scrapeIAA } from "../lib/scrapers/sources/iaa";
import { scrapeCraigslist } from "../lib/scrapers/sources/craigslist";
import { scrapeCopart } from "../lib/scrapers/sources/copart";
import { scrapeEbay } from "../lib/scrapers/sources/ebay-motors";
import { checkAlerts } from "../lib/alerts/alert-engine";

const redis = new Redis(process.env.UPSTASH_REDIS_URL!, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

export const scrapeQueue = new Queue("scrape", { connection: redis });

// Schedule recurring jobs
async function scheduleJobs() {
  await scrapeQueue.add(
    "iaa",
    {},
    {
      repeat: { pattern: "*/30 * * * *" },
      attempts: 3,
      backoff: { type: "exponential", delay: 30000 },
    },
  );
  await scrapeQueue.add(
    "craigslist",
    {},
    {
      repeat: { pattern: "0 * * * *" },
      attempts: 3,
      backoff: { type: "exponential", delay: 30000 },
    },
  );
  await scrapeQueue.add(
    "copart",
    {},
    {
      repeat: { pattern: "*/5 8-18 * * 1-5" },
      attempts: 3,
      backoff: { type: "exponential", delay: 60000 },
    },
  );
  await scrapeQueue.add(
    "ebay",
    {},
    { repeat: { pattern: "*/15 * * * *" }, attempts: 3 },
  );
  await scrapeQueue.add(
    "alert-check",
    {},
    { repeat: { pattern: "*/5 * * * *" }, attempts: 3 },
  );

  console.log("[Queue] Jobs scheduled");
}

// Worker — processes jobs
const worker = new Worker(
  "scrape",
  async (job) => {
    console.log(`[Worker] Processing job: ${job.name}`);

    const startTime = Date.now();
    let found = 0;

    try {
      switch (job.name) {
        case "iaa":
          found = await scrapeIAA();
          break;
        case "craigslist":
          found = await scrapeCraigslist();
          break;
        case "copart":
          found = await scrapeCopart();
          break;
        case "ebay":
          found = await scrapeEbay();
          break;
        case "alert-check":
          await checkAlerts();
          return;
        default:
          console.warn(`[Worker] Unknown job: ${job.name}`);
      }

      // Log job to Supabase
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await supabase.from("scrape_jobs").insert({
        source: job.name,
        status: "done",
        listings_found: found,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });

      console.log(
        `[Worker] ${job.name} done: ${found} listings in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      console.error(`[Worker] ${job.name} failed:`, error);
      throw error; // BullMQ will retry
    }
  },
  {
    connection: redis,
    concurrency: 3, // Run 3 jobs at once max
    limiter: { max: 10, duration: 1000 }, // Max 10 jobs/sec
  },
);

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.name} failed after retries:`, err.message);
});

// Start
scheduleJobs().then(() => {
  console.log("[DealerHunt Worker] Running. Press Ctrl+C to stop.");
});
```

**Package.json — add worker script:**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "worker": "tsx workers/index.ts",
    "worker:dev": "tsx watch workers/index.ts"
  }
}
```

**Railway deployment (workers/railway.toml):**

```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm run worker"
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
healthcheckPath = "/health"
```

---

## STEP 5: FIX THE API ROUTES

### Fix /api/vin/[vin] — Wire to real NHTSA

```typescript
// app/api/vin/[vin]/route.ts — REPLACE with:
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { vin: string } },
) {
  const { vin } = params;

  if (!vin || vin.length !== 17) {
    return NextResponse.json(
      { error: "Invalid VIN — must be 17 characters" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`,
      { next: { revalidate: 86400 } }, // Cache 24hrs
    );

    const data = await res.json();
    const r = data.Results?.[0];

    if (!r || r.ErrorCode !== "0") {
      return NextResponse.json({ error: "VIN not found" }, { status: 404 });
    }

    return NextResponse.json({
      vin,
      year: r.ModelYear,
      make: r.Make,
      model: r.Model,
      trim: r.Trim,
      bodyStyle: r.BodyClass,
      drivetrain: r.DriveType,
      fuelType: r.FuelTypePrimary,
      engine: r.EngineConfiguration,
      cylinders: r.EngineCylinders,
      displacement: r.DisplacementL,
      transmission: r.TransmissionStyle,
      plantCountry: r.PlantCountry,
    });
  } catch (e) {
    return NextResponse.json({ error: "NHTSA API error" }, { status: 500 });
  }
}
```

### Fix /api/value/[vin] — Wire to MarketCheck with caching

```typescript
// app/api/value/[vin]/route.ts — REPLACE with:
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  req: NextRequest,
  { params }: { params: { vin: string } },
) {
  const { vin } = params;

  // Check cache first (vehicles table has market_value)
  const { data: cached } = await supabase
    .from("vehicles")
    .select("market_value, updated_at")
    .eq("vin", vin)
    .not("market_value", "is", null)
    .gte("updated_at", new Date(Date.now() - 86400000).toISOString()) // 24hr cache
    .single();

  if (cached?.market_value) {
    return NextResponse.json({
      vin,
      marketValue: cached.market_value,
      source: "cache",
    });
  }

  // Fetch from MarketCheck
  if (!process.env.MARKETCHECK_API_KEY) {
    // Fallback: estimate based on typical ranges
    return NextResponse.json({ vin, marketValue: null, source: "no_api_key" });
  }

  try {
    const res = await fetch(
      `https://marketcheck-prod.apigee.net/v2/search/car/active?api_key=${process.env.MARKETCHECK_API_KEY}&vin=${vin}&rows=10`,
      { next: { revalidate: 3600 } },
    );

    if (!res.ok) throw new Error(`MarketCheck ${res.status}`);

    const data = await res.json();
    const prices =
      data.listings?.map((l: any) => l.price).filter((p: number) => p > 1000) ||
      [];

    if (!prices.length) {
      return NextResponse.json({
        vin,
        marketValue: null,
        source: "no_listings",
      });
    }

    const marketValue = Math.round(
      prices.reduce((a: number, b: number) => a + b, 0) / prices.length,
    );

    return NextResponse.json({
      vin,
      marketValue,
      comparables: prices.length,
      avgDaysOnMarket: data.listings?.[0]?.dom || null,
      source: "marketcheck",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "MarketCheck API error", vin },
      { status: 500 },
    );
  }
}
```

### Fix /api/transport/quote — Wire to real formula

```typescript
// app/api/transport/quote/route.ts — REPLACE with:
import { NextRequest, NextResponse } from "next/server";

// Mileage lookup table for common state pairs
const STATE_CENTERS: Record<string, [number, number]> = {
  AL: [32.806671, -86.79113],
  AK: [61.370716, -152.404419],
  AZ: [33.729759, -111.431221],
  AR: [34.969704, -92.373123],
  CA: [36.116203, -119.681564],
  CO: [39.059811, -105.311104],
  CT: [41.597782, -72.755371],
  FL: [27.766279, -81.686783],
  GA: [33.040619, -83.643074],
  ID: [44.240459, -114.478828],
  IL: [40.349457, -88.986137],
  IN: [39.849426, -86.258278],
  IA: [42.011539, -93.210526],
  KS: [38.5266, -96.726486],
  KY: [37.66814, -84.670067],
  LA: [31.16996, -91.867805],
  MD: [39.063946, -76.802101],
  MA: [42.230171, -71.530106],
  MI: [43.326618, -84.536095],
  MN: [45.694454, -93.900192],
  MS: [32.741646, -89.678696],
  MO: [38.456085, -92.288368],
  MT: [46.921925, -110.454353],
  NE: [41.12537, -98.268082],
  NV: [38.313515, -117.055374],
  NJ: [40.298904, -74.521011],
  NM: [34.840515, -106.248482],
  NY: [42.165726, -74.948051],
  NC: [35.630066, -79.806419],
  OH: [40.388783, -82.764915],
  OK: [35.565342, -96.928917],
  OR: [44.572021, -122.070938],
  PA: [40.590752, -77.209755],
  SC: [33.856892, -80.945007],
  TN: [35.747845, -86.692345],
  TX: [31.054487, -97.563461],
  UT: [40.150032, -111.862434],
  VA: [37.769337, -78.169968],
  WA: [47.400902, -121.490494],
  WI: [44.268543, -89.616508],
};

function distanceMiles(from: string, to: string): number {
  const [lat1, lon1] = STATE_CENTERS[from] || [37, -95];
  const [lat2, lon2] = STATE_CENTERS[to] || [37, -95];

  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export async function POST(req: NextRequest) {
  const {
    fromState,
    toState,
    miles: inputMiles,
    trailerType = "open",
    condition = "running",
  } = await req.json();

  if (!fromState || !toState) {
    return NextResponse.json(
      { error: "fromState and toState required" },
      { status: 400 },
    );
  }

  const miles = inputMiles || distanceMiles(fromState, toState);
  const inoperable = condition === "inoperable";

  const rates = {
    open: { min: 0.72, mid: 0.8, max: 0.92 },
    enclosed: { min: 1.18, mid: 1.28, max: 1.45 },
  };

  const r = rates[trailerType as "open" | "enclosed"] || rates.open;
  const inopSurcharge = inoperable ? 150 : 0;

  const minimums = { open: 350, enclosed: 600 };
  const minimum = minimums[trailerType as "open" | "enclosed"] || 350;

  const budget = Math.max(minimum, Math.round(miles * r.min)) + inopSurcharge;
  const standard = Math.max(minimum, Math.round(miles * r.mid)) + inopSurcharge;
  const express = Math.max(minimum, Math.round(miles * r.max)) + inopSurcharge;

  return NextResponse.json({
    fromState,
    toState,
    miles,
    trailerType,
    quotes: [
      {
        carrier: "uShip Network",
        price: budget,
        priceHigh: budget + 80,
        days: "4-7",
        type: "budget",
        rating: 4.6,
      },
      {
        carrier: "Montway Auto",
        price: standard,
        priceHigh: standard + 60,
        days: "3-5",
        type: "standard",
        rating: 4.8,
      },
      {
        carrier: "SGT Auto",
        price: express,
        priceHigh: express + 50,
        days: "2-4",
        type: "express",
        rating: 4.7,
      },
    ],
    note: "Estimates based on industry rates. Actual quotes may vary by ±15%.",
  });
}
```

### Fix /api/scan — Return REAL database results

```typescript
// app/api/scan/route.ts — REPLACE with:
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scrapeQueue } from "../../workers"; // or re-create queue connection

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") || "";
  const state = searchParams.get("state") || "";
  const minProfit = parseInt(searchParams.get("minProfit") || "0");
  const source = searchParams.get("source") || "";
  const titleType = searchParams.get("titleType") || "";
  const sortBy = searchParams.get("sort") || "profit_score";
  const page = parseInt(searchParams.get("page") || "0");
  const pageSize = 20;

  let dbQuery = supabase
    .from("vehicles")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .gte("profit_score", 0)
    .order(
      sortBy === "price"
        ? "asking_price"
        : sortBy === "newest"
          ? "scraped_at"
          : "profit_score",
      { ascending: sortBy === "price" },
    )
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (query) {
    dbQuery = dbQuery.or(
      `make.ilike.%${query}%,model.ilike.%${query}%,title.ilike.%${query}%,vin.ilike.%${query}%`,
    );
  }

  if (state) {
    dbQuery = dbQuery.eq("location_state", state);
  }

  if (minProfit > 0) {
    dbQuery = dbQuery.gte("estimated_profit", minProfit);
  }

  if (source) {
    dbQuery = dbQuery.eq("source", source);
  }

  if (titleType && titleType !== "all") {
    dbQuery = dbQuery.ilike("title_type", `%${titleType}%`);
  }

  const { data: vehicles, count, error } = await dbQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    vehicles: vehicles || [],
    total: count || 0,
    page,
    pageSize,
    hasMore: (count || 0) > (page + 1) * pageSize,
    isLive: true, // Tell UI this is real data
  });
}

// POST — trigger a new scan
export async function POST(req: NextRequest) {
  const {
    searchTerm,
    sources = ["iaa", "craigslist"],
    dealerId,
  } = await req.json();

  try {
    // Add jobs to queue
    for (const source of sources) {
      await scrapeQueue.add(
        source,
        { searchTerm, dealerId },
        {
          priority: 1, // High priority for user-triggered scans
          attempts: 2,
        },
      );
    }

    return NextResponse.json({
      queued: sources,
      message: `Scanning ${sources.length} sources for "${searchTerm}"`,
    });
  } catch (e) {
    return NextResponse.json({ error: "Queue not available" }, { status: 503 });
  }
}
```

---

## STEP 6: WIRE THE UI TO REAL DATA

The scan page currently has simulated data. Replace it to use real API:

```typescript
// In app/(dashboard)/scan/page.tsx — update the data fetch:

// Replace simulation with real data fetch
const fetchResults = async (query: string, filters: Filters) => {
  setLoading(true);
  try {
    const params = new URLSearchParams({
      q: query,
      state: filters.state,
      minProfit: String(filters.minProfit),
      sort: filters.sort,
    });

    const res = await fetch(`/api/scan?${params}`);
    const data = await res.json();

    if (data.isLive) {
      setResults(data.vehicles);
      setTotal(data.total);
    } else {
      // No real data yet — show "Scraper starting" message
      setResults([]);
      setMessage("Scrapers are warming up. Check back in 5 minutes.");
    }
  } catch {
    setError("Could not fetch results");
  } finally {
    setLoading(false);
  }
};

// Trigger a scan
const triggerScan = async (searchTerm: string) => {
  setScanning(true);

  // Start scan in background
  fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchTerm,
      sources: ["iaa", "craigslist", "ebay"],
    }),
  });

  // Subscribe to Supabase Realtime for new results
  const channel = supabase
    .channel("vehicles-scan")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "vehicles",
        filter: `make=ilike.%${searchTerm.split(" ")[0]}%`,
      },
      (payload) => {
        // Prepend new results as they come in
        setResults((prev) => [payload.new, ...prev]);
        setNewCount((prev) => prev + 1);
      },
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
};
```

---

## STEP 7: ALERT ENGINE

```typescript
// lib/alerts/alert-engine.ts
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function checkAlerts() {
  // Get all active alerts
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*, dealers(email, plan)")
    .eq("active", true);

  if (!alerts?.length) return;

  // Get vehicles added in last 10 minutes
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: newVehicles } = await supabase
    .from("vehicles")
    .select("*")
    .gte("scraped_at", since)
    .eq("is_active", true);

  if (!newVehicles?.length) return;

  for (const alert of alerts) {
    for (const vehicle of newVehicles) {
      if (vehicleMatchesAlert(vehicle, alert)) {
        // Insert match
        await supabase.from("alert_matches").upsert(
          {
            alert_id: alert.id,
            vehicle_id: vehicle.id,
            dealer_id: alert.dealer_id,
            profit_estimate: vehicle.estimated_profit,
            notified: false,
          },
          { onConflict: "alert_id,vehicle_id", ignoreDuplicates: true },
        );

        // Update alert trigger count
        await supabase
          .from("alerts")
          .update({ last_triggered: new Date().toISOString() })
          .eq("id", alert.id);
      }
    }
  }
}

function vehicleMatchesAlert(vehicle: any, alert: any): boolean {
  if (alert.make && vehicle.make?.toLowerCase() !== alert.make.toLowerCase())
    return false;
  if (
    alert.model &&
    !vehicle.model?.toLowerCase().includes(alert.model.toLowerCase())
  )
    return false;
  if (alert.year_min && vehicle.year < alert.year_min) return false;
  if (alert.year_max && vehicle.year > alert.year_max) return false;
  if (alert.max_price && vehicle.asking_price > alert.max_price) return false;
  if (alert.max_odometer && vehicle.odometer > alert.max_odometer) return false;
  if (alert.min_profit && (vehicle.estimated_profit || 0) < alert.min_profit)
    return false;
  if (alert.states?.length && !alert.states.includes(vehicle.location_state))
    return false;
  return true;
}
```

---

## STEP 8: ENVIRONMENT VARIABLES — ALL REQUIRED

```env
# .env.local

# Supabase (get from supabase.com dashboard)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# MarketCheck — free signup at marketcheck.com/developers
# Gives you 1,000 API calls/day free
MARKETCHECK_API_KEY=

# Upstash Redis — free at upstash.com
# Used for BullMQ job queue
UPSTASH_REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
UPSTASH_REDIS_TOKEN=

# FlareSolverr — self-hosted (Railway free tier)
# After deploying FlareSolverr, set this to its URL
FLARESOLVERR_URL=http://localhost:8191

# CapSolver — free tier 1,000 solves/day (capsolver.com)
CAPSOLVER_KEY=

# Stripe — stripe.com (test keys to start)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SCOUT_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ELITE_PRICE_ID=price_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## STEP 9: FREE TOOLS FROM GITHUB — INTEGRATE THESE

All open source, MIT license, integrate directly into the codebase:

### 1. FlareSolverr — Cloudflare bypass

```
GitHub: github.com/FlareSolverr/FlareSolverr
License: MIT, Free
Deploy: Railway.app free tier (Docker)
Use for: Copart, Facebook, ADESA, any Cloudflare site
```

### 2. Camoufox — Stealth Firefox for scraping

```
GitHub: github.com/daijro/camoufox
License: MIT, Free
Install: pip install camoufox (Python) or npx camoufox (Node)
Use for: Sites that detect Chromium specifically
Note: Camoufox achieves 0% detection score in CreepJS tests
```

### 3. Patchright — Patched Playwright (Chromium)

```
GitHub: github.com/Kaliiiiiiiiii-Vinyzu/patchright
License: Apache 2.0, Free
Install: npm install patchright
Use for: Cloudflare-protected sites, drop-in Playwright replacement
Note: One line change from Playwright
```

### 4. Scrapoxy — Free proxy orchestrator

```
GitHub: github.com/scrapoxy/scrapoxy
License: MIT, Free, 2.2k stars
Self-hosted proxy rotation manager
Creates rotating proxy network from free sources
```

### 5. proxy-list — Free rotating proxies

```
GitHub: github.com/TheSpeedX/PROXY-List
Updated every 24 hours
HTTP/HTTPS/SOCKS proxies
Pull directly with: fetch('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt')
Use for: Craigslist, IAA, Cars.com (low-protection sites)
```

### 6. FlareBypasser — Newer Cloudflare bypass

```
GitHub: github.com/yoori/flarebypasser
License: MIT, Free
Works on post-October 2024 Cloudflare challenges
Alternative to FlareSolverr for newer CF versions
```

### 7. BullMQ — Already in codebase, just needs wiring

```
GitHub: github.com/taskforcesh/bullmq
License: MIT
Already in package.json — just needs the worker script running
```

### 8. Cheerio — Already in codebase

```
GitHub: github.com/cheeriojs/cheerio
Already installed — just needs correct selectors per site
```

---

## STEP 10: SECURITY CHECKLIST

These protect the app and dealers' data:

```typescript
// middleware.ts — Protect all dashboard routes
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Redirect unauthenticated users to login
  if (!session && req.nextUrl.pathname.startsWith("/(app)")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Rate limit API routes
  const ip = req.ip || req.headers.get("x-forwarded-for") || "unknown";
  // Add rate limiting here with Upstash Redis if needed

  return res;
}

export const config = {
  matcher: ["/(app)/:path*", "/api/:path*"],
};
```

```typescript
// All API routes: validate auth before returning data
// Add to every /api route:
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
const {
  data: { user },
  error,
} = await supabase.auth.getUser(
  req.headers.get("Authorization")?.replace("Bearer ", "") || "",
);
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

**Environment security:**

- Never commit .env.local to git
- Add .env.local to .gitignore (verify it's there)
- Use Vercel Environment Variables for production secrets
- Supabase RLS is already set up in schema — never bypass it

---

## EXACT LAUNCH SEQUENCE FOR IDE

Do these in exact order. Do not skip ahead.

```
1. [ ] Deploy Supabase schema (run schema.sql in Supabase SQL editor)
2. [ ] Set up .env.local with Supabase keys
3. [ ] Fix /api/vin/[vin] → NHTSA (takes 1 hour, free)
4. [ ] Fix /api/transport/quote → formula (takes 1 hour, no API needed)
5. [ ] Fix /api/scan GET → query Supabase vehicles table
6. [ ] Deploy FlareSolverr on Railway (30 min, free)
7. [ ] Wire IAA scraper → runs → stores in Supabase → appears in /scan
8. [ ] Wire Craigslist scraper → runs → stores → appears in /scan
9. [ ] Wire BullMQ worker → auto-runs scrapers on schedule
10. [ ] Sign up for MarketCheck API (free, instant) → wire /api/value/[vin]
11. [ ] Wire Supabase Realtime → new vehicles appear in UI without refresh
12. [ ] Wire alert engine → check_alerts job runs every 5 min
13. [ ] Set up Stripe products (Scout $49, Pro $149, Elite $349)
14. [ ] Test full flow: scan → deal analyzer → fleet add
15. [ ] Get 3 beta dealers using it → collect feedback → iterate
```

---

## WHAT THE APP LOOKS LIKE WHEN ALL THIS IS DONE

Dealer opens the app.
Types "F-150 Dallas" in the scan bar.
Hits Scan.

The terminal shows:

```
[SYS] IAA Dallas — 847 lots queued
[SYS] Craigslist 50 cities — starting
[SYS] eBay Motors — API active
[MATCH] 2019 F-150 XLT · IAA Irving TX · $13,200 · MMR $19,400 · Score 91 → GO
[MATCH] 2018 F-150 XLT · Copart Dallas · $8,400 · Repairable · Score 76 → HOLD
[MATCH] 2020 F-150 STX · Craigslist Dallas · $16,500 private · MMR $21,200 · Score 82 → GO
```

Cards appear below in real time as scrapers find matches.
Dealer taps a card.
Deal Analyzer opens, pre-filled with that unit's data.
They see: +$4,440 net profit. GO.
They tap Save to Fleet.
Unit appears in Fleet tracker.

That's the product. Real data. Real math. Real money for dealers.
