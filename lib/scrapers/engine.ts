// lib/scrapers/engine.ts
// ─── Universal Crawler Engine ─────────────────────────────────────────────────
// Handles: JS-heavy SPAs, static HTML, pagination, proxy rotation,
// stealth mode, rate limiting, retry with backoff, structured extraction

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import * as cheerio from "cheerio";
import pRetry from "p-retry";
import pLimit from "p-limit";
import { AdaptiveEngine } from "./adaptive-engine";
import {
  getProxyManager,
  proxyConfigToAxios,
  type ProxyConfig,
} from "./bypass/proxy-manager";
import { fetchWithCloudflareBypass } from "./bypass/flaresolverr";
import {
  applyStealth,
  applyContextStealth,
  waitForPageLoad,
} from "./bypass/stealth-engine";
import { userAgentRotator } from "./bypass/user-agent-pool";
import { escalatedFetch } from "./tools/escalation";

let _adaptiveEngine: AdaptiveEngine | null = null;

function getAdaptiveEngine(): AdaptiveEngine {
  if (!_adaptiveEngine) {
    _adaptiveEngine = new AdaptiveEngine({ alwaysProbeStatic: true });
  }
  return _adaptiveEngine;
}

// ─── Config ──────────────────────────────────────────────────────────────────
export interface ScraperConfig {
  name: string;
  baseUrl: string;
  // How to render: 'static' = cheerio only, 'browser' = full Playwright, 'adaptive' = static first then browser
  renderMode: "static" | "browser" | "adaptive";
  // Milliseconds between requests to this source (rate limit)
  requestDelay: number;
  // Max concurrent requests
  concurrency: number;
  // Rotate through these proxies (Bright Data / Oxylabs format)
  useProxies: boolean;
  // Inject stealth scripts to avoid bot detection
  stealth: boolean;
  // Max pages to crawl per run
  maxPages: number;
  // Custom headers
  headers?: Record<string, string>;
  // User agents to rotate
  userAgents?: string[];
}

// ─── Proxy pool (enhanced with ProxyManager) ─────────────────────────────────
function getProxy():
  | { server: string; username: string; password: string }
  | undefined {
  const proxyManager = getProxyManager();

  if (!proxyManager.hasProxies()) return undefined;

  const proxy = proxyManager.getRandom();
  if (!proxy) return undefined;

  return {
    server: `http://${proxy.host}:${proxy.port}`,
    username: proxy.username || "",
    password: proxy.password || "",
  };
}

// ─── User agent pool ─────────────────────────────────────────────────────────
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

function randomUA(overrides?: string[]) {
  const pool = overrides?.length ? overrides : USER_AGENTS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Browser pool (singleton per process) ────────────────────────────────────
let _browser: Browser | null = null;

async function getBrowser(config: ScraperConfig): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  _browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-web-security",
      "--window-size=1400,900",
    ],
  });
  return _browser;
}

// ─── Stealth injection (now using advanced stealth engine) ───────────────────
async function injectStealth(page: Page, config: ScraperConfig) {
  // Use advanced stealth engine if enabled
  if (config.stealth) {
    await applyStealth(page, {
      randomizeFingerprint: true,
      simulateHumanBehavior: true,
      randomizeTimings: true,
      spoofWebGL: true,
      spoofCanvas: true,
    });
  } else {
    // Fallback to basic stealth
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });
    });
  }
}

