export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { canManageOperations } from "@/lib/auth/admin-operations";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { loadProfitableMakes } from "@/lib/intelligence/profitable-segments";
import { cached } from "@/lib/cache";
import {
  inventoryFailureDiagnostic,
  publicInventoryStatus,
} from "@/lib/public-inventory-status";
import { computeValuationAccuracy } from "@/lib/scoring/accuracy";
import { systemReadiness } from "@/lib/system-readiness";
import { sourceFromUrl, sourceMeta } from "@/lib/sources/source-meta";
import { buildRealDataReadiness } from "@/lib/real-data-readiness";
import { sellerContact } from "@/lib/data/deal-contact";
import { auctionDateApplies } from "@/lib/inventory-field-applicability";
import { summarizeReliability } from "@/lib/scrapers/reliability";
import { sourceReadinessRank } from "@/lib/scrapers/source-proof-readiness";
import {
  applyAuthProviderReadiness,
  readAuthProviderReadiness,
  unconfiguredAuthProviders,
  type AuthProviderReadiness,
} from "@/lib/auth/provider-readiness";
import { applyRetailSoldScope, withRetailSold } from "@/lib/scoring/sold-scope";
import {
  summarizeInventoryProofRollups,
  type InventoryProofRollup,
  type InventoryReadinessProof,
} from "@/lib/inventory-readiness-proof";

let providerLoad: Promise<AuthProviderReadiness> | null = null;

const STATUS_DEAL_SOURCES = [
  "copart",
  "iaa",
  "adesa",
  "manheim",
  "facebook_marketplace",
  "craigslist",
  "ebay_motors",
  "autotrader",
  "cars_com",
  "gov_auction",
  "repo_network",
  "independent_dealer",
  "cargurus",
  "craigslist_dealer",
  "carvana",
  "truecar",
  "vroom",
  "offerup",
  "acv",
];

type SourceBreakdownRollup = {
  source: string;
  source_host?: string | null;
  active_rows: number | string;
  rows_with_photos: number | string;
  newest_seen?: string | null;
};

type SourceProof = {
  sourceBreakdown: ReturnType<typeof buildSourceBreakdownFromRollups>;
  inventory: InventoryReadinessProof | null;
};

type InventoryQualityProof = {
  total_rows?: number | string | null;
  active_rows?: number | string | null;
  current_visible_rows?: number | string | null;
  new_last_24h_rows?: number | string | null;
  new_last_7d_rows?: number | string | null;
  updated_last_24h_rows?: number | string | null;
  newest_visible_at?: string | null;
  retained_not_visible_rows?: number | string | null;
  current_strict_buy_candidates?: number | string | null;
  current_geocoded_rows?: number | string | null;
  current_city_rows?: number | string | null;
  current_watch_candidate_rows?: number | string | null;
  current_market_value_backed_rows?: number | string | null;
  current_resale_estimate_backed_rows?: number | string | null;
  current_deal_math_ready_rows?: number | string | null;
  current_go_rows?: number | string | null;
  current_hold_rows?: number | string | null;
  current_pass_rows?: number | string | null;
  current_insufficient_rows?: number | string | null;
};

const proofCount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

export function hasDecisionReadyInventory(
  proof: InventoryQualityProof | null | undefined,
) {
  return proofCount(proof?.current_strict_buy_candidates) > 0;
}

async function loadInventoryQualityProof(
  sb: any,
): Promise<InventoryQualityProof | null> {
  return cached(
    "status:inventory-quality:v1",
    300_000,
    async () => {
      try {
        const { data, error } = await sb.rpc("inventory_quality_rollup_v1");
        return !error && Array.isArray(data) && data[0]
          ? (data[0] as InventoryQualityProof)
          : null;
      } catch {
        // App and database deploy independently. Missing proof fails decision readiness closed.
        return null;
      }
    },
    (result) => result !== null,
  );
}

function loadAuthProviders(): Promise<AuthProviderReadiness> {
  if (!isSupabaseConfigured())
    return Promise.resolve(unconfiguredAuthProviders());
  if (!providerLoad) {
    providerLoad = cached(
      "status:auth-providers:v1",
      300_000,
      readAuthProviderReadiness,
      (result) => result.reachable,
    ).finally(() => {
      providerLoad = null;
    });
  }
  return providerLoad;
}

