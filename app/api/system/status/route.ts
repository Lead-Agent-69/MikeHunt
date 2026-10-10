export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { canManageOperations } from "@/lib/auth/admin-operations";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { loadProfitableMakes } from "@/lib/intelligence/profitable-segments";
import { cached } from "@/lib/cache";
import { computeValuationAccuracy } from "@/lib/scoring/accuracy";
import { systemReadiness } from "@/lib/system-readiness";
import { sourceFromUrl, sourceMeta } from "@/lib/sources/source-meta";
import { buildRealDataReadiness } from "@/lib/real-data-readiness";
import { sellerContact } from "@/lib/data/deal-contact";
import { loadSourceSla } from "@/lib/scrapers/ops/sla";
import { summarizeReliability, type RunRow } from "@/lib/scrapers/reliability";
import {
  applyAuthProviderReadiness,
  readAuthProviderReadiness,
  unconfiguredAuthProviders,
} from "@/lib/auth/provider-readiness";

function statusSource(row: any) {
  return sourceFromUrl(row.source_url) || row.source || "unknown";
}

/** Stored-row age from deals.last_seen_at. Never "live": rows on file are not a scrape heartbeat. */
export function sourceListingStatus(active: number, ageHours: number | null) {
  if (active <= 0) return "idle";
  if (ageHours != null && ageHours > 72) return "stale";
  return "stored";
}

/** Same wording as listing cards: Seen just now / Seen Nh ago / Seen Nd ago. */
export function lastSeenLabel(ageHours: number | null) {
  if (ageHours == null) return "Last seen unknown";
  if (ageHours < 1) return "Seen just now";
  if (ageHours < 24) return `Seen ${ageHours}h ago`;
  const days = Math.max(1, Math.round(ageHours / 24));
  return `Seen ${days}d ago`;
}

export function mergeStatusSources(runHealth: any[], sourceBreakdown: any[]) {
  const bySource = new Map<string, any>();
  for (const row of runHealth || []) {
    bySource.set(String(row.source || "unknown"), { ...row });
  }
  for (const row of sourceBreakdown || []) {
    const source = String(row.source || "unknown");
    const current = bySource.get(source) || { source };
    const activeRows = Number(row.active || 0);
    const photoCoveragePct = Number(row.photoPct || 0);
    const freshnessHours =
      typeof row.ageHours === "number" ? row.ageHours : null;
    // Rows on file are ready whether or not they are fresh. Age is last-seen, not "Working"/"live".
    const readiness = activeRows > 0 ? "ready" : "no_rows";
    bySource.set(source, {
      ...current,
      source,
      id: source,
      readiness,
      userStatus:
        readiness === "ready" ? lastSeenLabel(freshnessHours) : "No rows",
      activeRows,
      rowsWithPhotos: Math.round((activeRows * photoCoveragePct) / 100),
      photoCoveragePct,
      freshnessHours,
      lastSeenAt:
        freshnessHours == null
          ? current.last_ok || current.last_run || null
          : new Date(Date.now() - freshnessHours * 3600_000).toISOString(),
      nextAction:
        readiness === "ready"
          ? "Open Scan to review stored listings. Last seen is not a live scrape."
          : "Run or broaden this source before expecting inventory.",
    });
  }
  return Array.from(bySource.values()).sort((a, b) => {
    const rank: Record<string, number> = {
      ready: 0,
      needs_run: 1,
      no_rows: 2,
      needs_login: 3,
      blocked: 4,
    };
    const ar = rank[a.readiness] ?? 9;
    const br = rank[b.readiness] ?? 9;
    if (ar !== br) return ar - br;
    return Number(b.activeRows || 0) - Number(a.activeRows || 0);
  });
}

