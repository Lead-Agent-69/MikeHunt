export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { loadProfitableMakes } from "@/lib/intelligence/profitable-segments";
import { cached } from "@/lib/cache";
import { computeValuationAccuracy } from "@/lib/scoring/accuracy";

const KNOWN_SOURCES = [
  "copart",
  "craigslist",
  "craigslist_dealer",
  "carvana",
  "cars_com",
  "autotrader",
  "cargurus",
  "truecar",
  "ebay_motors",
  "independent_dealer",
  "gov_auction",
  "iaa",
  "facebook_marketplace",
  "offerup",
];

// GET /api/system/status — the app's self-awareness: data freshness, per-source health (with
// self-heal flags), and data-quality coverage. Read-only; powers the status surface and lets the
// system (and the dealer) see whether it's running itself.
export async function GET() {
  const sb = createServerComponentClient();
  const since24 = new Date(Date.now() - 86400_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400_000).toISOString();

  const countActive = (build: (q: any) => any) =>
    build(
      sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
    ).then((r: any) => r.count ?? 0);

  const [
    active,
    new24,
    new7,
    updated24,
    withVin,
    withImages,
    geocoded,
    withCity,
    go,
    health,
    recent,
    newest,
  ] = await Promise.all([
    countActive((q: any) => q),
    countActive((q: any) => q.gt("created_at", since24)),
    countActive((q: any) => q.gt("created_at", since7)),
    countActive((q: any) => q.gt("updated_at", since24)),
    countActive((q: any) => q.not("vin", "is", null).neq("vin", "")),
    countActive((q: any) => q.not("images", "is", null).neq("images", "{}")),
    countActive((q: any) => q.not("lat", "is", null)),
    countActive((q: any) => q.not("location_city", "is", null)),
    countActive((q: any) => q.eq("deal_verdict", "go")),
    sb
      .from("source_health")
      .select("*")
      .then((r: any) => r.data ?? []),
    sb
      .from("scraper_runs")
      .select("source, status, deals_found, deals_new, duration_ms, started_at")
      .order("started_at", { ascending: false })
      .limit(20)
      .then((r: any) =>
        // `ok`/`run_at` are kept because the status page renders them; scraper_runs stores the richer
        // status + started_at.
        (r.data ?? []).map((row: any) => ({
          ...row,
          ok: row.status === "success" && row.deals_found > 0,
          run_at: row.started_at,
        })),
      ),
    sb
      .from("deals")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: any) => r.data?.created_at ?? null),
  ]);

  const pct = (n: number) => (active ? Math.round((n / active) * 100) : 0);
  const hoursSince = newest
    ? Math.round((Date.now() - new Date(newest).getTime()) / 3600_000)
    : null;

  // Closed-loop learning: makes the dealer has profited on that the pipeline now prioritizes.
  const [outcomesLogged, profitableMakes] = await Promise.all([
    sb
      .from("deal_outcomes")
      .select("id", { count: "exact", head: true })
      .then((r: any) => r.count ?? 0),
    loadProfitableMakes()
      .then((s) => Array.from(s))
      .catch(() => [] as string[]),
  ]);

  // Price knowledge base: the value signals that feed valuation accuracy and compound as we scrape.
  // marketValueBacked = deals carrying a real third-party market value (e.g. AutoTrader's free KBB
  // Fair Purchase Price); soldComps = real completed-sale price points; aggregateGroups = learned
  // make/model/year/state value buckets the nightly rollup builds from mmr_value.
  const [marketValueBacked, soldComps, aggregateGroups] = await Promise.all([
    countActive((q: any) => q.gt("mmr_value", 0)),
    sb
      .from("sold_listings")
      .select("id", { count: "exact", head: true })
      .then((r: any) => r.count ?? 0),
    sb
      .from("market_aggregates")
      .select("year", { count: "exact", head: true })
      .then((r: any) => r.count ?? 0),
  ]);

  // Per-source health, computed live and cached 5 min: which sources are actually working, fresh, and
  // SHOWING the cars (photo coverage). This is the actionable view behind the aggregate numbers — Copart
  // at 0% photos vs retail at 100% only shows up here. Parallel count queries per known source.
  const sourceBreakdown = await cached("status:source-breakdown", 300_000, () =>
    Promise.all(
      KNOWN_SOURCES.map(async (src) => {
        const base = () =>
          sb
            .from("deals")
            .select("id", { count: "exact", head: true })
            .eq("active", true)
            .eq("source", src);
        const [n, withImg, freshRow] = await Promise.all([
          base().then((r: any) => r.count ?? 0),
          base()
            .not("images", "is", null)
            .neq("images", "{}")
            .then((r: any) => r.count ?? 0),
          sb
            .from("deals")
            .select("last_seen_at,created_at")
            .eq("active", true)
            .eq("source", src)
            .order("last_seen_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
            .then((r: any) => r.data ?? null),
        ]);
        const freshTs = freshRow?.last_seen_at || freshRow?.created_at || null;
        const ageH = freshTs
          ? Math.round((Date.now() - new Date(freshTs).getTime()) / 3600_000)
          : null;
        return {
          source: src,
          active: n,
          photoPct: n ? Math.round((withImg / n) * 100) : 0,
          ageHours: ageH,
          status:
            n === 0 ? "idle" : ageH == null || ageH > 72 ? "stale" : "live",
        };
      }),
    ).then((rows) =>
      rows.filter((r) => r.active > 0).sort((a, b) => b.active - a.active),
    ),
  );

  // Live valuation accuracy — out-of-sample backtest vs real retail prices. Heavy (loads the comp
  // index + scores a held-out slice), so cache it an hour. Null until there's enough data.
  const valuationAccuracy = await cached(
    "status:valuation-accuracy",
    3600_000,
    () => computeValuationAccuracy(sb).catch(() => null),
  );

  return NextResponse.json({
    sourceBreakdown,
    valuationAccuracy,
    knowledgeBase: {
      marketValueBacked,
      marketValuePct: pct(marketValueBacked),
      soldComps,
      aggregateGroups,
    },
    learning: {
      outcomesLogged,
      prioritizedMakes: profitableMakes,
    },
    freshness: {
      activeDeals: active,
      newLast24h: new24,
      newLast7d: new7,
      updatedLast24h: updated24,
      newestAgeHours: hoursSince,
      stale: hoursSince == null || hoursSince > 24,
    },
    quality: {
      goDeals: go,
      vinPct: pct(withVin),
      imagePct: pct(withImages),
      geocodedPct: pct(geocoded),
      cityPct: pct(withCity),
    },
    sources: health,
    recentRuns: recent,
  });
}