function publicAuthProviders(auth: AuthProviderReadiness) {
  return {
    reachable: auth.reachable,
    google: auth.google,
    email: auth.email,
    checkedAt: auth.checkedAt,
  };
}

function statusSource(row: any) {
  return sourceFromUrl(row.source_url) || row.source || "unknown";
}

/** Stored-row age from deals.last_seen_at. Never "live": rows on file are not a scrape heartbeat. */
export function sourceListingStatus(active: number, ageHours: number | null) {
  if (active <= 0) return "idle";
  if (ageHours != null && ageHours > 72) return "stale";
  return "stored";
}

export function buildSourceBreakdownFromRollups(
  rows: SourceBreakdownRollup[],
  now = Date.now(),
) {
  const groups = new Map<
    string,
    { active: number; withImages: number; newest: string | null }
  >();
  for (const row of rows) {
    const host = String(row.source_host || "")
      .trim()
      .toLowerCase();
    const source = statusSource({
      source: row.source,
      source_url: host ? `https://${host}/` : null,
    });
    const group = groups.get(source) || {
      active: 0,
      withImages: 0,
      newest: null,
    };
    const activeRows = Number(row.active_rows || 0);
    const rowsWithPhotos = Number(row.rows_with_photos || 0);
    group.active += Number.isFinite(activeRows) ? activeRows : 0;
    group.withImages += Number.isFinite(rowsWithPhotos) ? rowsWithPhotos : 0;
    const newest = row.newest_seen || null;
    if (
      newest &&
      Number.isFinite(new Date(newest).getTime()) &&
      (!group.newest ||
        new Date(newest).getTime() > new Date(group.newest).getTime())
    ) {
      group.newest = newest;
    }
    groups.set(source, group);
  }

  return Array.from(groups.entries())
    .map(([source, group]) => {
      const ageHours = group.newest
        ? Math.round((now - new Date(group.newest).getTime()) / 3600_000)
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
}

// Per-source inventory proof is cached for five minutes. V2 applies the same
// freshness/photo/auction window as customer inventory and returns exact field
// counts, avoiding a biased first-page sample. Shared database enums are split
// back into their public source identities using the normalized host.
async function loadSourceProof(sb: any): Promise<SourceProof> {
  return cached("status:source-proof:v8", 300_000, async () => {
    if (typeof sb.rpc === "function") {
      try {
        const { data: rollups, error: rollupError } = await sb.rpc(
          "scrape_health_inventory_rollup_v2",
          { p_sources: STATUS_DEAL_SOURCES },
        );
        if (!rollupError && Array.isArray(rollups)) {
          return {
            sourceBreakdown: buildSourceBreakdownFromRollups(rollups),
            inventory: summarizeInventoryProofRollups(
              rollups as InventoryProofRollup[],
            ),
          };
        }
      } catch {
        // App and database deploy independently; try the earlier compact rollup.
      }
      try {
        const { data: rollups, error: rollupError } = await sb.rpc(
          "scrape_health_inventory_rollup",
          { p_sources: STATUS_DEAL_SOURCES },
        );
        if (!rollupError && Array.isArray(rollups)) {
          return {
            sourceBreakdown: buildSourceBreakdownFromRollups(rollups),
            inventory: null,
          };
        }
      } catch {
        // Retain the bounded row fallback when neither database function exists.
      }
    }

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
      if (Array.isArray(row.images) && row.images.length) group.withImages += 1;
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
    const sourceBreakdown = Array.from(groups.entries())
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
    return { sourceBreakdown, inventory: null };
  });
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
    const ar = sourceReadinessRank(a.readiness);
    const br = sourceReadinessRank(b.readiness);
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
  const authProviders = await loadAuthProviders();
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
        attributedAuctionSales: 0,
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
          applicable: {
            auction: 0,
          },
          total: 0,
          mode: "unconfigured",
        },
      },
      sources: [],
      recentRuns: [],
    };
  }

  const sb = createServerComponentClient();
  const countActive = (build: (q: any) => any) =>
    build(
      sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
    ).then((r: any) => r.count ?? 0);

  const [health, recent, sourceProof, inventoryQuality] = await Promise.all([
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
    loadSourceProof(sb),
    loadInventoryQualityProof(sb),
  ]);

  const exactCoverage = sourceProof.inventory?.total
    ? sourceProof.inventory
    : null;
  const sourceBreakdown = sourceProof.sourceBreakdown;
  const [withVin, withImages, qualityRows] = exactCoverage
    ? [0, 0, []]
    : await Promise.all([
        countActive((q: any) => q.not("vin", "is", null).neq("vin", "")),
        countActive((q: any) =>
          q.not("images", "is", null).neq("images", "{}"),
        ),
        sb
          .from("deals")
          .select(
            "images, vin, title, condition, damage_type, mileage, location_city, location_state, ask_price, auction_end_at, source_url, source, options",
          )
          .eq("active", true)
          .limit(5000)
          .then((r: any) => r.data ?? []),
      ]);

  const fallbackVisible = exactCoverage?.total || qualityRows.length || 0;
  const currentVisible = proofCount(
    inventoryQuality?.current_visible_rows ?? fallbackVisible,
  );
  const storedActive = proofCount(
    inventoryQuality?.active_rows ?? exactCoverage?.storedTotal,
  );
  const qualityBase = currentVisible || fallbackVisible;
  const newestVisible =
    inventoryQuality?.newest_visible_at || exactCoverage?.newestSeen || null;
  const hoursSince = newestVisible
    ? Math.round((Date.now() - new Date(newestVisible).getTime()) / 3600_000)
    : null;
  const new24 = proofCount(inventoryQuality?.new_last_24h_rows);
  const new7 = proofCount(inventoryQuality?.new_last_7d_rows);
  const updated24 = proofCount(inventoryQuality?.updated_last_24h_rows);
  const geocoded = proofCount(inventoryQuality?.current_geocoded_rows);
  const withCity = proofCount(inventoryQuality?.current_city_rows);
  const watchCandidates = proofCount(
    inventoryQuality?.current_watch_candidate_rows,
  );
  const strictBuyCandidates = proofCount(
    inventoryQuality?.current_strict_buy_candidates,
  );
  const currentGo = proofCount(inventoryQuality?.current_go_rows);
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
  const detailCoverage = exactCoverage?.counts || {
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
    auction: qualityCount(
      (row) =>
        auctionDateApplies({
          source: statusSource(row),
          sourceUrl: row.source_url,
          adapterId: row.options?.sourceAdapterId,
          sellerType: row.options?.sellerType,
        }) && Boolean(row.auction_end_at),
    ),
    source: qualityCount((row) => Boolean(row.source_url)),
  };
  const auctionApplicableRows =
    exactCoverage?.applicable.auction ??
    qualityCount((row) =>
      auctionDateApplies({
        source: statusSource(row),
        sourceUrl: row.source_url,
        adapterId: row.options?.sourceAdapterId,
        sellerType: row.options?.sellerType,
      }),
    );
  const auctionDatePct = auctionApplicableRows
    ? Math.round((detailCoverage.auction / auctionApplicableRows) * 100)
    : 100;
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
  // Fair Purchase Price); soldComps = retail completed-sale price points; attributedAuctionSales
  // are honest government auction outcomes kept out of retail resale math; aggregateGroups are
  // learned make/model/year/state value buckets the nightly rollup builds from mmr_value.
  const marketValueBacked = proofCount(
    inventoryQuality?.current_market_value_backed_rows,
  );
  const resaleEstimateBacked = proofCount(
    inventoryQuality?.current_resale_estimate_backed_rows,
  );
  const dealMathReady = proofCount(
    inventoryQuality?.current_deal_math_ready_rows,
  );
  const [soldComps, attributedAuctionSales, aggregateGroups] =
    await Promise.all([
      withRetailSold((scope) =>
        applyRetailSoldScope(
          sb.from("sold_listings").select("id", { count: "exact", head: true }),
          scope,
        ),
      ).then((r: any) => r.count ?? 0),
      sb
        .from("sold_listings")
        .select("id", { count: "exact", head: true })
        .eq("basis", "sold")
        .not("sale_channel", "is", null)
        .then((r: any) => r.count ?? 0),
      sb
        .from("market_aggregates")
        .select("year", { count: "exact", head: true })
        .then((r: any) => r.count ?? 0),
    ]);

  const realData = buildRealDataReadiness({
    activeDeals: currentVisible,
    newLast24h: new24,
    newestAgeHours: hoursSince,
    photoPct: exactCoverage
      ? qualityPct(detailCoverage.photo)
      : qualityPct(withImages),
    sourceLinkPct: qualityPct(detailCoverage.source),
    pricePct: qualityPct(detailCoverage.price),
    titlePct: qualityPct(detailCoverage.title),
    damagePct: qualityPct(detailCoverage.damage),
    mileagePct: qualityPct(detailCoverage.mileage),
    vinPct: exactCoverage
      ? qualityPct(detailCoverage.vin)
      : qualityPct(withVin),
    sellerPct: qualityPct(detailCoverage.seller),
    sellerContactPct: qualityPct(detailCoverage.sellerContact),
    auctionDatePct,
    decisionReady: hasDecisionReadyInventory(inventoryQuality),
  });

  // In-sample asking-price proxy; this cannot certify transaction or resale accuracy.
  // Cache the index load and sampled scoring for an hour.
  const valuationAccuracy = await cached(
    "status:asking-price-proxy:v2",
    3600_000,
    () => computeValuationAccuracy(sb).catch(() => null),
  );

  // Scraper success rate (7d, productive runs only) + crawler ban-risk from the latest worker job.
  // Operator-only: both live in the full payload, never in toPublicStatus.
  const scraperReliability = await cached(
    "status:scraper-reliability:v1",
    300_000,
    async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const [{ data: runs }, { data: job }] = await Promise.all([
        sb
          .from("scraper_runs")
          .select("source, status, deals_found, started_at, completed_at")
          .gt("started_at", since)
          .order("started_at", { ascending: false })
          .limit(2000),
        sb
          .from("scrape_jobs")
          .select("completed_at, result")
          .eq("status", "completed")
          .not("result->politeness", "is", null)
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        window: "7d",
        ...summarizeReliability(runs || []),
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
    activeDeals: currentVisible,
    storedActiveDeals: storedActive,
    inventory: {
      totalStored: proofCount(inventoryQuality?.total_rows),
      activeStored: storedActive,
      currentVisible,
      retainedNotVisible: proofCount(
        inventoryQuality?.retained_not_visible_rows,
      ),
      strictBuyCandidates,
    },
    readySources: sourceHealth.readySources,
    sourceHealth,
    sourceBreakdown,
    valuationAccuracy,
    knowledgeBase: {
      marketValueBacked,
      marketValuePct: qualityPct(marketValueBacked),
      resaleEstimateBacked,
      resaleEstimatePct: qualityPct(resaleEstimateBacked),
      dealMathReady,
      dealMathReadyPct: qualityPct(dealMathReady),
      soldComps,
      attributedAuctionSales,
      aggregateGroups,
    },
    learning: {
      outcomesLogged,
      prioritizedMakes: profitableMakes,
    },
    freshness: {
      activeDeals: currentVisible,
      newLast24h: new24,
      newLast7d: new7,
      updatedLast24h: updated24,
      newestAgeHours: hoursSince,
      stale: hoursSince == null || hoursSince > 24,
    },
    quality: {
      goDeals: currentGo,
      strictBuyCandidates,
      verdicts: {
        go: currentGo,
        hold: proofCount(inventoryQuality?.current_hold_rows),
        pass: proofCount(inventoryQuality?.current_pass_rows),
        notEnoughData: proofCount(inventoryQuality?.current_insufficient_rows),
      },
      watchCandidates,
      vinPct: exactCoverage
        ? qualityPct(detailCoverage.vin)
        : qualityPct(withVin),
      imagePct: exactCoverage
        ? qualityPct(detailCoverage.photo)
        : qualityPct(withImages),
      geocodedPct: qualityPct(geocoded),
      cityPct: qualityPct(withCity),
      titlePct: qualityPct(detailCoverage.title),
      damagePct: qualityPct(detailCoverage.damage),
      mileagePct: qualityPct(detailCoverage.mileage),
      pricePct: qualityPct(detailCoverage.price),
      sellerPct: qualityPct(detailCoverage.seller),
      sellerContactPct: qualityPct(detailCoverage.sellerContact),
      auctionDatePct,
      sourceLinkPct: qualityPct(detailCoverage.source),
      detailCoverage: {
        counts: detailCoverage,
        applicable: {
          auction: auctionApplicableRows,
        },
        total: qualityBase,
        mode: exactCoverage ? "customer_visible_rollup" : "bounded_sample",
      },
    },
    sources: mergedSources,
    recentRuns: recent,
    scraperReliability,
  };
}

export function shouldCacheFullStatus(payload: Record<string, any>) {
  return (
    !payload.configured ||
    (Number(payload.activeDeals || 0) > 0 &&
      Array.isArray(payload.sources) &&
      payload.sources.length > 0)
  );
}

class IncompleteFullStatusError extends Error {
  constructor(readonly payload: Record<string, any>) {
    super("Full system status is incomplete and must not be cached");
    this.name = "IncompleteFullStatusError";
  }
}

const loadPersistedFullStatus = unstable_cache(
  async () => {
    const payload = await computeFullStatus();
    if (!shouldCacheFullStatus(payload)) {
      throw new IncompleteFullStatusError(payload);
    }
    return payload;
  },
  ["system-status-full-v4"],
  { revalidate: 60, tags: ["system-status-full"] },
);

function loadFullStatus() {
  return cached(
    "status:full:v4",
    60_000,
    async () => {
      try {
        return await loadPersistedFullStatus();
      } catch (error) {
        if (error instanceof IncompleteFullStatusError) return error.payload;
        throw error;
      }
    },
    shouldCacheFullStatus,
  );
}

const PUBLIC_READINESS_IDS = new Set(["google-login"]);
const PUBLIC_INVENTORY_RETRY_DELAY_MS = 150;

function shouldRetryPublicInventoryStatus(error: unknown) {
  const diagnostic = inventoryFailureDiagnostic(error);
  return (
    diagnostic.reason === "deadline" ||
    diagnostic.reason === "transport" ||
    diagnostic.reason === "database_canceled" ||
    diagnostic.reason === "rate_limited" ||
    (diagnostic.reason === "database" &&
      typeof diagnostic.httpStatus === "number" &&
      diagnostic.httpStatus >= 500)
  );
}

async function loadPublicInventoryStatus() {
  let failure: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await publicInventoryStatus(createServerComponentClient());
    } catch (error) {
      failure = error;
      if (attempt > 0 || !shouldRetryPublicInventoryStatus(error)) break;
      await new Promise((resolve) =>
        setTimeout(resolve, PUBLIC_INVENTORY_RETRY_DELAY_MS),
      );
    }
  }
  throw failure;
}

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
// scope=auth: provider readiness only, for sign-in without inventory diagnostics.
// Admin (ADMIN_EMAIL session or INGEST_SECRET bearer): full self-awareness payload for /status.
// Everyone else: bounded headline counts, without source scans or valuation computations.
export async function GET(request: NextRequest) {
  // Sign-in needs provider settings, not inventory scans or an admin session lookup.
  if (new URL(request.url).searchParams.get("scope") === "auth") {
    return NextResponse.json(
      {
        scope: "auth",
        authProviders: publicAuthProviders(await loadAuthProviders()),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (await canManageOperations(request)) {
    return NextResponse.json(await loadFullStatus(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  try {
    const payload = await cached("status:public:v3", 120_000, async () => {
      if (!isSupabaseConfigured())
        return toPublicStatus(await computeFullStatus());
      const [authProviders, inventory] = await Promise.all([
        loadAuthProviders(),
        loadPublicInventoryStatus(),
      ]);
      const publicStatus = toPublicStatus({
        configured: true,
        authProviders,
        readiness: applyAuthProviderReadiness(systemReadiness(), authProviders),
      });
      return { ...publicStatus, ...inventory };
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.warn(
      "[status/public] inventory check failed",
      inventoryFailureDiagnostic(error),
    );
    return NextResponse.json(
      {
        error: "We couldn't check inventory status. Please try again shortly.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "Retry-After": "2",
        },
      },
    );
  }
}