export function summarizeSourceHealth(sources: any[], realData?: any) {
  const rows = Array.isArray(sources) ? sources : [];
  const ready = rows.filter((source) => source.readiness === "ready");
  const needsLogin = rows.filter(
    (source) => source.readiness === "needs_login",
  );
  const blocked = rows.filter((source) => source.readiness === "blocked");
  const noRows = rows.filter((source) => source.readiness === "no_rows");
  const needsRun = rows.filter((source) => source.readiness === "needs_run");
  const activeRows = rows.reduce(
    (sum, source) => sum + Number(source.activeRows || 0),
    0,
  );
  const rowsWithPhotos = rows.reduce(
    (sum, source) => sum + Number(source.rowsWithPhotos || 0),
    0,
  );
  return {
    readySources: ready.length,
    needsLoginSources: needsLogin.length,
    blockedSources: blocked.length,
    noRowSources: noRows.length,
    needsRunSources: needsRun.length,
    totalSources: rows.length,
    activeRows,
    activeDeals: realData?.activeDeals ?? activeRows,
    rowsWithPhotos,
    photoCoveragePct: activeRows
      ? Math.round((rowsWithPhotos / activeRows) * 100)
      : 0,
    buyerReady: Boolean(realData?.buyerReady),
    decisionReady: Boolean(realData?.decisionReady),
    topSources: ready
      .slice()
      .sort((a, b) => Number(b.activeRows || 0) - Number(a.activeRows || 0))
      .slice(0, 5),
  };
}

