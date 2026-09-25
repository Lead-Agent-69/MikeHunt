// lib/scrapers/chameleon.ts
//
// THE CHAMELEON — one orchestrator that turns a bare URL into vehicles, autonomously. The faculties
// built around it each do one thing well; this composes them into a single master-class pipeline:
//
//     smartFetch ──► (escalation ladder + anti-bot detection + full arsenal: static/stealth/headed/FlareSolverr)
//         │
//         ▼  rendered HTML from the cheapest tool that beat the wall
//     detectPlatform ──► which framework, and WHERE the data lives (next-data / ld-json / spa-api / html)
//         │
//         ▼
//     genericExtract (or a caller's bespoke extractor) ──► vehicles, schema-agnostic
//         │
//         ▼
//     assess ──► a verdict: did we win? if not, the EXACT reason + the next move.
//
// The point isn't just to fetch — it's to KNOW. Every harvest returns a ChameleonReport: the wall it
// faced, the tool that won, the data strategy, the count, and — when it comes up short — a precise
// recommendation (capture the XHR API / route via aggregator / needs a clean IP). Most scrapers fetch
// blind and fail silent; this one diagnoses. Point it at a brand-new site and it self-configures.

import type { Deal } from "@/types";
import {
  smartFetch as defaultSmartFetch,
  type SmartFetchResult,
  type FetchTier,
} from "./smart-fetch";
import {
  detectAntiBot,
  detectPlatform,
  type AntiBotVendor,
  type Framework,
  type DataStrategy,
} from "./platform-detector";
import { genericExtract } from "./generic-extractor";

export interface ChameleonReport {
  url: string;
  host: string;
  /** Got usable vehicles. The single bit a caller checks. */
  ok: boolean;
  blocked: boolean;
  /** Reached the page but the wanted data never materialized (validate/extract found nothing). */
  unverified: boolean;
  tier: FetchTier; // the tool that answered
  wall: AntiBotVendor; // the anti-bot wall faced (or "none")
  framework: Framework;
  dataStrategy: DataStrategy;
  deals: Partial<Deal>[];
  count: number;
  /** Which rung of the extraction ladder produced the data. */
  extraction: "bespoke" | "structured" | "ai" | "none";
  /** One-line human summary of what happened. */
  diagnosis: string;
  /** When ok=false: the precise next move. Undefined when ok. */
  recommendation?: string;
  durationMs: number;
}

type Fetcher = (
  url: string,
  opts?: { validate?: (html: string) => boolean },
) => Promise<SmartFetchResult>;

export interface ChameleonOptions {
  /** Tag harvested deals with this source. */
  source?: string;
  /** A bespoke parser to try first; the generic extractor backstops it (self-healing). */
  extractor?: (html: string) => Partial<Deal>[];
  /** Injectable fetch (defaults to smartFetch) — for tests and for reusing a configured client. */
  fetchImpl?: Fetcher;
  /** Allow the LLM extraction rung as a last resort when structured extraction finds nothing on a
   *  reached page. Cost-gated (only fires when a provider key is set); defaults to off. */
  aiFallback?: boolean;
  /** Injectable AI extractor (for tests). Defaults to the cost-gated aiExtractVehicles. */
  aiExtractImpl?: (html: string, url: string) => Promise<Partial<Deal>[]>;
}

// Map the LLM rescue's loose shape onto Deals. Lazy-imported so the AI SDK stays off the hot path.
async function aiExtractAsDeals(
  html: string,
  url: string,
  source: string,
): Promise<Partial<Deal>[]> {
  const { aiExtractVehicles, aiExtractEnabled } =
    await import("./tools/ai-extract");
  if (!aiExtractEnabled()) return [];
  const vehicles = await aiExtractVehicles(html, url);
  return vehicles
    .filter((v) => (v.make || v.title) && (v.year || v.price))
    .map((v) => ({
      source,
      source_url: v.url,
      vin: v.vin,
      title:
        v.title || [v.year, v.make, v.model].filter(Boolean).join(" ").trim(),
      year: v.year,
      make: v.make,
      model: v.model,
      trim: v.trim,
      ask_price: v.price ?? 0,
      mileage: v.mileage,
      location_city: v.location_city,
      location_state: v.location_state,
      condition: v.condition,
      images: [],
      scraped_at: new Date().toISOString(),
    }));
}

/** Inputs to the verdict — kept pure + exported so the diagnosis logic is unit-tested in isolation. */
export interface HarvestSignals {
  blocked: boolean;
  unverified: boolean;
  wall: AntiBotVendor;
  dataStrategy: DataStrategy;
  count: number;
  tier: FetchTier;
}

/**
 * Turn the raw signals into a verdict: did we win, a human diagnosis, and — when we didn't — the exact
 * next move. This is the chameleon's "awareness" made explicit, so failures are actionable, not silent.
 */
