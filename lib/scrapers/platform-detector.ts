// lib/scrapers/platform-detector.ts
//
// The chameleon's eyes. Before (and when) a fetch is walled, this reads the response and answers two
// questions that make the scraper INTELLIGENT instead of brute-force:
//   1) WHICH anti-bot wall is this? (Cloudflare / DataDome / PerimeterX / Akamai / Imperva / Kasada)
//   2) WHAT platform/framework renders the data? (Next.js / Nuxt / Angular|React SPA / ASP.NET / …)
//
// Knowing the wall lets smartFetch skip straight to the tool that's VERIFIED to beat it (and bail early on
// walls with no free bypass, instead of wasting the expensive headed tier). Knowing the platform tells the
// extractor where the data lives (a __NEXT_DATA__ JSON island vs an SPA API vs raw HTML). Pure functions,
// no I/O — fully unit-testable against captured fingerprints. The tier map is the hard-won, field-verified
// one from the source-unlock work; see the memory note "anti-bot → tool that beats it".

import type { FetchTier } from "./smart-fetch";

export type AntiBotVendor =
  | "cloudflare"
  | "datadome"
  | "perimeterx"
  | "akamai"
  | "imperva"
  | "kasada"
  | "none"
  | "unknown";

export type Framework =
  | "nextjs"
  | "nuxt"
  | "angular"
  | "react-spa"
  | "aspnet"
  | "shopify"
  | "wordpress"
  | "unknown";

export type DataStrategy =
  | "next-data" // __NEXT_DATA__ JSON island
  | "nuxt-data" // __NUXT__ / window.__NUXT__
  | "spa-api" // empty shell + JS bundle → data comes from an XHR/JSON API
  | "ld-json" // schema.org JSON-LD blocks
  | "html"; // server-rendered markup, parse directly

export interface AntiBotVerdict {
  vendor: AntiBotVendor;
  confidence: "high" | "medium" | "low";
  /** The cheapest free tool VERIFIED to beat this wall, or null when no free path exists (route around). */
  freeBypass: FetchTier | null;
}

export interface PlatformVerdict {
  framework: Framework;
  dataStrategy: DataStrategy;
}

type Headers = Record<string, string> | undefined;

function headerHas(headers: Headers, name: string, needle?: RegExp): boolean {
  if (!headers) return false;
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === name.toLowerCase()) {
      return needle ? needle.test(String(headers[k])) : true;
    }
  }
  return false;
}

// Anti-bot vendor signatures, most-specific first. Body markers are the interstitial tells; header/cookie
// markers (when available) raise confidence. Each maps to the free tool that beats it (null = none free).
interface Sig {
  vendor: AntiBotVendor;
  body: RegExp;
  header?: (h: Headers) => boolean;
  freeBypass: FetchTier | null;
}

