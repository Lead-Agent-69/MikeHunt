/**
 * scrape-ci.ts — CI/cron entrypoint for the $0 scraping engine.
 *
 * Designed to run on GitHub Actions (free 2,000 min/month, full Chromium) rather
 * than Vercel serverless (which cannot run a browser). It executes the concurrent
 * orchestrator against the enabled sources and writes real deals into Supabase via
 * the existing pipeline (normalize → quality → score → upsert → dedupe → match).
 *
 * Source selection (in priority order):
 *   1. CLI args:           npm run scrape:ci -- craigslist cars_com
 *   2. SCRAPE_SOURCES env: SCRAPE_SOURCES="craigslist,cars_com"
 *   3. Terms-safe default set (lib/scrapers/ci-sources.ts): $0 sources minus TOS_RESTRICTED_SOURCES.
 *
 * Exit codes: 0 on any success (partial blocks are expected for some sources);
 * 1 only if every requested source failed, which signals a real breakage.
 */
import "../workers/polyfill";
import * as dotenv from "dotenv";
import path from "path";
import { resolveCiSources } from "../lib/scrapers/ci-sources";

// Load env BEFORE importing the scraper — the Craigslist module resolves its city list at import,
// so adaptive selection (below) must set CL_CITIES first. Hence runScrapers is imported dynamically.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// Global safety net: catch any unhandled crash so it surfaces in logs instead of
// leaving a scraper_run row stuck in 'running' with no error_message.
process.on("uncaughtException", (err) => {
  console.error("[scrape-ci] uncaughtException:", err?.stack || err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("[scrape-ci] unhandledRejection:", reason);
  process.exit(1);
});

// Source selection lives in lib/scrapers/ci-sources.ts. The default set is the runner-enabled
// $0 candidates minus TOS_RESTRICTED_SOURCES (same rule as the Zeus sweep and the public preview
// routes). A restricted source runs only when named in CLI args or SCRAPE_SOURCES, and that
// opt-in is logged every run.
function resolveSources(): string[] {
  const selection = resolveCiSources(process.argv.slice(2).filter(Boolean));
  if (selection.optedInRestricted.length) {
    console.warn(
      `[scrape-ci] ${selection.origin === "args" ? "CLI args opt" : "SCRAPE_SOURCES opts"} into sources whose terms ban automated access: ${selection.optedInRestricted.join(", ")} (see TOS_RESTRICTED_SOURCES)`,
    );
  }
  if (selection.origin === "default") {
    console.log(
      `[scrape-ci] terms-safe default sources: ${selection.sources.join(", ")}`,
    );
  }
  return selection.sources;
}

// Fetch real detail-page photos/VIN/mileage for active GO deals that still lack images.
async function enrichGoBacklog(limit: number): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const { enrichCraigslistDetail } =
    await import("../lib/scrapers/sources/index");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await sb
    .from("deals")
    .select("id, source_url, vin")
    .eq("active", true)
    .in("deal_verdict", ["go", "hold"])
    .in("source", ["craigslist", "craigslist_dealer"])
    .not("source_url", "is", null)
    .or("images.is.null,images.eq.{}")
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  let n = 0;
  for (const d of data || []) {
    try {
      const extra = await enrichCraigslistDetail(d.source_url as string);
      const patch: any = {};
      if (Array.isArray(extra.images) && extra.images.length)
        patch.images = extra.images.slice(0, 12);
      if (extra.vin && !d.vin) patch.vin = extra.vin;
      if (extra.mileage) patch.mileage = extra.mileage;
      if (Object.keys(patch).length) {
        await sb.from("deals").update(patch).eq("id", d.id);
        n++;
      }
    } catch {
      /* skip */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (n) console.log(`🖼️  topped up ${n} GO deals with real photos/VIN`);
}

// DATA LIFECYCLE — keep Supabase bounded WITHOUT ever touching a dealer's saved data. Two phases:
//   1) Demote: an active listing not re-seen in 30d is treated as gone → active=false (reversible —
//      if a later scrape sees it again, the upsert flips it back). It drops out of the live feed but
//      isn't deleted.
//   2) Prune: a long-dead listing (inactive, not seen in 90d) is DELETED — EXCEPT any deal a dealer
//      has touched (watchlist / fleet inventory / saved cars / logged outcomes / alert matches). Those
//      are their data and are never removed. alert_matches rows for prunable deals are cleared first
//      (NO ACTION FK), then the deals go (CASCADE handles the rest).
async function pruneStaleDeals(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const days = (n: number) =>
    new Date(Date.now() - n * 86_400_000).toISOString();

  // 1) Demote stale active listings (reversible).
  const { count: demoted } = await sb
    .from("deals")
    .update({ active: false }, { count: "exact" })
    .eq("active", true)
    .lt("last_seen_at", days(30));

  // 2) Collect deals a dealer has touched — these are NEVER deleted.
  const protectedIds = new Set<string>();
  for (const t of [
    "watchlist",
    "inventory",
    "saved_cars",
    "deal_outcomes",
    "alert_matches",
  ]) {
    const { data } = await sb
      .from(t)
      .select("deal_id")
      .not("deal_id", "is", null);
    for (const r of data || []) if (r.deal_id) protectedIds.add(r.deal_id);
  }

  // 3) Candidates: long-dead listings. Filter out anything protected, then delete in chunks.
  const { data: cand } = await sb
    .from("deals")
    .select("id")
    .eq("active", false)
    .lt("last_seen_at", days(90))
    .limit(8000);
  const toDelete = (cand || [])
    .map((c: any) => c.id)
    .filter((id: string) => !protectedIds.has(id));

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 200) {
    const chunk = toDelete.slice(i, i + 200);
    // Clear notification matches first (NO ACTION FK would otherwise block the delete).
    await sb.from("alert_matches").delete().in("deal_id", chunk);
    const { error } = await sb.from("deals").delete().in("id", chunk);
    if (!error) deleted += chunk.length;
  }
  console.log(
    `🧹 retention: demoted ${demoted ?? 0} stale, pruned ${deleted} dead listings, protected ${protectedIds.size} saved`,
  );
}

// CL listing cards don't carry odometer — the real mileage lives on each detail page. This bounded
// pass pulls mileage (+ VIN) for active CL deals that still lack it, best deals first, so mileage-
// aware valuation + the price-vs-mileage visualizer light up across our biggest source over runs.
async function enrichMileageBacklog(limit: number): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const { enrichCraigslistDetail } =
    await import("../lib/scrapers/sources/index");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await sb
    .from("deals")
    .select("id, source_url, vin")
    .eq("active", true)
    .in("source", ["craigslist", "craigslist_dealer"])
    .not("source_url", "is", null)
    .or("mileage.is.null,mileage.eq.0")
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  let n = 0;
  for (const d of data || []) {
    try {
      const extra = await enrichCraigslistDetail(d.source_url as string);
      const patch: any = {};
      if (extra.mileage) patch.mileage = extra.mileage;
      if (extra.vin && !d.vin) patch.vin = extra.vin;
      if (Object.keys(patch).length) {
        await sb.from("deals").update(patch).eq("id", d.id);
        n++;
      }
    } catch {
      /* skip */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  if (n) console.log(`📏 filled mileage on ${n} CL deals from detail pages`);
}

// Decode + canonicalize active deals whose VINs haven't been decoded yet — cleans make/model and
// adds the real trim from NHTSA (VIN = ground truth). Bounded per cycle; converges over time.
async function canonicalizeNew(limit: number): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const { decodeVin } = await import("../lib/vehicle/nhtsa");
  const { isValidVin } = await import("../lib/vehicle/vin");
  const { titleCaseMake, canonicalModel } =
    await import("../lib/vehicle/canonical");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: deals } = await sb
    .from("deals")
    .select("id, vin, make, model, trim")
    .eq("active", true)
    .not("vin", "is", null)
    .neq("vin", "")
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(400);
  if (!deals?.length) return;

  const vins = Array.from(new Set(deals.map((d) => d.vin)));
  const { data: existing } = await sb
    .from("vin_decodes")
    .select("vin")
    .in("vin", vins);
  const done = new Set((existing || []).map((d) => d.vin));

  let n = 0;
  for (const d of deals) {
    if (n >= limit) break;
    if (!d.vin || done.has(d.vin) || !isValidVin(d.vin)) continue;
    const dec = await decodeVin(d.vin);
    if (dec?.make && dec.model) {
      try {
        await sb.from("vin_decodes").upsert(
          {
            vin: d.vin,
            make: dec.make,
            model: dec.model,
            trim: dec.trim,
            body_class: dec.bodyClass,
            drive_type: dec.driveType,
            fuel_type: dec.fuelType,
            cylinders: dec.cylinders,
            displacement_l: dec.displacementL,
            plant_country: dec.plantCountry,
            made_in_usa: dec.madeInUsa,
          },
          { onConflict: "vin" },
        );
      } catch {
        /* ignore */
      }
      const make = titleCaseMake(dec.make);
      const model = canonicalModel(dec.model);
      const patch: any = {};
      if (make && make !== d.make) patch.make = make;
      if (model && model !== d.model) patch.model = model;
      if (dec.trim && !d.trim) patch.trim = dec.trim;
      // Denormalize decoded signals onto the deal for the grid cards.
      if (dec.bodyClass) patch.body_class = dec.bodyClass;
      if (dec.plantCountry) patch.assembly_country = dec.plantCountry;
      if (Object.keys(patch).length)
        await sb.from("deals").update(patch).eq("id", d.id);
      n++;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  if (n) console.log(`🏷️  canonicalized ${n} deals from VIN`);
}

// Permanently host top GO deals' photos in Supabase Storage (instant, no hotlink/proxy, no expiry).
async function cacheGoPhotos(limit: number): Promise<void> {
  if (!Number.isFinite(limit) || limit <= 0) {
    console.log("photo hosting skipped - CACHE_PHOTOS_MAX=0");
    return;
  }
  const { createClient } = await import("@supabase/supabase-js");
  const { cacheVehiclePhotos } = await import("../lib/images/cache");
  const { photoCacheAllowed } = await import("../lib/scrapers/access-class");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await sb
    .from("deals")
    .select("id, images, source, source_url")
    .eq("active", true)
    .eq("deal_verdict", "go")
    .or("images_cached.is.null,images_cached.eq.false")
    .not("images", "is", null)
    .neq("images", "{}")
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(limit);
  let n = 0;
  for (const d of data || []) {
    // Ren #269: copy photos only for api/allowed sources (lib/scrapers/access-class.ts).
    if (!photoCacheAllowed(d)) continue;
    const urls = (Array.isArray(d.images) ? d.images : []).filter((u: string) =>
      /^https?:\/\//.test(u),
    );
    if (!urls.length) {
      await sb.from("deals").update({ images_cached: true }).eq("id", d.id);
      continue;
    }
    const hosted = await cacheVehiclePhotos(sb, d.id, urls, 5);
    if (hosted.length) {
      await sb
        .from("deals")
        .update({ images: hosted, images_cached: true })
        .eq("id", d.id);
      n++;
    }
  }
  if (n) console.log(`📦 hosted ${n} GO deals' photos in storage`);
}

async function main() {
  const sources = resolveSources();

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      "❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — cannot persist deals.",
    );
    process.exit(1);
  }
  // Reap scraper_runs stuck in 'running' for more than 24h (crashed / killed workers), so health
  // and the sweep stop treating them as in progress (e.g. craigslist stuck since 2026-10-05).
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { reapTimedOutRuns, RUN_TIMEOUT_HOURS } =
      await import("../lib/scrapers/run-recovery");
    const reaped = await reapTimedOutRuns(
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ) as any,
    );
    if (reaped)
      console.log(
        `⏱️  reaped ${reaped} scraper run(s) stuck 'running' > ${RUN_TIMEOUT_HOURS}h`,
      );
  } catch (e) {
    console.warn("run reaper skipped:", (e as Error).message);
  }
  if (!process.env.FLARESOLVERR_URL) {
    console.warn(
      "⚠️  FLARESOLVERR_URL not set — Cloudflare-gated sources (cars_com/autotrader/cargurus) may be blocked.",
    );
  }

  // Adaptive scheduling: scrape the stalest cities first (unless CL_CITIES is explicitly pinned).
  if (
    process.env.CL_ADAPTIVE === "1" &&
    sources.includes("craigslist") &&
    !process.env.CL_CITIES
  ) {
    try {
      const { rankCitiesByStaleness, recommendBatchSize } =
        await import("../lib/scrapers/adaptive");
      const ranked = await rankCitiesByStaleness();
      if (ranked.length) {
        // Freshness-aware cadence: explicit count wins, else scale to how far behind we are.
        const explicit = parseInt(process.env.CL_ADAPTIVE_COUNT || "0", 10);
        const count = explicit > 0 ? explicit : recommendBatchSize(ranked);
        const cities = ranked.slice(0, count).map((c) => c.site);
        process.env.CL_CITIES = cities.join(",");
        const staleCount = ranked.filter(
          (c) => c.ageHours == null || c.ageHours > 4,
        ).length;
        console.log(
          `🧭 adaptive: ${staleCount} stale of ${ranked.length} → scraping ${cities.length} → ${cities.slice(0, 6).join(", ")}…`,
        );
      }
    } catch (e) {
      console.warn("adaptive selection failed; using default rotation:", e);
    }
  }

  console.log(`🚀 scrape:ci starting — sources: ${sources.join(", ")}`);
  const startedAt = Date.now();

  // Dynamic import so the adaptive CL_CITIES above is in place before the scraper resolves cities.
  const { runScrapers } = await import("../lib/scrapers/runner");
  const concurrency = parseInt(process.env.SCRAPE_CONCURRENCY || "3", 10);
  console.log(`⚙️  concurrency: ${concurrency}`);
  const results = await runScrapers({
    orchestrator: "concurrent",
    sourceIds: sources,
    concurrency,
    dryRun: false,
    onSourceComplete: (r) => {
      const icon = r.success ? "✅" : "❌";
      console.log(
        `${icon} ${r.source}: ${r.dealsFound} deals in ${Math.round(r.duration / 1000)}s${r.error ? ` — ${r.error}` : ""}`,
      );
    },
  });

  // Self-sustaining photo coverage: top up GO deals that still lack images by fetching their real
  // detail page. Keeps the surfaces the dealer sees fully illustrated, every cycle. Real data only.
  if (sources.includes("craigslist")) {
    try {
      await enrichGoBacklog(parseInt(process.env.GO_ENRICH_MAX || "80", 10));
    } catch (e) {
      console.warn("GO photo top-up skipped:", (e as Error).message);
    }
    try {
      await enrichMileageBacklog(
        parseInt(process.env.CL_MILEAGE_MAX || "150", 10),
      );
    } catch (e) {
      console.warn("mileage backfill skipped:", (e as Error).message);
    }
    try {
      await canonicalizeNew(parseInt(process.env.CANON_MAX || "40", 10));
    } catch (e) {
      console.warn("canonicalize skipped:", (e as Error).message);
    }
    // 0 (the default) skips hosting. Copying listing photos into vehicle-photos fills
    // that bucket and replaces deals.images source URLs. Opt in with CACHE_PHOTOS_MAX>0.
    const photoCacheMax = parseInt(process.env.CACHE_PHOTOS_MAX || "0", 10);
    if (photoCacheMax > 0) {
      try {
        await cacheGoPhotos(photoCacheMax);
      } catch (e) {
        console.warn("photo hosting skipped:", (e as Error).message);
      }
    }
  }

  // Micro-AI dealer path (opt-in, default OFF): enqueue curated VDPs onto aiParsingQueue.
  // Invent consumer stays DISABLED (workers/scrape-worker must not import ai-worker).
  // Only runs when ENABLE_AI_DEALER_CRAWL=1; never starts the invent worker.
  try {
    const { maybeQueueCuratedDealerInventoryFromEnv } =
      await import("../lib/scrapers/ai-dealer-producer");
    const ai = await maybeQueueCuratedDealerInventoryFromEnv();
    if (ai) {
      console.log(
        `AI dealer crawl: ${ai.sitesSucceeded}/${ai.sitesAttempted} sites → ${ai.vdpQueued} VDPs queued${
          ai.errors.length ? ` (${ai.errors.length} skipped)` : ""
        }`,
      );
    }
  } catch (e) {
    console.warn("AI dealer crawl skipped:", (e as Error).message);
  }

  // Keep the DB bounded without ever touching saved data (runs every cycle).
  try {
    await pruneStaleDeals();
  } catch (e) {
    console.warn("retention skipped:", (e as Error).message);
  }

  // VIN-graph fraud pass (runs every cycle): re-score the cross-market history so any car listed
  // "clean" that our records show was salvaged/washed/rolled-back gets demoted out of the GO list +
  // warned, before a dealer can act on it. Self-maintaining — the protection compounds with each scrape.
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const { flagVinGraph } = await import("../lib/scrapers/flag-vin-graph");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const g = await flagVinGraph(sb);
    console.log(
      `🛡️  VIN-graph: ${g.flagged} flagged, ${g.demoted} misrepresented demoted (${g.vins} VINs)`,
    );
  } catch (e) {
    console.warn("VIN-graph pass skipped:", (e as Error).message);
  }

  const totalDeals = results.reduce((sum, r) => sum + (r.dealsFound || 0), 0);
  const succeeded = results.filter((r) => r.success).length;
  const durationS = Math.round((Date.now() - startedAt) / 1000);

  console.log("\n──────── scrape:ci summary ────────");
  console.table(
    results.map((r) => ({
      source: r.source,
      ok: r.success,
      deals: r.dealsFound,
      error: r.error || "",
    })),
  );
  console.log(
    `Total: ${totalDeals} deals from ${succeeded}/${results.length} sources in ${durationS}s`,
  );

  // Tear down any warm smartFetch browsers (stealth/headed) so Chrome doesn't linger past exit.
  const { closeSmartFetch } = await import("../lib/scrapers/smart-fetch");
  await closeSmartFetch().catch(() => {});

  if (succeeded === 0) {
    console.error("❌ All sources failed — exiting non-zero.");
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ scrape:ci crashed:", err);
  process.exit(1);
});