export function assess(s: HarvestSignals): {
  ok: boolean;
  diagnosis: string;
  recommendation?: string;
} {
  if (s.count > 0) {
    return {
      ok: true,
      diagnosis: `${s.count} vehicle${s.count === 1 ? "" : "s"} via ${s.dataStrategy} (${s.tier}${s.wall !== "none" ? `, beat ${s.wall}` : ""})`,
    };
  }

  // No vehicles — figure out WHY and what to do.
  if (s.blocked) {
    if (s.wall === "datadome" || s.wall === "kasada") {
      return {
        ok: false,
        diagnosis: `blocked by ${s.wall} (no free bypass)`,
        recommendation:
          "Route this source via an aggregator (AutoTempest carries it) — no free tool beats " +
          s.wall +
          ".",
      };
    }
    if (s.wall !== "none") {
      return {
        ok: false,
        diagnosis: `blocked by ${s.wall}; the in-house arsenal didn't clear it`,
        recommendation:
          "Retry from a cleaner IP (the fleet) or enable FlareSolverr; the " +
          s.wall +
          " bypass tier may need a real display (xvfb/ENABLE_HEADED_SCRAPERS).",
      };
    }
    return {
      ok: false,
      diagnosis: "blocked by an unidentified wall",
      recommendation:
        "Capture the response on a clean-IP browser to fingerprint the wall, then map it in platform-detector.",
    };
  }

  // Reached the page, but extracted nothing.
  if (s.dataStrategy === "spa-api") {
    return {
      ok: false,
      diagnosis: "reached an empty SPA shell — data loads via XHR",
      recommendation:
        "Capture the JSON/XHR endpoint (DevTools → Network) and wire it directly, like GovDeals/GSA.",
    };
  }
  return {
    ok: false,
    diagnosis: `reached via ${s.tier} but found no vehicles in the ${s.dataStrategy}`,
    recommendation:
      s.dataStrategy === "html"
        ? "No JSON island present — this site needs a bespoke parser (selectors), or it's genuinely empty."
        : "The data island had no vehicle-shaped objects — verify the page actually lists vehicles.",
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Harvest vehicles from ANY url, autonomously. Picks the fetch tool, the extraction strategy, and
 * reports a precise verdict. A bespoke extractor (if given) wins; genericExtract self-heals behind it.
 */
export async function chameleonHarvest(
  url: string,
  opts: ChameleonOptions = {},
): Promise<ChameleonReport> {
  const started = Date.now();
  const fetcher = opts.fetchImpl || (defaultSmartFetch as Fetcher);
  const source = opts.source || hostOf(url);

  const res = await fetcher(url, {
    validate: (html) => {
      const got = opts.extractor
        ? opts.extractor(html).length > 0
        : genericExtract(html, source).length > 0;
      return got;
    },
  });

  const html = res.html || "";
  const wall = detectAntiBot(html, res.blocked ? 403 : 200).vendor;
  const { framework, dataStrategy } = detectPlatform(html);

  // Extraction ladder: bespoke parser → free structured (generic) → AI rescue (cost-gated, last). Each
  // rung backstops the one before, so the chameleon self-heals and still wins on layouts none anticipated.
  let deals: Partial<Deal>[] = [];
  let extraction: ChameleonReport["extraction"] = "none";
  if (!res.blocked && html) {
    if (opts.extractor) {
      deals = opts.extractor(html);
      if (deals.length) extraction = "bespoke";
    }
    if (deals.length === 0) {
      deals = genericExtract(html, source);
      if (deals.length) extraction = "structured";
    }
    if (deals.length === 0 && opts.aiFallback) {
      const ai = opts.aiExtractImpl
        ? await opts.aiExtractImpl(html, url)
        : await aiExtractAsDeals(html, url, source);
      if (ai.length) {
        deals = ai;
        extraction = "ai";
      }
    }
  }

  const verdict = assess({
    blocked: res.blocked,
    unverified: !!res.unverified,
    wall,
    dataStrategy,
    count: deals.length,
    tier: res.tier,
  });
  // When the LLM rung won, say so plainly instead of attributing it to the page's data strategy.
  const diagnosis =
    verdict.ok && extraction === "ai"
      ? `${deals.length} vehicle${deals.length === 1 ? "" : "s"} via AI rescue (${res.tier})`
      : verdict.diagnosis;

  return {
    url,
    host: hostOf(url),
    ok: verdict.ok,
    blocked: res.blocked,
    unverified: !!res.unverified,
    tier: res.tier,
    wall,
    framework,
    dataStrategy,
    deals,
    count: deals.length,
    extraction,
    diagnosis,
    recommendation: verdict.recommendation,
    durationMs: Date.now() - started,
  };
}