// GET /api/system/status — the app's self-awareness: data freshness, per-source health (with
// self-heal flags), and data-quality coverage. Read-only; powers the status surface and lets the
// system (and the dealer) see whether it's running itself.
async function computeFullStatus(): Promise<Record<string, any>> {
  const configured = isSupabaseConfigured();
  const authProviders = configured
    ? await cached(
        "status:auth-providers:v1",
        300_000,
        readAuthProviderReadiness,
        (result) => result.reachable,
      )
    : unconfiguredAuthProviders();
  const readiness = applyAuthProviderReadiness(
    systemReadiness(),
    authProviders,
  );
  if (!configured) {
    const realData = buildRealDataReadiness({
      activeDeals: 0,
      newLast24h: 0,
      newestAgeHours: null,
      photoPct: 0,
      sourceLinkPct: 0,
      pricePct: 0,
      titlePct: 0,
      damagePct: 0,
      mileagePct: 0,
      vinPct: 0,
      sellerPct: 0,
      sellerContactPct: 0,
      auctionDatePct: 0,
      decisionReady: false,
    });
    return {
      configured: false,
      authProviders,
      readiness,
      realData,
      buyerReady: realData.buyerReady,
      decisionReady: realData.decisionReady,
      activeDeals: realData.activeDeals,
      sourceHealth: summarizeSourceHealth([], realData),
      sourceBreakdown: [],
      valuationAccuracy: null,
      knowledgeBase: {
        marketValueBacked: 0,
        marketValuePct: 0,
        resaleEstimateBacked: 0,
        resaleEstimatePct: 0,
        dealMathReady: 0,
        dealMathReadyPct: 0,
        soldComps: 0,
        aggregateGroups: 0,
      },
      learning: {
        outcomesLogged: 0,
        prioritizedMakes: [],
      },
      freshness: {
        activeDeals: 0,
        newLast24h: 0,
        newLast7d: 0,
        updatedLast24h: 0,
        newestAgeHours: null,
        stale: true,
      },
      quality: {
        goDeals: 0,
        watchCandidates: 0,
        vinPct: 0,
        imagePct: 0,
        geocodedPct: 0,
        cityPct: 0,
        titlePct: 0,
        damagePct: 0,
        mileagePct: 0,
        pricePct: 0,
        sellerPct: 0,
        sellerContactPct: 0,
        auctionDatePct: 0,
        sourceLinkPct: 0,
        detailCoverage: {
          counts: {
            photo: 0,
            vin: 0,
            title: 0,
            damage: 0,
            mileage: 0,
            location: 0,
            price: 0,
            seller: 0,
            sellerContact: 0,
            auction: 0,
            source: 0,
          },
          total: 0,
        },
      },
      sources: [],
      recentRuns: [],
    };
  }

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
    watchCandidates,
    health,
    recent,
    newest,
    qualityRows,
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
    countActive((q: any) =>
      q
        .gte("ask_price", 3000)
        .gt("sell_estimate", 0)
        .not("true_net_profit", "is", null)
        .lt("true_net_profit", 0),
    ),
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
      .select("last_seen_at")
      .eq("active", true)
      .not("last_seen_at", "is", null)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((r: any) => r.data?.last_seen_at ?? null),
    sb
      .from("deals")
      .select(
        "images, vin, title, condition, damage_type, mileage, location_city, location_state, ask_price, auction_end_at, source_url, options",
      )
      .eq("active", true)
      .limit(5000)
      .then((r: any) => r.data ?? []),
  ]);

  const pct = (n: number) => (active ? Math.round((n / active) * 100) : 0);
  const hoursSince = newest
    ? Math.round((Date.now() - new Date(newest).getTime()) / 3600_000)
    : null;
  const qualityBase = qualityRows.length || active || 0;
  const qualityCount = (predicate: (row: any) => boolean) =>
    qualityRows.reduce(
      (sum: number, row: any) => sum + (predicate(row) ? 1 : 0),
      0,
    );
  const qualityPct = (n: number) =>
    qualityBase ? Math.round((n / qualityBase) * 100) : 0;
  const hasContact = (row: any) => {
    const contact = sellerContact(row);
    return Boolean(contact.phone || contact.email || contact.url);
  };
  const hasSellerProof = (row: any) => {
    if (hasContact(row)) return true;
    const sourceKey = statusSource(row);
    const meta = sourceMeta(sourceKey);
    return Boolean(row.source_url || row.source || meta.channel);
  };
  const detailCoverage = {
    photo: qualityCount(
      (row) => Array.isArray(row.images) && row.images.length > 0,
    ),
    vin: qualityCount((row) => Boolean(row.vin)),
    title: qualityCount((row) => Boolean(row.title)),
    damage: qualityCount((row) => Boolean(row.condition || row.damage_type)),
    mileage: qualityCount((row) => Number(row.mileage || 0) > 0),
    location: qualityCount((row) =>
      Boolean(row.location_city || row.location_state),
    ),
    price: qualityCount((row) => Number(row.ask_price || 0) > 0),
    seller: qualityCount(hasSellerProof),
    sellerContact: qualityCount(hasContact),
    auction: qualityCount((row) => Boolean(row.auction_end_at)),
    source: qualityCount((row) => Boolean(row.source_url)),
  };
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
  const [
    marketValueBacked,
    resaleEstimateBacked,
    dealMathReady,
    soldComps,
    aggregateGroups,
  ] = await Promise.all([
    countActive((q: any) => q.gt("mmr_value", 0)),
    countActive((q: any) => q.gt("sell_estimate", 0)),
    countActive((q: any) =>
      q
        .gt("sell_estimate", 0)
        .not("true_net_profit", "is", null)
        .not("profit_score", "is", null),
    ),
    sb
      .from("sold_listings")
      .select("id", { count: "exact", head: true })
      .then((r: any) => r.count ?? 0),
    sb
      .from("market_aggregates")
      .select("year", { count: "exact", head: true })
      .then((r: any) => r.count ?? 0),
  ]);

  const realData = buildRealDataReadiness({
    activeDeals: active,
    newLast24h: new24,
    newestAgeHours: hoursSince,
    photoPct: pct(withImages),
    sourceLinkPct: qualityPct(detailCoverage.source),
    pricePct: qualityPct(detailCoverage.price),
    titlePct: qualityPct(detailCoverage.title),
    damagePct: qualityPct(detailCoverage.damage),
    mileagePct: qualityPct(detailCoverage.mileage),
    vinPct: pct(withVin),
    sellerPct: qualityPct(detailCoverage.seller),
    sellerContactPct: qualityPct(detailCoverage.sellerContact),
    auctionDatePct: qualityPct(detailCoverage.auction),
    decisionReady: go > 0 && soldComps > 0,
  });

  // Per-source health, computed live and cached 5 min. Some sources share a DB enum
  // (`gov_auction`, `independent_dealer`), so group by source URL when we know the host.
  const sourceBreakdown = await cached(
    "status:source-breakdown:v6",
    300_000,
    async () => {
      const pageSize = 1000;
      const data: any[] = [];
      for (let page = 0; page < 20; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data: pageRows } = await sb
          .from("deals")
          .select("source, source_url, images, last_seen_at, created_at")
          .eq("active", true)
          .range(from, to);
        data.push(...(pageRows || []));
        if (!pageRows || pageRows.length < pageSize) break;
      }
      const groups = new Map<
        string,
        { active: number; withImages: number; newest: string | null }
      >();
      for (const row of data || []) {
        const key = statusSource(row);
        const group = groups.get(key) || {
          active: 0,
          withImages: 0,
          newest: null,
        };
        group.active += 1;
        if (Array.isArray(row.images) && row.images.length)
          group.withImages += 1;
        const seen = row.last_seen_at || row.created_at || null;
        if (
          seen &&
          (!group.newest ||
            new Date(seen).getTime() > new Date(group.newest).getTime())
        ) {
          group.newest = seen;
        }
        groups.set(key, group);
      }
      return Array.from(groups.entries())
        .map(([source, group]) => {
          const ageHours = group.newest
            ? Math.round(
                (Date.now() - new Date(group.newest).getTime()) / 3600_000,
              )
            : null;
          return {
            source,
            active: group.active,
            photoPct: group.active
              ? Math.round((group.withImages / group.active) * 100)
              : 0,
            ageHours,
            status: sourceListingStatus(group.active, ageHours),
          };
        })
        .filter((row) => row.active > 0)
        .sort((a, b) => b.active - a.active);
    },
  );

  // Live valuation accuracy — out-of-sample backtest vs real retail prices. Heavy (loads the comp
  // index + scores a held-out slice), so cache it an hour. Null until there's enough data.
  const valuationAccuracy = await cached(
    "status:valuation-accuracy",
    3600_000,
    () => computeValuationAccuracy(sb).catch(() => null),
  );

  // Scraper success rate (7d, productive runs only) + crawler ban-risk from the latest worker job.
  // Operator-only: both live in the full payload, never in toPublicStatus.
  // Source health SLA (one row per source) + scraper version: service-role reads only.
  const scraperReliability = await cached(
    "status:scraper-reliability:v2",
    300_000,
    async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const runsQuery = (cols: string) =>
        sb
          .from("scraper_runs")
          .select(cols)
          .gt("started_at", since)
          .order("started_at", { ascending: false })
          .limit(2000);
      const loadRuns = async () => {
        const withOutcome = await runsQuery(
          "source, status, deals_found, started_at, completed_at, outcome",
        );
        if (!withOutcome.error) return withOutcome;
        return runsQuery("source, status, deals_found, started_at, completed_at");
      };
      const [{ data: runs }, { data: job }, sla] = await Promise.all([
        loadRuns(),
        sb
          .from("scrape_jobs")
          .select("completed_at, result")
          .eq("status", "completed")
          .not("result->politeness", "is", null)
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        loadSourceSla(sb).catch(() => null),
      ]);
      return {
        window: "7d",
        ...summarizeReliability(((runs as unknown) as RunRow[]) || []),
        sla,
        version: sla?.version ?? null,
        politeness: job?.result?.politeness
          ? { reportedAt: job.completed_at, ...job.result.politeness }
          : null,
      };
    },
  ).catch(() => null);

  const mergedSources = mergeStatusSources(health, sourceBreakdown);
  const sourceHealth = summarizeSourceHealth(mergedSources, realData);

  return {
    configured: true,
    authProviders,
    readiness,
    realData,
    buyerReady: realData.buyerReady,
    decisionReady: realData.decisionReady,
    activeDeals: active,
    readySources: sourceHealth.readySources,
    sourceHealth,
    sourceBreakdown,
    valuationAccuracy,
    knowledgeBase: {
      marketValueBacked,
      marketValuePct: pct(marketValueBacked),
      resaleEstimateBacked,
      resaleEstimatePct: pct(resaleEstimateBacked),
      dealMathReady,
      dealMathReadyPct: pct(dealMathReady),
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
      watchCandidates,
      vinPct: pct(withVin),
      imagePct: pct(withImages),
      geocodedPct: pct(geocoded),
      cityPct: pct(withCity),
      titlePct: qualityPct(detailCoverage.title),
      damagePct: qualityPct(detailCoverage.damage),
      mileagePct: qualityPct(detailCoverage.mileage),
      pricePct: qualityPct(detailCoverage.price),
      sellerPct: qualityPct(detailCoverage.seller),
      sellerContactPct: qualityPct(detailCoverage.sellerContact),
      auctionDatePct: qualityPct(detailCoverage.auction),
      sourceLinkPct: qualityPct(detailCoverage.source),
      detailCoverage: {
        counts: detailCoverage,
        total: qualityBase,
      },
    },
    sources: mergedSources,
    recentRuns: recent,
    scraperReliability,
  };
}

