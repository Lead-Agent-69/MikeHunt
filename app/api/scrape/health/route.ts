// app/api/scrape/health/route.ts
// Health dashboard API: source status, last run, failure rate, registry stats.

import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import { createClient } from "@supabase/supabase-js";
import { canSeeScrapeDetail } from "@/lib/auth/scrape-gate";
import { isSupabaseConfigured } from "@/lib/supabase";
import { gradeDataQuality } from "@/lib/data-quality";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { INDEPENDENT_DEALERS } from "@/lib/scrapers/sources-registry";
import { runtimeSourceMetadata } from "@/lib/scrapers/runtime-source-metadata";
import {
  DEALER_SOURCE_DOMAINS,
  dealerSourceIdFromUrl,
  sourceFromUrl,
  sourceMeta,
} from "@/lib/sources/source-meta";
import { sellerContact } from "@/lib/data/deal-contact";
import { isInVehicleScope } from "@/lib/vehicle/vehicle-scope";
import { dealFreshness } from "@/lib/deals/freshness";
import {
  TOS_RESTRICTED_SOURCES,
  isAutomationAllowedSource,
  sourceTier,
} from "@/lib/scrapers/sweep-schedule";
import {
  summarizeDemand,
  wantHitRatio,
  wantHitGapStates,
  wantHitByState,
  WANT_HIT_TARGET,
  type DemandRow,
} from "@/lib/scrapers/sweep-demand";

export const dynamic = "force-dynamic";

type HealthScope = {
  lane?: string;
  state?: string;
  maxPrice?: number;
  minPrice?: number;
  q?: string;
  make?: string;
  makes?: string[];
  model?: string;
  titleType?: string;
  sellerType?: string;
  dealerHosts?: string[];
  dealerSourceIds?: string[];
};

const SELLER_TYPE_SOURCE_IDS: Record<string, string[]> = {
  dealer: ["curated_dealers"],
  auction: [
    "copart",
    "acv",
    "adesa",
    "manheim",
    "publicsurplus",
    "govdeals",
    "allsurplus",
    "municibid",
    "gsa_auctions",
  ],
  private: ["craigslist", "facebook_marketplace", "offerup", "ebay_motors"],
};

const VALID_DEAL_SOURCES = new Set([
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
]);

function normalizeQuery(value: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDealerHosts(value: string | null) {
  return (value || "")
    .toLowerCase()
    .split(",")
    .map((host) => host.replace(/[^a-z0-9.-]/g, "").trim())
    .filter(Boolean)
    .slice(0, 25);
}

function normalizeDealerSourceIds(value: string | null) {
  const known = new Set(INDEPENDENT_DEALERS.map((source) => source.id));
  return (value || "")
    .toLowerCase()
    .split(",")
    .map((id) =>
      id
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "")
        .trim(),
    )
    .filter((id) => known.has(id))
    .slice(0, 25);
}

function dbSourceValues(sourceId: string) {
  const id = sourceId.toLowerCase();
  const mapped: Record<string, string[]> = {
    publicsurplus: ["gov_auction"],
    govdeals: ["gov_auction"],
    allsurplus: ["gov_auction"],
    municibid: ["gov_auction"],
    gsa_auctions: ["gov_auction"],
    curated_dealers: ["independent_dealer"],
    "ae-of-miami": ["independent_dealer"],
    "damage-com": ["independent_dealer"],
    "dg-auto": ["independent_dealer"],
    recar: ["independent_dealer"],
    "stjames-auto": ["independent_dealer"],
    "cas-miami": ["independent_dealer"],
    salvagezone: ["independent_dealer"],
    "rebuilt-auto": ["independent_dealer"],
    "alpine-auto": ["independent_dealer"],
    "replica-auto": ["independent_dealer"],
    carparts_com: ["independent_dealer"],
  };
  return mapped[id] || [id];
}

function uniqueDbSources(sourceIds: string[]) {
  return Array.from(new Set(sourceIds.flatMap(dbSourceValues))).filter((id) =>
    VALID_DEAL_SOURCES.has(id),
  );
}

function dealerSourceUrlNeedles(sourceId: string) {
  return DEALER_SOURCE_DOMAINS[sourceId.toLowerCase()] || [];
}

function healthSourceIdForDeal(row: any, sourceIds: string[]) {
  const source = String(row.source || "");
  const url = String(row.source_url || "").toLowerCase();
  if (source === "gov_auction") {
    if (url.includes("govdeals.com") && sourceIds.includes("govdeals"))
      return "govdeals";
    if (url.includes("publicsurplus") && sourceIds.includes("publicsurplus"))
      return "publicsurplus";
    if (url.includes("municibid") && sourceIds.includes("municibid"))
      return "municibid";
    if (url.includes("gsa") && sourceIds.includes("gsa_auctions"))
      return "gsa_auctions";
    return (
      sourceIds.find((id) => dbSourceValues(id).includes(source)) || source
    );
  }
  if (source === "independent_dealer") {
    return (
      dealerSourceIdFromUrl(url, sourceIds) ||
      (sourceIds.includes("curated_dealers") ? "curated_dealers" : null) ||
      sourceIds.find((id) => dbSourceValues(id).includes(source)) ||
      source
    );
  }
  return source;
}

function shouldShowDealerProof(scope: HealthScope, sourceIds: string[]) {
  return (
    Boolean(scope.dealerHosts?.length) ||
    sourceIds.includes("curated_dealers") ||
    ["dealer", "damaged", "salvage", "repairable", "specialty"].includes(
      String(scope.lane || ""),
    )
  );
}

function dealerProofSources(scope: HealthScope, sourceIds: string[]) {
  if (!shouldShowDealerProof(scope, sourceIds)) return [];
  const dealerHosts = scope.dealerHosts || [];
  const dealerSourceIds = scope.dealerSourceIds || [];
  return INDEPENDENT_DEALERS.filter(
    (source) => source.type === "dealer" && source.priority === "P1",
  )
    .filter((source) => {
      if (dealerSourceIds.length) return dealerSourceIds.includes(source.id);
      if (!dealerHosts.length) return true;
      const url = String(source.url || "").toLowerCase();
      return dealerHosts.some((host) => url.includes(host));
    })
    .map((source) => ({
      id: source.id,
      name: source.name,
      type: "dealer",
      priority: source.priority === "P1" ? "high" : "medium",
      enabled: source.status === "active",
      requiresAuth: source.authRequired !== "none",
      stealthRequired: false,
      frequencyMinutes: 720,
      estimatedDealsPerRun:
        Number(String(source.inventorySize || "").replace(/[^0-9]/g, "")) || 0,
      catalogUrl: source.url,
      location: source.location || null,
      description: source.description,
    }));
}