// ─── Core fetch — static HTML, with tiered escalation ────────────────────────
// Redesign: direct fetch → FlareSolverr (auto, when FLARESOLVERR_URL is set). Block-page detection
// means Cloudflare/challenge responses transparently retry through FlareSolverr instead of silently
// parsing a challenge page as "0 listings". Browser rendering stays the job of renderMode:
// 'browser'|'adaptive' (this path is for 'static' sources).
export async function fetchHtml(
  url: string,
  config: ScraperConfig,
): Promise<cheerio.CheerioAPI> {
  const result = await escalatedFetch(url, {
    headers: {
      "Accept-Encoding": "gzip, deflate, br",
      "Cache-Control": "no-cache",
      ...config.headers,
    },
    userAgent: randomUA(config.userAgents),
    label: config.name,
    retries: 3,
  });

  if (result.html) {
    if (result.strategy === "flaresolverr") {
      console.log(`[${config.name}] served via FlareSolverr`);
    }
    return cheerio.load(result.html);
  }

  // Both cheap tiers blocked. Static sources can't escalate to browser here — surface the failure
  // so the orchestrator records it (and the circuit breaker can trip).
  throw new Error(
    `[${config.name}] fetch blocked for ${url} (direct + FlareSolverr exhausted)`,
  );
}

// ─── Core fetch — full browser with Playwright ───────────────────────────────
export async function fetchBrowser(
  url: string,
  config: ScraperConfig,
  waitForSelector?: string,
): Promise<{
  page: Page;
  $: (sel: string) => cheerio.Cheerio<any>;
  html: string;
  close: () => Promise<void>;
}> {
  const browser = await getBrowser(config);
  const proxy = config.useProxies ? getProxy() : undefined;

  const context: BrowserContext = await browser.newContext({
    userAgent: randomUA(config.userAgents),
    proxy,
    viewport: { width: 1400, height: 900 },
    locale: "en-US",
    timezoneId: "America/Chicago",
    extraHTTPHeaders: config.headers,
    javaScriptEnabled: true,
    bypassCSP: true,
  });

  const page = await context.newPage();

  if (config.stealth) {
    await injectStealth(page, config);
  }

  // Block images/fonts/ads to speed up scraping
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (["image", "media", "font", "stylesheet"].includes(type)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  await pRetry(
    async () => {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }
    },
    { retries: 2, minTimeout: 3000 },
  );

  const html = await page.content();
  const $root = cheerio.load(html);

  return {
    page,
    $: (sel: string) => $root(sel),
    html,
    close: () => context.close(),
  };
}

// ─── Paginator — crawls all pages automatically ───────────────────────────────
export async function* paginate<T>(
  config: ScraperConfig,
  getPageUrl: (page: number) => string,
  parsePage: (
    html: string | cheerio.CheerioAPI,
  ) => Promise<{ items: T[]; hasMore: boolean }>,
): AsyncGenerator<T[]> {
  const limit = pLimit(config.concurrency);
  let pageNum = 1;

  while (pageNum <= config.maxPages) {
    const url = getPageUrl(pageNum);
    console.log(`[${config.name}] Crawling page ${pageNum}: ${url}`);

    const result = await limit(async () => {
      await sleep(config.requestDelay);
      if (config.renderMode === "static") {
        const $ = await fetchHtml(url, config);
        return parsePage($);
      } else {
        // browser or adaptive — let the adaptive engine decide cheapest method
        const adaptive = getAdaptiveEngine();
        const { html, close } = await adaptive.fetch(url, config);
        const parsed = await parsePage(html);
        await close();
        return parsed;
      }
    });

    if (!result.items.length) break;
    yield result.items;
    if (!result.hasMore) break;
    pageNum++;
  }
}

// ─── Text extractors ─────────────────────────────────────────────────────────
export function extractPrice(text: string): number | undefined {
  const match = text.replace(/,/g, "").match(/\$?([\d]+(?:\.\d{1,2})?)/);
  return match ? Math.round(parseFloat(match[1])) : undefined;
}

export function extractMileage(text: string): number | undefined {
  const match = text.replace(/,/g, "").match(/([\d]+)\s*(?:mi|miles|mileage)/i);
  return match ? parseInt(match[1]) : undefined;
}

export function extractYear(text: string): number | undefined {
  const match = text.match(/\b(19[89]\d|20[0-3]\d)\b/);
  return match ? parseInt(match[1]) : undefined;
}

// ─── URL normalizer ───────────────────────────────────────────────────────────
export function normalizeUrl(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}