const PUBLIC_READINESS_IDS = new Set(["google-login"]);

/**
 * Public projection of the status payload. Anonymous and non-admin callers (register page, Google
 * button, Today pulse, Scan) only need headline counts and sign-in readiness. Per-source health,
 * scraper runs, env key presence, diagnostics, valuation backtests and learning internals stay
 * admin-only.
 */
export function toPublicStatus(full: Record<string, any>) {
  const auth = full?.authProviders || {};
  const readiness = full?.readiness || {};
  const items = Array.isArray(readiness.items) ? readiness.items : [];
  const freshness = full?.freshness || {};
  const quality = full?.quality || {};
  return {
    configured: Boolean(full?.configured),
    scope: "public" as const,
    authProviders: {
      reachable: Boolean(auth.reachable),
      google: typeof auth.google === "boolean" ? auth.google : null,
      email: typeof auth.email === "boolean" ? auth.email : null,
      checkedAt: auth.checkedAt ?? null,
    },
    readiness: {
      ready: Boolean(readiness.ready),
      items: items
        .filter((item: any) => PUBLIC_READINESS_IDS.has(String(item?.id)))
        .map((item: any) => ({
          id: item.id,
          label: item.label,
          status: item.status,
          nextStep:
            item.status === "ready"
              ? "Google sign-in is available."
              : "Use email sign-in while Google sign-in is unavailable.",
          actionLabel: "Sign in",
        })),
    },
    buyerReady: Boolean(full?.buyerReady),
    decisionReady: Boolean(full?.decisionReady),
    activeDeals: Number(full?.activeDeals || 0),
    sourceHealth: {
      readySources: Number(full?.sourceHealth?.readySources || 0),
      activeDeals: Number(full?.sourceHealth?.activeDeals || 0),
    },
    freshness: {
      activeDeals: Number(freshness.activeDeals || 0),
      newLast24h: Number(freshness.newLast24h || 0),
      newestAgeHours:
        typeof freshness.newestAgeHours === "number"
          ? freshness.newestAgeHours
          : null,
      stale: freshness.stale !== false,
    },
    quality: {
      goDeals: Number(quality.goDeals || 0),
      watchCandidates: Number(quality.watchCandidates || 0),
    },
  };
}

// GET /api/system/status
// Admin (ADMIN_EMAIL session or INGEST_SECRET bearer): full self-awareness payload for /status.
// Everyone else: a cached public projection with headline counts only. The full build runs a
// dozen count queries plus multi-page scans, so anonymous traffic only ever hits the cache.
export async function GET(request: NextRequest) {
  if (await canManageOperations(request)) {
    return NextResponse.json(await computeFullStatus(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const payload = await cached("status:public:v1", 120_000, async () =>
    toPublicStatus(await computeFullStatus()),
  );
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