function matchesScope(row: any, scope: HealthScope) {
  if (scope.state && row.location_state !== scope.state) return false;
  if (scope.maxPrice && Number(row.ask_price || 0) > scope.maxPrice)
    return false;
  if (scope.minPrice && Number(row.ask_price || 0) < scope.minPrice)
    return false;
  if (scope.sellerType && scope.sellerType !== "all") {
    const type = rowSellerType(row);
    if (type !== scope.sellerType) return false;
  }
  if (scope.makes?.length) {
    const rowMake = String(row.make || "").toLowerCase();
    if (!scope.makes.some((make) => rowMake === make.toLowerCase())) {
      return false;
    }
  }
  if (scope.make) {
    const rowMake = String(row.make || "").toLowerCase();
    if (rowMake !== scope.make.toLowerCase()) return false;
  }
  if (scope.model) {
    const rowModel = String(row.model || "").toLowerCase();
    if (rowModel !== scope.model.toLowerCase()) return false;
  }
  if (scope.titleType && scope.titleType !== "all") {
    const titleSignal = String(rowTitleSignal(row) || "").toLowerCase();
    const wanted = scope.titleType.toLowerCase();
    if (!titleSignal.includes(wanted)) return false;
  }
  if (scope.dealerHosts?.length) {
    const sourceUrl = String(row.source_url || "").toLowerCase();
    if (!scope.dealerHosts.some((host) => sourceUrl.includes(host))) {
      return false;
    }
  }
  if (scope.dealerSourceIds?.length) {
    const sourceUrl = String(row.source_url || "").toLowerCase();
    if (!dealerSourceIdFromUrl(sourceUrl, scope.dealerSourceIds)) {
      return false;
    }
  }
  if (scope.q) {
    const haystack = [
      row.title,
      row.year,
      row.make,
      row.model,
      row.trim,
      row.condition,
      row.damage_type,
      row.location_city,
      row.location_state,
      row.seller,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const ok = scope.q
      .split(" ")
      .filter(Boolean)
      .every((term) => haystack.includes(term));
    if (!ok) return false;
  }
  return true;
}

function rowSellerType(row: any) {
  const explicit = String(
    row.seller_type || row.sellerType || "",
  ).toLowerCase();
  if (["dealer", "auction", "private"].includes(explicit)) return explicit;
  const sourceKey =
    sourceFromUrl(String(row.source_url || "")) || String(row.source || "");
  const meta = sourceMeta(sourceKey);
  if (
    meta.channel === "gov" ||
    meta.channel === "auction" ||
    meta.channel === "salvage" ||
    meta.channel === "wholesale"
  ) {
    return "auction";
  }
  if (meta.channel === "dealer" || meta.channel === "retail") return "dealer";
  if (meta.channel === "private") return "private";
  return "";
}

function present(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function rowTitleSignal(row: any) {
  return (
    row.title_type ||
    row.titleType ||
    row.title_status ||
    row.titleStatus ||
    row.condition ||
    String(row.title || "").match(/salvage|rebuilt|clean title|parts/i)?.[0] ||
    null
  );
}

function emptyCompleteness() {
  return {
    photos: 0,
    vin: 0,
    title: 0,
    mileage: 0,
    damage: 0,
    price: 0,
    location: 0,
    seller: 0,
    sellerContact: 0,
    auctionDate: 0,
    sourceLink: 0,
  };
}

function addCompleteness(
  completeness: ReturnType<typeof emptyCompleteness>,
  row: any,
) {
  const contact = sellerContact(row);
  const images = Array.isArray(row.images) ? row.images : [];
  const sourceKey =
    sourceFromUrl(row.source_url || row.sourceUrl) || row.source;
  const meta = sourceMeta(sourceKey);
  if (images.length > 0) completeness.photos += 1;
  if (present(row.vin)) completeness.vin += 1;
  if (present(rowTitleSignal(row))) completeness.title += 1;
  if (present(row.mileage)) completeness.mileage += 1;
  if (present(row.condition || row.damage_type || row.damageType)) {
    completeness.damage += 1;
  }
  if (present(row.ask_price || row.askPrice)) completeness.price += 1;
  if (
    present(row.location_city || row.locationCity) ||
    present(row.location_state || row.locationState)
  ) {
    completeness.location += 1;
  }
  if (
    present(row.seller || row.sellerType || row.seller_type) ||
    present(contact.phone || contact.email || contact.url) ||
    present(row.source_url || row.sourceUrl || meta.label)
  ) {
    completeness.seller += 1;
  }
  if (present(contact.phone || contact.email || contact.url)) {
    completeness.sellerContact += 1;
  }
  if (present(row.auction_end || row.auction_end_at || row.auctionEndAt)) {
    completeness.auctionDate += 1;
  }
  if (present(row.source_url || row.sourceUrl)) completeness.sourceLink += 1;
}

function completenessPercentages(
  counts: ReturnType<typeof emptyCompleteness>,
  total: number,
) {
  const pct = (value: number) =>
    total ? Math.round((value / total) * 100) : 0;
  return {
    photosPct: pct(counts.photos),
    vinPct: pct(counts.vin),
    titlePct: pct(counts.title),
    mileagePct: pct(counts.mileage),
    damagePct: pct(counts.damage),
    pricePct: pct(counts.price),
    locationPct: pct(counts.location),
    sellerPct: pct(counts.seller),
    sellerContactPct: pct(counts.sellerContact),
    auctionDatePct: pct(counts.auctionDate),
    sourceLinkPct: pct(counts.sourceLink),
  };
}

async function publicProbe(
  fetchRows: () => Promise<Partial<any>[]>,
  scope: HealthScope,
) {
  try {
    const rawRows = await fetchRows();
    const rows = rawRows.filter((row) => matchesScope(row, scope));
    const completeness = emptyCompleteness();
    rows.forEach((row) => addCompleteness(completeness, row));
    return {
      readiness: rows.length ? "ready" : "no_rows",
      lastStatus: rows.length ? "success" : "no_rows",
      activeRows: rows.length,
      rowsWithPhotos: rows.filter(
        (row: any) => Array.isArray(row.images) && row.images.length > 0,
      ).length,
      averageQuality: rows.length
        ? Math.round(
            rows.reduce((sum: number, row: any) => {
              return (
                sum +
                gradeDataQuality({
                  images: row.images,
                  vin: row.vin,
                  titleType: rowTitleSignal(row),
                  condition: row.condition,
                  damageType: row.damage_type,
                  mileage: row.mileage,
                  locationCity: row.location_city,
                  locationState: row.location_state,
                  askPrice: row.ask_price,
                  seller: (row as any).seller,
                  sellerType: (row as any).seller_type,
                  auctionEndAt:
                    row.auction_end || row.auction_end_at || row.auctionEndAt,
                  sourceUrl: row.source_url,
                }).score
              );
            }, 0) / rows.length,
          )
        : 0,
      completeness: {
        counts: completeness,
        ...completenessPercentages(completeness, rows.length),
      },
      lastSeenAt: rows[0]?.scraped_at || new Date().toISOString(),
      error: null as string | null,
    };
  } catch (error) {
    return {
      readiness: "blocked",
      lastStatus: "error",
      activeRows: 0,
      rowsWithPhotos: 0,
      averageQuality: 0,
      completeness: {
        counts: emptyCompleteness(),
        ...completenessPercentages(emptyCompleteness(), 0),
      },
      lastSeenAt: null,
      error: error instanceof Error ? error.message : "Probe failed",
    };
  }
}

function qualityLabel(score: number) {
  return score >= 88
    ? "Excellent"
    : score >= 68
      ? "Good"
      : score >= 45
        ? "Thin"
        : "Sparse";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function broadenScopeAction(scope?: HealthScope) {
  if (!scope) {
    return "Run a broader scope or wait for fresh inventory from this source.";
  }
  if (scope.titleType && scope.titleType !== "all") {
    return `No ${scope.titleType} title rows matched this source. Try Any title first, then broaden dealer or state filters if needed.`;
  }
  if (scope.dealerHosts?.length) {
    return "No rows matched these watched dealers. Try the full private/dealer lane or remove dealer targets.";
  }
  if (scope.state) {
    return `No rows matched ${scope.state}. Try Nationwide or nearby states.`;
  }
  if (scope.q) {
    return `No rows matched "${scope.q}". Try a broader vehicle type or clear the keyword.`;
  }
  if (scope.maxPrice) {
    return `No rows under ${formatCurrency(scope.maxPrice)}. Raise the budget or clear max price.`;
  }
  if (scope.minPrice) {
    return `No rows over ${formatCurrency(scope.minPrice)}. Lower the minimum price or clear min price.`;
  }
  return "Run a broader scope or wait for fresh inventory from this source.";
}

function missingCoverageActions(row: any) {
  const c = row.completeness || {};
  const missing: string[] = [];
  const type = String(row.type || row.sellerType || "").toLowerCase();
  const auctionDateExpected = !["dealer", "private", "retail"].includes(type);
  const low = (value: unknown, threshold = 50) =>
    Number(value || 0) > 0 ? Number(value || 0) < threshold : true;
  if (low(c.vinPct)) missing.push("VIN");
  if (low(c.mileagePct)) missing.push("mileage");
  if (auctionDateExpected && low(c.auctionDatePct)) {
    missing.push("auction date");
  }
  if (low(c.sellerPct)) missing.push("seller proof");
  if (low(c.sellerContactPct)) missing.push("seller contact");
  if (low(c.sourceLinkPct)) missing.push("source links");
  if (low(c.photosPct, 70)) missing.push("photos");
  return missing;
}

/** Same wording as the status route. Rows on file are not a live scrape. */
function lastSeenLabel(ageHours: number | null) {
  if (ageHours == null || !Number.isFinite(ageHours))
    return "Last seen unknown";
  if (ageHours < 1) return "Seen just now";
  if (ageHours < 24) return `Seen ${ageHours}h ago`;
  const days = Math.max(1, Math.round(ageHours / 24));
  return `Seen ${days}d ago`;
}

function readySourceAction(row: any) {
  const missing = missingCoverageActions(row);
  if (missing.length) {
    return `Listings on file, but thin on ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? `, +${missing.length - 3} more` : ""}. Use these rows for discovery, then verify weak fields before bidding.`;
  }
  return "Open Scan to review stored listings. Last seen is not a live scrape.";
}

function readySourceImpact(row: any) {
  const missing = missingCoverageActions(row);
  if (missing.length) {
    return `Listings are on file, but buyer confidence is limited by missing ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? `, +${missing.length - 3} more` : ""}.`;
  }
  return "Stored listings from this source can be reviewed in Scan. Last seen is not a live scrape.";
}

/**
 * A source whose site terms ban automated access (TOS_RESTRICTED_SOURCES) and that the operator has
 * not opted into through SCRAPE_SOURCES. Same rule as the sweep, scrape-ci and the public preview
 * routes (isAutomationAllowedSource), so health never tells anyone to "run" a source we won't run.
 */
function termsOffForSource(sourceId: string, raw?: string) {
  const id = String(sourceId || "").toLowerCase();
  return (
    Boolean(TOS_RESTRICTED_SOURCES[id]) && !isAutomationAllowedSource(id, raw)
  );
}

function termsFields(sourceId: string) {
  if (!termsOffForSource(sourceId)) return {};
  return {
    termsRestricted: true,
    termsReason: TOS_RESTRICTED_SOURCES[String(sourceId).toLowerCase()],
  };
}

function explainSource(
  source: any,
  readiness: string,
  configured: boolean,
  row?: any,
  scope?: HealthScope,
) {
  if (row?.termsRestricted) {
    return {
      userStatus: "Off for site terms",
      proofLevel: "off",
      userImpact: Number(row?.activeRows || 0)
        ? "This site's terms ban automated access, so MikeHunt does not import from it. Rows already on file are older imports and are not refreshed."
        : "This site's terms ban automated access, so MikeHunt does not import from it.",
      nextAction:
        "Stays off unless the operator opts in through SCRAPE_SOURCES. Prefer a licensed feed or written permission.",
    };
  }
  if (readiness === "ready") {
    return {
      userStatus: lastSeenLabel(
        typeof row?.freshnessHours === "number" ? row.freshnessHours : null,
      ),
      proofLevel: "stored_rows",
      userImpact: readySourceImpact(row),
      nextAction: readySourceAction(row),
    };
  }
  if (readiness === "no_rows") {
    return {
      userStatus: "No matching rows",
      proofLevel: "ran_empty",
      userImpact:
        "The source responded, but there are no active rows to show for the current proof window.",
      nextAction: broadenScopeAction(scope),
    };
  }
  if (readiness === "needs_login") {
    return {
      userStatus: "Needs login",
      proofLevel: "gated",
      userImpact:
        "Users should not expect inventory until this source has account, license, or session access.",
      nextAction: source.requiresAuth
        ? "Add the required account, dealer-license access, or source credentials."
        : "Enable and verify this source before importing.",
    };
  }
  if (readiness === "blocked") {
    return {
      userStatus: "Blocked",
      proofLevel: "failed",
      userImpact:
        "The app cannot trust this source until the latest failure is resolved.",
      nextAction: source.stealthRequired
        ? "Check browser/proxy/anti-bot handling, then rerun this source."
        : "Inspect the latest scraper error, fix the parser or endpoint, then rerun.",
    };
  }
  if (readiness === "disabled") {
    return {
      userStatus: "Disabled",
      proofLevel: "off",
      userImpact:
        "This source is intentionally not part of normal imports right now.",
      nextAction:
        "Enable the source only after credentials and parser checks pass.",
    };
  }
  if (!configured) {
    return {
      userStatus: "Needs database",
      proofLevel: "catalog_only",
      userImpact:
        "This source is known, but matching rows cannot be saved until Supabase is connected.",
      nextAction:
        "Connect Supabase, then run a scoped source search for this source.",
    };
  }
  return {
    userStatus: "Needs run",
    proofLevel: "runner_ready",
    userImpact:
      "This source is available to the runner but has not produced current proof yet.",
    nextAction:
      "Run this source with a scoped buyer search and verify rows/photos.",
  };
}

export function enrichHealthRow(
  source: any,
  row: any,
  configured: boolean,
  scope?: HealthScope,
) {
  const photoCoveragePct = row.activeRows
    ? Math.round(((row.rowsWithPhotos || 0) / row.activeRows) * 100)
    : 0;
  const freshnessHours = row.lastSeenAt
    ? Math.round((Date.now() - new Date(row.lastSeenAt).getTime()) / 3600_000)
    : null;
  const explanation = explainSource(
    source,
    row.readiness,
    configured,
    { ...row, freshnessHours },
    scope,
  );
  const freshnessLabel = lastSeenLabel(freshnessHours);
  const missing = missingCoverageActions(row);
  const proofBadges = [
    `${Number(row.activeRows || 0).toLocaleString()} rows`,
    `${Number(row.rowsWithPhotos || 0).toLocaleString()} photos`,
    `${photoCoveragePct}% photo coverage`,
    row.averageQuality ? `${row.averageQuality}/100 detail` : null,
    freshnessLabel,
  ].filter(Boolean);
  const proofSummary =
    row.readiness === "ready"
      ? `${source.name} returned ${Number(row.activeRows || 0).toLocaleString()} active row${
          Number(row.activeRows || 0) === 1 ? "" : "s"
        } with ${Number(row.rowsWithPhotos || 0).toLocaleString()} photo-backed row${
          Number(row.rowsWithPhotos || 0) === 1 ? "" : "s"
        }; ${freshnessLabel}${
          missing.length
            ? `. Weak fields: ${missing.slice(0, 3).join(", ")}`
            : ""
        }.`
      : explanation.userImpact;
  return {
    ...row,
    userStatus: explanation.userStatus,
    proofLevel: explanation.proofLevel,
    userImpact: explanation.userImpact,
    nextAction: explanation.nextAction,
    proofSummary,
    proofBadges,
    photoCoveragePct,
    qualityLabel: row.averageQuality ? qualityLabel(row.averageQuality) : null,
    freshnessHours,
  };
}

function userFacingHealthRows(health: any[], scope: HealthScope) {
  if (!scope.dealerHosts?.length && !scope.dealerSourceIds?.length)
    return health;
  const hasDealerProof = health.some(
    (source) => source.id !== "curated_dealers" && source.type === "dealer",
  );
  if (!hasDealerProof) return health;
  return health.filter((source) => source.id !== "curated_dealers");
}

function sellerTypeSourceIds(scope: HealthScope) {
  const sellerType = String(scope.sellerType || "").toLowerCase();
  if (!sellerType || sellerType === "all") return null;
  return SELLER_TYPE_SOURCE_IDS[sellerType] || null;
}

function scopeParts(scope: HealthScope) {
  return [
    scope.lane && scope.lane !== "all" ? `${scope.lane} lane` : null,
    scope.sellerType && scope.sellerType !== "all"
      ? `${scope.sellerType} sellers`
      : null,
    scope.titleType && scope.titleType !== "all"
      ? `${scope.titleType} title`
      : null,
    scope.q || null,
    scope.make || null,
    scope.makes?.length ? `${scope.makes.length} make focus` : null,
    scope.model || null,
    scope.state || null,
    scope.minPrice ? `over ${formatCurrency(scope.minPrice)}` : null,
    scope.maxPrice ? `under ${formatCurrency(scope.maxPrice)}` : null,
    scope.dealerHosts?.length
      ? `${scope.dealerHosts.length} watched dealer${
          scope.dealerHosts.length === 1 ? "" : "s"
        }`
      : null,
    scope.dealerSourceIds?.length
      ? `${scope.dealerSourceIds.length} selected dealer${
          scope.dealerSourceIds.length === 1 ? "" : "s"
        }`
      : null,
  ].filter(Boolean);
}

function supabaseIlikeTerm(value: string) {
  return value
    .replace(/[%*,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scopedDealerUrlNeedles(scope: HealthScope) {
  const fromDealerIds = (scope.dealerSourceIds || []).flatMap(
    dealerSourceUrlNeedles,
  );
  return Array.from(
    new Set(
      [...(scope.dealerHosts || []), ...fromDealerIds]
        .map((value) => supabaseIlikeTerm(value.toLowerCase()))
        .filter(Boolean),
    ),
  ).slice(0, 12);
}

function applyScopedDealQuery(query: any, scope: HealthScope) {
  let scoped = query;
  if (scope.state) scoped = scoped.eq("location_state", scope.state);
  if (scope.minPrice) scoped = scoped.gte("ask_price", scope.minPrice);
  if (scope.maxPrice) scoped = scoped.lte("ask_price", scope.maxPrice);
  if (scope.make) {
    const make = supabaseIlikeTerm(scope.make);
    if (make) scoped = scoped.ilike("make", `%${make}%`);
  }
  if (scope.model) {
    const model = supabaseIlikeTerm(scope.model);
    if (model) scoped = scoped.ilike("model", `%${model}%`);
  }
  if (scope.makes?.length) {
    const makeTerms = scope.makes
      .map((make) => supabaseIlikeTerm(make))
      .filter(Boolean)
      .map((make) => `make.ilike.%${make}%`);
    if (makeTerms.length) scoped = scoped.or(makeTerms.join(","));
  }
  if (scope.titleType && scope.titleType !== "all") {
    const title = supabaseIlikeTerm(scope.titleType);
    if (title) {
      scoped = scoped.or(
        [`damage_type.ilike.%${title}%`, `title.ilike.%${title}%`].join(","),
      );
    }
  }
  const dealerNeedles = scopedDealerUrlNeedles(scope);
  if (dealerNeedles.length) {
    scoped = scoped.or(
      dealerNeedles.map((needle) => `source_url.ilike.%${needle}%`).join(","),
    );
  }
  return scoped;
}

export function buildScopeStatus({
  scope,
  scopeFiltered,
  plan,
  health,
}: {
  scope: HealthScope;
  scopeFiltered: boolean;
  plan: ReturnType<typeof planScrapeForBuyerScope> | null;
  health: any[];
}) {
  const parts = scopeParts(scope);
  const hasNoSafeIntersection =
    scopeFiltered && Boolean(plan) && (plan?.sourceIds.length || 0) === 0;
  const readyCount = health.filter((row) => row.readiness === "ready").length;
  if (hasNoSafeIntersection) {
    return {
      status: "no_match",
      label: "No safe source match",
      message:
        "This buyer scope has no safe source intersection, so imports are held back before they can waste credits or fill the database with unwanted inventory.",
      nextAction:
        "Change lane, seller type, watched dealer, or broaden the scope before running imports.",
      scopeLabel: parts.join(" · ") || "Scoped search",
    };
  }
  if (scopeFiltered && health.length === 0) {
    return {
      status: "empty",
      label: "No sources in scope",
      message: "No source returned proof for this exact buyer scope yet.",
      nextAction:
        "Broaden the state, keyword, budget, seller type, or run a matching import.",
      scopeLabel: parts.join(" · ") || "Scoped search",
    };
  }
  if (scopeFiltered && readyCount === 0) {
    return {
      status: "empty",
      label: "No ready rows yet",
      message:
        "The matching sources are known, but none have proven ready rows for this exact scope yet.",
      nextAction:
        "Preview or run the matching sources, then verify rows, photos, quality, and freshness.",
      scopeLabel: parts.join(" · ") || "Scoped search",
    };
  }
  return {
    status: readyCount > 0 ? "ready" : "unfiltered",
    label: readyCount > 0 ? "Source proof ready" : "Source proof",
    message: scopeFiltered
      ? `Rows, photos, quality, and freshness are scoped to ${parts.join(" · ") || "this search"}.`
      : "Each source reports operational health plus inventory proof: rows, photos, average detail quality, and the newest listing seen.",
    nextAction: readyCount
      ? "Open Scan from a ready source and review the imported vehicles."
      : "Choose a buyer scope or run an import to generate proof.",
    scopeLabel:
      parts.join(" · ") || (scopeFiltered ? "Scoped search" : "All sources"),
  };
}

async function buildDemandCoverage(
  // Loosely typed: hosted DB types may not include scrape_demand yet.
  supabase: { rpc: (...args: any[]) => Promise<{ data: any; error: any }> },
  activeDeals: readonly any[],
  detail = false,
) {
  let demandRows: DemandRow[] = [];
  try {
    const { data, error } = await supabase.rpc("scrape_demand", {
      p_active_days: 30,
    });
    if (error) throw error;
    demandRows = (data || []) as DemandRow[];
  } catch {
    return null;
  }
  const demand = summarizeDemand(demandRows);
  const primaryCounts: Record<string, number> = {};
  for (const row of activeDeals || []) {
    const src = String(row?.source || "").toLowerCase();
    if (sourceTier(src) !== "primary") continue;
    const st = String(row?.location_state || "")
      .trim()
      .toUpperCase();
    if (!st) continue;
    primaryCounts[st] = (primaryCounts[st] || 0) + 1;
  }
  const hit = wantHitRatio({
    anchors: demand.anchors || [],
    primaryCounts,
    minRows: 5,
  });
  const gapStates = wantHitGapStates({
    anchors: demand.anchors || [],
    primaryCounts,
    minRows: 5,
  });
  const aggregate = {
    wantHit: hit.wantHit,
    covered: hit.covered,
    demanded: hit.demanded,
    target: WANT_HIT_TARGET,
    gapBias: gapStates.length > 0,
  };
  // Per-state demand (where users live / search) is ops-only: anonymous callers get the ratio.
  if (!detail) return aggregate;
  return {
    ...aggregate,
    gaps: hit.gaps,
    gapStates,
    anchors: demand.anchors || [],
    weights: demand.weights,
    primaryCounts: Object.fromEntries(
      (demand.anchors || []).map((st) => [st, primaryCounts[st] || 0]),
    ),
    primaryCountsAll: primaryCounts,
    // Per demanded state: rows, hit / miss, and how many rows short of the 5-row bar.
    perState: wantHitByState({
      anchors: demand.anchors || [],
      primaryCounts,
      minRows: 5,
    }),
    note: "want-hit = fraction of ring-0 demand states with ≥5 active primary-source rows; gapStates lead the Zeus sweep plan while wantHit < target",
  };
}

function listingHost(url: unknown) {
  try {
    return new URL(String(url || "")).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Honest live coverage, counted from the active rows themselves (not from scraper ids).
 *
 * "Working markets" used to be the number of scraper ids whose readiness was "ready". That
 * undercounted badly: the curated dealer network is one scraper id covering ~30 dealer sites, and
 * sources with live rows but a terms gate (Copart, GovDeals, PublicSurplus) reported "disabled", so
 * 3,889 rows from 36 sites in 51 states showed as "7 working markets". A working market is now a
 * distinct seller site (listing host) with at least one live in-scope row; states are distinct US
 * listing states (50 + DC).
 */
const US_STATE_CODES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);

export function buildLiveCoverage(rows: any[]) {
  const sites = new Map<string, number>();
  const states = new Set<string>();
  const sourceGroups = new Set<string>();
  for (const row of rows) {
    const host = listingHost(row?.source_url) || String(row?.source || "");
    if (host) sites.set(host, (sites.get(host) || 0) + 1);
    const state = String(row?.location_state || "")
      .trim()
      .toUpperCase();
    if (US_STATE_CODES.has(state)) states.add(state);
    if (row?.source) sourceGroups.add(String(row.source));
  }
  return {
    liveRows: rows.length,
    workingMarkets: sites.size,
    liveSites: sites.size,
    liveStates: states.size,
    liveSourceGroups: sourceGroups.size,
    topSites: Array.from(sites.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([host, activeRows]) => ({ host, activeRows })),
  };
}

function buildHealthSummary(health: any[]) {
  const total = health.length;
  const enabled = health.filter((row) => row.enabled).length;
  const due = health.filter((row) => row.isDue).length;
  const healthy = health.filter((row) => row.readiness === "ready").length;
  const needsLogin = health.filter(
    (row) => row.readiness === "needs_login",
  ).length;
  const blocked = health.filter((row) => row.readiness === "blocked").length;
  const noRows = health.filter((row) => row.readiness === "no_rows").length;
  const needsRun = health.filter((row) => row.readiness === "needs_run").length;
  const termsOff = health.filter((row) => row.termsRestricted).length;
  const activeRows = health.reduce(
    (sum, row) => sum + Number(row.activeRows || 0),
    0,
  );
  const rowsWithPhotos = health.reduce(
    (sum, row) => sum + Number(row.rowsWithPhotos || 0),
    0,
  );
  const sumOf = (key: string) =>
    health.reduce((sum, row) => sum + Number(row[key] || 0), 0);
  const liveRows = sumOf("liveRows");
  const frozenRows = sumOf("frozenRows");
  const staleRows = sumOf("staleRows");
  const endedRows = sumOf("endedRows");
  // A terms-gated source keeps rows it can't refresh; it is not a live source even with rows.
  const frozenSources = health.filter(
    (row) => row.termsRestricted && Number(row.activeRows || 0) > 0,
  ).length;
  const qualityRows = health.filter(
    (row) => Number(row.averageQuality || 0) > 0,
  );
  return {
    total,
    enabled,
    due,
    healthy,
    ready: healthy,
    needsLogin,
    blocked,
    noRows,
    needsRun,
    termsOff,
    activeRows,
    liveRows,
    notLiveRows: frozenRows + staleRows + endedRows,
    frozenRows,
    staleRows,
    endedRows,
    frozenSources,
    rowsWithPhotos,
    photoCoveragePct: activeRows
      ? Math.round((rowsWithPhotos / activeRows) * 100)
      : 0,
    averageQuality: qualityRows.length
      ? Math.round(
          qualityRows.reduce(
            (sum, row) => sum + Number(row.averageQuality || 0),
            0,
          ) / qualityRows.length,
        )
      : 0,
  };
}

// Read-only health, deliberately UNAUTHENTICATED so scripts/freshness-monitor.mjs and the
// /orchestrator SWR fetch both keep working (neither sends an Authorization header). What IS
// withheld from anonymous callers is `lastError`: scraper_runs.error_message can carry file paths
// and upstream URLs. Everything else here is non-sensitive operational metadata.
export async function GET(request: NextRequest) {
  const showInternalErrors = await canSeeScrapeDetail(request);
  try {
    const { searchParams } = new URL(request.url);
    const maxPriceParam = searchParams.get("maxPrice");
    const minPriceParam = searchParams.get("minPrice");
    const lane = normalizeQuery(searchParams.get("lane")) || undefined;
    const selectedSourceIds = normalizeDealerSourceIds(
      [
        searchParams.get("source"),
        searchParams.get("sourceId"),
        searchParams.get("dealerSourceIds"),
      ]
        .filter(Boolean)
        .join(","),
    );
    const scope: HealthScope = {
      lane,
      state: searchParams.get("state")?.toUpperCase() || undefined,
      maxPrice:
        maxPriceParam && Number.isFinite(Number(maxPriceParam))
          ? Number(maxPriceParam)
          : undefined,
      minPrice:
        minPriceParam && Number.isFinite(Number(minPriceParam))
          ? Number(minPriceParam)
          : undefined,
      q: normalizeQuery(searchParams.get("q")) || undefined,
      make: normalizeQuery(searchParams.get("make")) || undefined,
      makes: (searchParams.get("makes") || "")
        .split(",")
        .map((make) => normalizeQuery(make))
        .filter(Boolean)
        .slice(0, 12),
      model: normalizeQuery(searchParams.get("model")) || undefined,
      titleType: normalizeQuery(searchParams.get("titleType")) || undefined,
      sellerType: normalizeQuery(searchParams.get("sellerType")) || undefined,
      dealerHosts: normalizeDealerHosts(searchParams.get("dealers")),
      dealerSourceIds: selectedSourceIds.length ? selectedSourceIds : undefined,
    };
    const scopeFiltered = Boolean(
      scope.lane ||
      scope.state ||
      scope.maxPrice ||
      scope.minPrice ||
      scope.q ||
      scope.make ||
      scope.makes?.length ||
      scope.model ||
      scope.titleType ||
      scope.sellerType ||
      scope.dealerHosts?.length ||
      scope.dealerSourceIds?.length,
    );
    const allSources = runtimeSourceMetadata();
    const scopedPlan =
      scope.lane ||
      scope.sellerType ||
      scope.dealerHosts?.length ||
      scope.dealerSourceIds?.length
        ? planScrapeForBuyerScope({
            lane: scope.lane,
            q: scope.q,
            make: scope.make,
            makes: scope.makes,
            model: scope.model,
            state: scope.state || "Nationwide",
            minPrice: scope.minPrice,
            maxPrice: scope.maxPrice,
            titleType: scope.titleType,
            sellerType: scope.sellerType,
            dealerHosts: scope.dealerHosts,
            dealerSourceIds: scope.dealerSourceIds,
          })
        : null;
    const sellerScopedSourceIds = sellerTypeSourceIds(scope);
    const scopedSourceList =
      scopedPlan?.sourceIds || sellerScopedSourceIds || null;
    const scopedSourceIds = scopedSourceList ? new Set(scopedSourceList) : null;
    const scopedSourceOrder = scopedSourceList
      ? new Map(scopedSourceList.map((id, index) => [id, index]))
      : null;
    let sources: any[] = scopedSourceIds
      ? allSources.filter((source) => scopedSourceIds.has(source.id))
      : scope.dealerHosts?.length
        ? allSources.filter((source) => source.id === "curated_dealers")
        : allSources;
    const virtualDealerSources = dealerProofSources(
      scope,
      sources.map((source) => source.id),
    );
    const existingSourceIds = new Set(sources.map((source) => source.id));
    sources = [
      ...sources,
      ...virtualDealerSources.filter(
        (source) => !existingSourceIds.has(source.id),
      ),
    ];
    if (scopedSourceOrder) {
      sources.sort(
        (a, b) =>
          (scopedSourceOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
          (scopedSourceOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER),
      );
    }

    if (!isSupabaseConfigured()) {
      const [govDealsModule, publicSurplusModule, municibidModule] =
        await Promise.all([
          import("@/lib/scrapers/sources/govdeals"),
          import("@/lib/scrapers/sources/publicsurplus"),
          import("@/lib/scrapers/sources/municibid"),
        ]);
      const { previewGovDeals } = govDealsModule;
      const { previewPublicSurplus } = publicSurplusModule;
      const { previewMunicibid } = municibidModule;
      const publicProof = new Map<
        string,
        Awaited<ReturnType<typeof publicProbe>>
      >();
      const probeResults = await Promise.all([
        ...((scopedSourceIds && !scopedSourceIds.has("govdeals")) ||
        !isAutomationAllowedSource("govdeals")
          ? []
          : [
              publicProbe(() => previewGovDeals(1), scope).then(
                (proof) => ["govdeals", proof] as const,
              ),
            ]),
        ...((scopedSourceIds && !scopedSourceIds.has("publicsurplus")) ||
        !isAutomationAllowedSource("publicsurplus")
          ? []
          : [
              publicProbe(() => previewPublicSurplus(1), scope).then(
                (proof) => ["publicsurplus", proof] as const,
              ),
            ]),
        ...((scopedSourceIds && !scopedSourceIds.has("municibid")) ||
        !isAutomationAllowedSource("municibid")
          ? []
          : [
              publicProbe(() => previewMunicibid(1), scope).then(
                (proof) => ["municibid", proof] as const,
              ),
            ]),
      ]);
      for (const [id, proof] of probeResults) publicProof.set(id, proof);

      const health = sources.map((source) => {
        const proof = publicProof.get(source.id);
        const row = {
          id: source.id,
          name: source.name,
          type: source.type,
          priority: source.priority,
          enabled: source.enabled,
          requiresAuth: source.requiresAuth,
          stealthRequired: source.stealthRequired,
          frequencyMinutes: source.frequencyMinutes,
          isDue: !proof && !termsOffForSource(source.id),
          lastRunAt: null,
          lastStatus: proof?.lastStatus || "not_configured",
          lastError: showInternalErrors
            ? proof?.error || (proof ? null : "Supabase is not configured")
            : null,
          totalRuns: 0,
          failedRuns: proof?.readiness === "blocked" ? 1 : 0,
          successRate: proof?.readiness === "blocked" ? 0 : 100,
          estimatedDealsPerRun: source.estimatedDealsPerRun,
          readiness: termsOffForSource(source.id)
            ? "disabled"
            : proof?.readiness ||
              (source.requiresAuth ? "needs_login" : "not_configured"),
          activeRows: proof?.activeRows || 0,
          rowsWithPhotos: proof?.rowsWithPhotos || 0,
          averageQuality: proof?.averageQuality || 0,
          completeness: proof?.completeness || {
            counts: emptyCompleteness(),
            ...completenessPercentages(emptyCompleteness(), 0),
          },
          lastSeenAt: proof?.lastSeenAt || null,
          ...termsFields(source.id),
        };
        return enrichHealthRow(source, row, false, scope);
      });

      const userHealth = userFacingHealthRows(health, scope);
      const summary = buildHealthSummary(userHealth);

      return NextResponse.json({
        configured: false,
        total: summary.total,
        enabled: summary.enabled,
        due: summary.due,
        healthy: summary.healthy,
        summary,
        scope,
        plan: scopedPlan,
        scopeFiltered,
        scopeStatus: buildScopeStatus({
          scope,
          scopeFiltered,
          plan: scopedPlan,
          health: userHealth,
        }),
        sources: userHealth,
      });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    );

    const sourceIds = sources.map((s) => s.id);
    const dealSourceIds = uniqueDbSources(sourceIds);
    const { data: recentRuns, error } = await supabase
      .from("scraper_runs")
      .select(
        "source, status, started_at, completed_at, error_message, deals_found, duration_ms",
      )
      .in("source", sourceIds)
      .order("started_at", { ascending: false })
      .limit(1000);

    if (error) {
      return internalError("scrape:health", error);
    }

    const activeDeals: any[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 20; page += 1) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const baseDealsQuery = supabase
        .from("deals")
        .select(
          "source, title, year, make, model, trim, images, vin, condition, damage_type, mileage, location_city, location_state, ask_price, auction_end_at, source_url, options, last_seen_at",
        )
        .eq("active", true)
        .in("source", dealSourceIds);
      const { data: pageRows, error: dealsError } = await applyScopedDealQuery(
        baseDealsQuery,
        scope,
      )
        .order("last_seen_at", { ascending: false })
        .range(from, to);

      if (dealsError) {
        return NextResponse.json(
          { error: "Health check failed" },
          { status: 500 },
        );
      }
      activeDeals.push(...(pageRows || []));
      if (!pageRows || pageRows.length < pageSize) break;
    }

    const runsBySource: Record<string, typeof recentRuns> = {};
    for (const run of recentRuns || []) {
      if (!runsBySource[run.source]) runsBySource[run.source] = [];
      runsBySource[run.source].push(run);
    }

    const proofBySource: Record<
      string,
      {
        activeRows: number;
        rowsWithPhotos: number;
        qualityTotal: number;
        completeness: ReturnType<typeof emptyCompleteness>;
        lastSeenAt: string | null;
        live: number;
        frozen: number;
        stale: number;
        ended: number;
      }
    > = {};
    const freshnessNow = Date.now();
    // Passenger cars and light/medium trucks only: a non-vehicle row that is still active (e.g.
    // written by a scraper image older than the ingest filter) never counts as coverage.
    const liveDeals = (activeDeals || []).filter(
      (row: any) =>
        matchesScope(row, scope) &&
        isInVehicleScope({
          title: row.title,
          make: row.make,
          model: row.model,
          source: row.source,
          source_url: row.source_url,
        }),
    );
    const liveCoverage = buildLiveCoverage(liveDeals);
    for (const row of liveDeals) {
      const id = healthSourceIdForDeal(row, sourceIds) || "unknown";
      const proof =
        proofBySource[id] ||
        (proofBySource[id] = {
          activeRows: 0,
          rowsWithPhotos: 0,
          qualityTotal: 0,
          completeness: emptyCompleteness(),
          lastSeenAt: null,
          live: 0,
          frozen: 0,
          stale: 0,
          ended: 0,
        });
      // live / frozen (terms-gated, unrefreshed) / stale / ended, per row (lib/deals/freshness).
      proof[dealFreshness(row, freshnessNow).state] += 1;
      const images = Array.isArray(row.images) ? row.images : [];
      proof.activeRows += 1;
      if (images.length > 0) proof.rowsWithPhotos += 1;
      addCompleteness(proof.completeness, row);
      proof.qualityTotal += gradeDataQuality({
        images,
        vin: row.vin,
        titleType: rowTitleSignal(row),
        condition: row.condition,
        damageType: row.damage_type,
        mileage: row.mileage,
        locationCity: row.location_city,
        locationState: row.location_state,
        askPrice: row.ask_price,
        seller:
          (row as any).options?.contact?.phone ||
          (row as any).options?.contact?.email ||
          row.seller ||
          null,
        sellerType: rowSellerType(row),
        sellerContactUrl: sellerContact(row).url,
        auctionEndAt:
          (row as any).auction_end ||
          (row as any).auction_end_at ||
          (row as any).auctionEndAt,
        sourceUrl: row.source_url,
      }).score;
      if (!proof.lastSeenAt && row.last_seen_at) {
        proof.lastSeenAt = new Date(row.last_seen_at).toISOString();
      }
    }

    const health = sources.map((source) => {
      const proof = proofBySource[source.id];
      // Dealer-host sources (salvagezone, recar, ...) have no scraper_runs of their own: the curated
      // dealer crawl collects them and tags rows independent_dealer. A host WITH rows keeps its own
      // proof freshness (shared curated runs must not mask stale proof), but says which crawl runs it
      // (runVia) instead of reading as an unattributed "observed / 0 runs" source.
      const runVia =
        !runsBySource[source.id]?.length && source.catalogUrl
          ? "curated_dealers"
          : null;
      const runs =
        runsBySource[source.id] ||
        (source.catalogUrl && !proof?.activeRows
          ? runsBySource.curated_dealers
          : []) ||
        [];
      // independent_dealer's rows are attributed to the dealer that listed them, so its own
      // activeRows is 0 by design. Report how many rows it collected (not added to totals).
      const attributedRows =
        source.id === "independent_dealer"
          ? (activeDeals || []).filter(
              (deal: any) =>
                deal.source === "independent_dealer" &&
                matchesScope(deal, scope),
            ).length
          : null;
      const lastRun = runs[0];
      const totalRuns = runs.length;
      const failedRuns = runs.filter((r) => r.status === "error").length;
      const successRate =
        totalRuns > 0
          ? Math.round(((totalRuns - failedRuns) / totalRuns) * 100)
          : 100;
      const lastRunTime =
        lastRun?.completed_at || lastRun?.started_at || proof?.lastSeenAt;
      const lastRunAt = lastRunTime
        ? new Date(lastRunTime).toISOString()
        : null;
      const minutesSinceLastRun = lastRunAt
        ? Math.round((Date.now() - new Date(lastRunAt).getTime()) / 1000 / 60)
        : null;
      const termsOff = termsOffForSource(source.id);
      const readiness = termsOff
        ? "disabled"
        : !source.enabled
          ? source.requiresAuth
            ? "needs_login"
            : "disabled"
          : !lastRun && !proof?.activeRows
            ? source.requiresAuth
              ? "needs_login"
              : source.catalogUrl
                ? "no_rows"
                : "needs_run"
            : lastRun?.status === "error"
              ? "blocked"
              : proof?.activeRows || attributedRows
                ? "ready"
                : "no_rows";

      const row = {
        id: source.id,
        name: source.name,
        type: source.type,
        priority: source.priority,
        enabled: source.enabled,
        requiresAuth: source.requiresAuth,
        stealthRequired: source.stealthRequired,
        frequencyMinutes: source.frequencyMinutes,
        isDue:
          !termsOff &&
          (minutesSinceLastRun == null ||
            minutesSinceLastRun >= source.frequencyMinutes),
        lastRunAt,
        lastStatus:
          lastRun?.status || (proof?.activeRows ? "observed" : "never_run"),
        lastError: showInternalErrors ? lastRun?.error_message || null : null,
        totalRuns,
        failedRuns,
        successRate,
        estimatedDealsPerRun: source.estimatedDealsPerRun,
        readiness,
        activeRows: proof?.activeRows || 0,
        ...(runVia ? { runVia } : {}),
        ...(attributedRows != null
          ? { attributedRows, rowsAttributedTo: "dealer sources" }
          : {}),
        liveRows: proof?.live || 0,
        frozenRows: proof?.frozen || 0,
        staleRows: proof?.stale || 0,
        endedRows: proof?.ended || 0,
        rowsWithPhotos: proof?.rowsWithPhotos || 0,
        averageQuality: proof?.activeRows
          ? Math.round(proof.qualityTotal / proof.activeRows)
          : 0,
        completeness: proof
          ? {
              counts: proof.completeness,
              ...completenessPercentages(proof.completeness, proof.activeRows),
            }
          : {
              counts: emptyCompleteness(),
              ...completenessPercentages(emptyCompleteness(), 0),
            },
        lastSeenAt: proof?.lastSeenAt || null,
        ...termsFields(source.id),
      };
      return enrichHealthRow(source, row, true, scope);
    });

    const userHealth = userFacingHealthRows(health, scope);
    const summary = buildHealthSummary(userHealth);
    const demandCoverage = await buildDemandCoverage(
      supabase as any,
      activeDeals,
      showInternalErrors,
    );

    return NextResponse.json({
      configured: true,
      total: summary.total,
      enabled: summary.enabled,
      due: summary.due,
      healthy: summary.healthy,
      summary: demandCoverage
        ? {
            ...summary,
            ...liveCoverage,
            wantHit: demandCoverage.wantHit,
            demandCoverage,
          }
        : { ...summary, ...liveCoverage },
      coverage: liveCoverage,
      demandCoverage,
      scope,
      plan: scopedPlan,
      scopeFiltered,
      scopeStatus: buildScopeStatus({
        scope,
        scopeFiltered,
        plan: scopedPlan,
        health: userHealth,
      }),
      sources: userHealth,
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