const SIGNATURES: Sig[] = [
  {
    // DataDome — the one wall with NO free bypass (needs a paid captcha solver). Detect it FIRST so we
    // bail fast instead of wasting the headed tier. Marker: its captcha CDN + cookie/header.
    vendor: "datadome",
    body: /datadome|geo\.captcha-delivery\.com|dd_cookie|"dd":\{/i,
    header: (h) =>
      headerHas(h, "x-datadome") || headerHas(h, "set-cookie", /datadome=/i),
    freeBypass: null,
  },
  {
    // Kasada — also no free bypass (KPSDK challenge).
    vendor: "kasada",
    body: /kasada|kpsdk|x-kpsdk/i,
    header: (h) =>
      headerHas(h, "x-kpsdk-ct") || headerHas(h, "set-cookie", /KP_UIDz/i),
    freeBypass: null,
  },
  {
    // PerimeterX / HUMAN — beaten by the headed real-Chrome tier (verified on truecar). "Access to this
    // page has been denied" + px-captcha are its tells.
    vendor: "perimeterx",
    body: /px-captcha|perimeterx|_pxhd|window\._pxAppId|px\.captcha|access to this page has been denied|pardon our interruption/i,
    header: (h) => headerHas(h, "set-cookie", /_px(hd)?=/i),
    freeBypass: "headed",
  },
  {
    // Akamai Bot Manager — headed tier. "Reference #18.xxxx" error pages + _abck/bm_sz cookies.
    vendor: "akamai",
    body: /akamai|reference #\d+\.[0-9a-f]+|errors\.edgesuite\.net|_abck|ak_bmsc/i,
    header: (h) => headerHas(h, "set-cookie", /_abck=|ak_bmsc=|bm_sz=/i),
    freeBypass: "headed",
  },
  {
    // Imperva / Incapsula — headed tier (or FlareSolverr). "Incapsula incident" + incap cookies.
    vendor: "imperva",
    body: /incapsula|_incapsula_|incident id|visid_incap|incap_ses/i,
    header: (h) => headerHas(h, "set-cookie", /(visid_incap|incap_ses)/i),
    freeBypass: "headed",
  },
  {
    // Cloudflare — beaten by the stealth (Patchright headless) tier (verified on cars.com). Detect LAST
    // among walls because "just a moment" / managed-challenge markers are broad. cf-ray header confirms.
    vendor: "cloudflare",
    body: /just a moment|cf-chl|_cf_chl|cf_chl_opt|cmsg=|attention required|enable javascript and cookies to continue|cloudflare/i,
    header: (h) =>
      headerHas(h, "cf-ray") ||
      headerHas(h, "cf-mitigated") ||
      headerHas(h, "server", /cloudflare/i),
    freeBypass: "stealth",
  },
];

/**
 * Classify the anti-bot wall behind a response. `status` lets a 403/429/503 with no body still resolve.
 * Returns {vendor:"none"} when nothing wall-like is present (a normal page).
 */
export function detectAntiBot(
  html: string,
  status = 200,
  headers?: Headers,
): AntiBotVerdict {
  const sample = (html || "").slice(0, 16000);
  for (const sig of SIGNATURES) {
    const bodyHit = sig.body.test(sample);
    const headerHit = sig.header ? sig.header(headers) : false;
    if (bodyHit || headerHit) {
      // body+header agreement = high; a single strong header = high; body-only = medium.
      const confidence =
        bodyHit && headerHit ? "high" : headerHit ? "high" : "medium";
      return { vendor: sig.vendor, confidence, freeBypass: sig.freeBypass };
    }
  }
  // No vendor markers, but a hard block status with a tiny/empty body = an unidentified wall.
  if (
    (status === 403 || status === 429 || status === 503) &&
    sample.length < 800
  ) {
    return { vendor: "unknown", confidence: "low", freeBypass: null };
  }
  return { vendor: "none", confidence: "high", freeBypass: "static" };
}

/** Identify the rendering framework + where its data lives, so the extractor picks the right strategy. */
export function detectPlatform(html: string): PlatformVerdict {
  const s = html || "";
  if (/__NEXT_DATA__/.test(s))
    return { framework: "nextjs", dataStrategy: "next-data" };
  if (/window\.__NUXT__|__NUXT__|\/_nuxt\//.test(s))
    return { framework: "nuxt", dataStrategy: "nuxt-data" };
  if (/cdn\.shopify\.com|Shopify\.theme|var Shopify/.test(s))
    return { framework: "shopify", dataStrategy: "html" };
  if (/\/wp-content\/|\/wp-json\/|wp-includes/.test(s))
    return { framework: "wordpress", dataStrategy: "html" };
  // SPA shells: an almost-empty document whose data arrives via XHR. CRA/React main.<hash>.chunk.js,
  // or Angular's <app-root>/ng-version. These need an API capture, not HTML parsing.
  if (/\/static\/js\/main\.[0-9a-f]+\.chunk\.js|data-reactroot|__REACT/.test(s))
    return { framework: "react-spa", dataStrategy: "spa-api" };
  if (/ng-version=|<app-root|\/runtime\.[0-9a-f]+\.js/.test(s))
    return { framework: "angular", dataStrategy: "spa-api" };
  if (
    /__VIEWSTATE|__EVENTVALIDATION|\.aspx|AspNetCore|The resource cannot be found\./.test(
      s,
    )
  )
    return { framework: "aspnet", dataStrategy: "html" };
  // Server-rendered with a JSON-LD island we can read.
  if (/application\/ld\+json/.test(s))
    return { framework: "unknown", dataStrategy: "ld-json" };
  return { framework: "unknown", dataStrategy: "html" };
}

/**
 * One-call brain for the fetch ladder: given a (blocked) response, what tier should we jump to next?
 * Returns the verified free tool for the detected wall, or null when there's no free path (caller should
 * stop escalating and route around — e.g. via an aggregator).
 */
export function recommendedTier(
  html: string,
  status = 200,
  headers?: Headers,
): { vendor: AntiBotVendor; tier: FetchTier | null } {
  const { vendor, freeBypass } = detectAntiBot(html, status, headers);
  return { vendor, tier: freeBypass };
}
