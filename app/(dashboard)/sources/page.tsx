"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ALL_SOURCES,
  RESEARCHED_DEALER_STATES,
  SOURCE_STATS,
  getSourcesByCategory,
  getSourcesByPriority,
  getSourcesByStatus,
  type SourceConfig,
  type SourceCategory,
  type SourceType,
} from "@/lib/scrapers/sources-registry";
import {
  hasScraper,
  hasSharedImporter,
  normalizeSourceId,
  scraperCoverage,
} from "@/lib/scrapers/source-index";
import {
  CURATED_SITES,
  SITE_TYPE_META,
  type CuratedSiteType,
} from "@/lib/scrapers/curated-sites";
import { cn } from "@/lib/utils";
import { scanHrefForSource } from "@/lib/sources/source-lanes";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Circle,
  ClipboardList,
  Gauge,
  type LucideIcon,
} from "lucide-react";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load source health");
    return res.json();
  });

// Computed once at module scope: how much of the researched catalog is actually wired into the
// live scraper runner. Safe here — scraperCoverage() only reads the two static registries.
const COVERAGE = scraperCoverage();

const SETUP_LANES = [
  {
    label: "Salvage / repairable",
    category: "salvage",
    sources: ["copart", "iaa", "curated_dealers"],
    purpose:
      "Damaged, rebuildable, insurance-total vehicles, and small dealer lots.",
  },
  {
    label: "Wholesale dealer auctions",
    category: "dealer-auction",
    sources: ["manheim", "adesa", "acv"],
    purpose: "Dealer-only lanes and wholesale pricing.",
  },
  {
    label: "Private marketplace",
    category: "online-marketplace",
    sources: ["craigslist", "facebook-marketplace", "offerup", "ebay-motors"],
    purpose: "Owner and marketplace arbitrage.",
  },
  {
    label: "Retail dealer listings",
    category: "retail",
    sources: ["cars-com", "cargurus", "autotrader", "truecar"],
    purpose: "Retail comps and clean-title inventory.",
  },
  {
    label: "Repo / government",
    category: "government-surplus",
    sources: [
      "gsa-auctions",
      "publicsurplus",
      "govdeals",
      "allsurplus",
      "municibid",
    ],
    purpose: "Fleet, municipal, seized, and surplus supply.",
  },
  {
    label: "Parts / teardown",
    category: "parts",
    sources: ["carparts-com", "car-parts-com"],
    purpose: "Part-out values and recon cost signals.",
  },
] as const;

const FEATURED_SMALL_DEALERS = [
  "A&E of Miami",
  "Damage.com",
  "D & G Auto",
  "ReCar",
  "St. James Auto & Truck (Rebuilders)",
] as const;

const curatedByType = CURATED_SITES.reduce(
  (acc, site) => {
    acc[site.type] = (acc[site.type] || 0) + 1;
    return acc;
  },
  {} as Record<CuratedSiteType, number>,
);

const curatedStateCount = new Set(
  CURATED_SITES.map((site) => site.state).filter(Boolean),
).size;
const featuredDealerRows = FEATURED_SMALL_DEALERS.map((name) =>
  CURATED_SITES.find((site) => site.name === name),
).filter(Boolean);

function readinessLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    ready: "Working",
    no_rows: "No matching inventory",
    blocked: "Unavailable",
    needs_run: "Needs refresh",
    needs_login: "Sign-in required",
    disabled: "Unavailable",
    not_configured: "Unavailable",
  };
  return labels[value || ""] || "Unknown";
}

function SetupOverview({ health }: { health: any }) {
  const healthById = new Map(
    (health?.sources || []).map((s: any) => [normalizeSourceId(s.id), s]),
  );
  const loading = !health;
  const configured = health ? health.configured !== false : false;
  const readySources = (health?.sources || []).filter(
    (source: any) => source.readiness === "ready",
  ).length;
  const provenRows = (health?.sources || []).reduce(
    (sum: number, source: any) => sum + (source.activeRows || 0),
    0,
  );

  return (
    <section className="space-y-4 mb-6">
      <div className="glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
              Market coverage
            </p>
            <h2 className="text-xl font-black text-[var(--t1)]">
              Choose where you want to find your next vehicle.
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
              We only surface sources that match your lane and location. Start
              with a market, review current opportunities, and expand coverage
              when you need more choice.
            </p>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3 text-sm">
            <div className="font-bold text-[var(--t1)]">
              {loading
                ? "Checking readiness"
                : configured
                  ? "Listings on file"
                  : readySources
                    ? "Preview listings on file"
                    : "Coverage is being prepared"}
            </div>
            <div className="text-xs text-[var(--t4)]">
              {loading
                ? "Checking stored listings..."
                : `${readySources} market${readySources === 1 ? "" : "s"} with stored listings · ${provenRows.toLocaleString()} current listings. Not a worker heartbeat.`}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
              Step 1
            </div>
            <div className="mt-1 font-bold text-[var(--t1)]">Pick a lane</div>
            <p className="mt-1 text-xs text-[var(--t4)]">
              Choose salvage, wholesale, private, retail, government, or parts.
            </p>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
              Step 2
            </div>
            <div className="mt-1 font-bold text-[var(--t1)]">
              Set your buying scope
            </div>
            <p className="mt-1 text-xs text-[var(--t4)]">
              Use your vehicle, state, title, and budget to keep results useful.
            </p>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
              Step 3
            </div>
            <div className="mt-1 font-bold text-[var(--t1)]">
              Review opportunities
            </div>
            <p className="mt-1 text-xs text-[var(--t4)]">
              Compare price, condition, evidence, and the next check before you
              act.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SETUP_LANES.map((lane) => {
          const catalog = ALL_SOURCES.filter(
            (source) => source.category === lane.category,
          );
          const live = lane.sources.filter((id) => hasScraper(id));
          const lastRuns = lane.sources
            .map((id) => healthById.get(normalizeSourceId(id)) as any)
            .filter(Boolean);
          const activeRows = lastRuns.reduce(
            (sum, row: any) => sum + (row.activeRows || 0),
            0,
          );
          const photoRows = lastRuns.reduce(
            (sum, row: any) => sum + (row.rowsWithPhotos || 0),
            0,
          );
          const qualityRows = lastRuns.filter(
            (row: any) => row.averageQuality > 0,
          );
          const avgQuality = qualityRows.length
            ? Math.round(
                qualityRows.reduce(
                  (sum: number, row: any) => sum + row.averageQuality,
                  0,
                ) / qualityRows.length,
              )
            : 0;
          const laneReadiness = lastRuns.some(
            (row: any) => row.readiness === "ready",
          )
            ? "ready"
            : lastRuns.some((row: any) => row.readiness === "blocked")
              ? "blocked"
              : lastRuns.some((row: any) => row.readiness === "needs_login")
                ? "needs_login"
                : lastRuns.some((row: any) => row.readiness === "no_rows")
                  ? "no_rows"
                  : lastRuns.some((row: any) => row.readiness === "needs_run")
                    ? "needs_run"
                    : !configured
                      ? "not_configured"
                      : undefined;
          const hasCredentials = catalog.some(
            (source) => source.authRequired !== "none",
          );
          const status =
            !configured && activeRows > 0
              ? "Preview ready"
              : loading
                ? "Checking..."
                : !configured
                  ? "Needs setup"
                  : live.length
                    ? readinessLabel(laneReadiness)
                    : "Coming soon";

          return (
            <div key={lane.label} className="glass-panel p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-[var(--t1)]">
                    {lane.label}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                    {lane.purpose}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--b1)] bg-[var(--s1)] px-2.5 py-1 text-[10px] font-bold text-[var(--t3)]">
                  {status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-[var(--r2)] bg-[var(--s1)] p-2">
                  <div className="font-black text-[var(--t1)]">
                    {catalog.length}
                  </div>
                  <div className="text-[var(--t5)]">catalogued</div>
                </div>
                <div className="rounded-[var(--r2)] bg-[var(--s1)] p-2">
                  <div className="font-black text-[var(--t1)]">
                    {live.length}
                  </div>
                  <div className="text-[var(--t5)]">sources</div>
                </div>
                <div className="rounded-[var(--r2)] bg-[var(--s1)] p-2">
                  <div className="font-black text-[var(--t1)]">
                    {activeRows}
                  </div>
                  <div className="text-[var(--t5)]">listings</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] p-2">
                  <div className="font-black text-[var(--t1)]">{photoRows}</div>
                  <div className="text-[var(--t5)]">with photos</div>
                </div>
                <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] p-2">
                  <div className="font-black text-[var(--t1)]">
                    {avgQuality || "—"}
                  </div>
                  <div className="text-[var(--t5)]">avg quality</div>
                </div>
              </div>
              <div className="text-xs text-[var(--t4)]">
                {hasCredentials
                  ? "Credentials or account access may be required."
                  : "You can start with public sources that are ready for search."}
              </div>
              <button
                onClick={() => {
                  const first = catalog[0]?.category || "all";
                  window.dispatchEvent(
                    new CustomEvent("mh-source-category", { detail: first }),
                  );
                }}
                className="w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-bold text-[var(--t2)]"
              >
                View lane sources
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IndependentDealerCoverage() {
  return (
    <section className="glass-panel mb-6 overflow-hidden">
      <div className="border-b border-[var(--b1)] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
              Independent dealer coverage
            </p>
            <h2 className="text-xl font-black text-[var(--t1)]">
              Select catalogued shops, then verify their scoped availability
              before relying on inventory.
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
              AE of Miami, Damage.com, D&G Auto, ReCar, and St. James are
              catalogued here. A shop becomes "Working" only after its scoped
              listing evidence shows current listings, photos, and a last
              verified time.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3">
              <div className="text-lg font-black text-[var(--t1)]">
                {CURATED_SITES.length}
              </div>
              <div className="text-[var(--t5)]">dealer sites</div>
            </div>
            <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3">
              <div className="text-lg font-black text-[var(--t1)]">
                {curatedStateCount}
              </div>
              <div className="text-[var(--t5)]">catalogued states</div>
            </div>
            <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3">
              <div className="text-lg font-black text-[var(--t1)]">1</div>
              <div className="text-[var(--t5)]">scoped policy</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            Object.entries(SITE_TYPE_META) as Array<
              [CuratedSiteType, (typeof SITE_TYPE_META)[CuratedSiteType]]
            >
          ).map(([type, meta]) => (
            <div
              key={type}
              className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-black text-[var(--t1)]">
                  {meta.label}
                </div>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-black text-[#050507]"
                  style={{ background: meta.accent }}
                >
                  {curatedByType[type] || 0}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                {meta.blurb}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-black text-[var(--t1)]">
              Requested shops
            </div>
            <span className="rounded-full border border-[var(--green)]/40 bg-[var(--green)]/10 px-2 py-0.5 text-[10px] font-black text-[var(--green)]">
              verify availability
            </span>
          </div>
          <div className="space-y-2">
            {featuredDealerRows.map((site) => (
              <div
                key={site!.url}
                className="flex items-center justify-between gap-3 rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-[var(--t2)]">
                    {site!.name}
                  </div>
                  <div className="truncate text-[10px] text-[var(--t5)]">
                    {site!.state || "multi-state"} ·{" "}
                    {SITE_TYPE_META[site!.type].label}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--b1)] px-2 py-0.5 text-[10px] font-bold text-[var(--t4)]">
                  Catalogued
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type SourceHealthRow = {
  id: string;
  name: string;
  type?: string;
  priority?: string;
  enabled?: boolean;
  requiresAuth?: boolean;
  stealthRequired?: boolean;
  frequencyMinutes?: number;
  isDue?: boolean;
  lastRunAt?: string | null;
  lastStatus?: string;
  lastError?: string | null;
  totalRuns?: number;
  failedRuns?: number;
  successRate?: number;
  estimatedDealsPerRun?: number;
  readiness?: string;
  activeRows?: number;
  rowsWithPhotos?: number;
  averageQuality?: number;
  lastSeenAt?: string | null;
  userStatus?: string;
  proofLevel?: string;
  proofSummary?: string;
  proofBadges?: string[];
  userImpact?: string;
  nextAction?: string;
  photoCoveragePct?: number;
  qualityLabel?: string | null;
  freshnessHours?: number | null;
  completeness?: {
    counts?: Record<string, number>;
    photosPct?: number;
    vinPct?: number;
    titlePct?: number;
    mileagePct?: number;
    damagePct?: number;
    pricePct?: number;
    locationPct?: number;
    sellerPct?: number;
    sellerContactPct?: number;
    auctionDatePct?: number;
    sourceLinkPct?: number;
  };
};

type HealthScope = {
  lane?: string;
  state?: string;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
  makes?: string[];
  sellerType?: string;
  titleType?: string;
  dealerHosts?: string[];
  dealerSourceIds?: string[];
};

const HEALTH_LANES = [
  { value: "", label: "Any lane" },
  { value: "damaged", label: "Salvage / repairable" },
  { value: "auction", label: "Wholesale auctions" },
  { value: "private", label: "Private / small dealers" },
  { value: "clean-retail", label: "Clean retail" },
  { value: "government", label: "Repo / government" },
  { value: "parts", label: "Parts / teardown" },
  { value: "specialty", label: "Specialty" },
] as const;

const SELLER_TYPE_OPTIONS = [
  { value: "", label: "Any seller" },
  { value: "dealer", label: "Dealers" },
  { value: "auction", label: "Auctions" },
  { value: "private", label: "Private sellers" },
] as const;

const TITLE_TYPE_OPTIONS = [
  { value: "", label: "Any title" },
  { value: "clean", label: "Clean title" },
  { value: "salvage", label: "Salvage / repairable" },
  { value: "rebuilt", label: "Rebuilt title" },
  { value: "parts", label: "Parts only" },
] as const;

const SOURCE_PROOF_FILTERS = [
  { id: "all", label: "All" },
  { id: "ready", label: "Working" },
  { id: "needs_login", label: "Sign-in required" },
  { id: "blocked", label: "Unavailable" },
  { id: "no_rows", label: "No matching inventory" },
  { id: "needs_run", label: "Needs refresh" },
] as const;

const FEATURED_DEALER_OPTIONS = [
  { id: "ae-of-miami", label: "AE of Miami", host: "aeofmiami.com" },
  { id: "dg-auto", label: "D&G Auto", host: "dgautollc.com" },
  { id: "recar", label: "ReCar", host: "recar.com" },
  { id: "stjames-auto", label: "St. James", host: "stjamesautoparts.com" },
  { id: "damage-com", label: "Damage.com", host: "damage.com" },
  { id: "cas-miami", label: "CAS Miami", host: "casmiami.com" },
  { id: "salvagezone", label: "SalvageZone", host: "salvagezone.com" },
] as const;

const FEATURED_DEALER_IDS = new Set<string>(
  FEATURED_DEALER_OPTIONS.map((dealer) => dealer.id),
);

function normalizeDealerSourceIds(value: string | null) {
  return (value || "")
    .toLowerCase()
    .split(",")
    .map((id) =>
      id
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9_-]/g, "")
        .trim(),
    )
    .filter((id) => FEATURED_DEALER_IDS.has(id))
    .slice(0, 25);
}

function normalizeProofFilter(value: string | null) {
  const normalized = (value || "").toLowerCase().replace("-", "_");
  const aliases: Record<string, (typeof SOURCE_PROOF_FILTERS)[number]["id"]> = {
    login: "needs_login",
    auth: "needs_login",
    credentials: "needs_login",
    working: "ready",
    empty: "no_rows",
    no_rows: "no_rows",
    run: "needs_run",
    needs_run: "needs_run",
    blocked: "blocked",
    ready: "ready",
    all: "all",
  };
  return aliases[normalized] || null;
}

function readinessTone(readiness?: string) {
  if (readiness === "ready") {
    return "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]";
  }
  if (readiness === "blocked") {
    return "border-[var(--rbd)] bg-[var(--rlo)] text-[var(--red)]";
  }
  if (readiness === "needs_login") {
    return "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]";
  }
  if (readiness === "no_rows") {
    return "border-[var(--b2)] bg-[var(--s0)] text-[var(--t3)]";
  }
  return "border-[var(--b1)] bg-[var(--s1)] text-[var(--t4)]";
}

function sourceNextAction(source: SourceHealthRow, configured: boolean) {
  if (source.nextAction) return source.nextAction;
  if (source.readiness === "ready") {
    return "Open matching results and review the vehicle details.";
  }
  if (source.readiness === "needs_login") {
    return source.requiresAuth
      ? "This market requires account access or a dealer license before listings can be shown."
      : "Sign in to this market, then try again.";
  }
  if (
    !configured &&
    !["govdeals", "publicsurplus", "municibid"].includes(source.id)
  ) {
    return "This source needs a connection before it can provide matches.";
  }
  if (source.readiness === "blocked") {
    return source.stealthRequired
      ? "This source needs an additional access review before it can be used."
      : "This source is temporarily unavailable. Try again later.";
  }
  if (source.readiness === "no_rows") {
    return "No vehicles matched this source and search right now.";
  }
  if (source.readiness === "needs_run") {
    return "Refresh this market for your selected search.";
  }
  if (source.readiness === "disabled") {
    return "This source is not available for searches yet.";
  }
  return "This market is being prepared. Check back for verified listings.";
}

function detailProofItems(source: SourceHealthRow) {
  const c = source.completeness || {};
  return [
    { label: "VIN", value: c.vinPct ?? 0 },
    { label: "Title", value: c.titlePct ?? 0 },
    { label: "Mileage", value: c.mileagePct ?? 0 },
    { label: "Condition", value: c.damagePct ?? 0 },
    { label: "Price", value: c.pricePct ?? 0 },
    { label: "Seller", value: c.sellerPct ?? 0 },
    { label: "Link", value: c.sourceLinkPct ?? 0 },
  ];
}

function weakestDetailProof(source: SourceHealthRow) {
  if (!source.activeRows) return "No listings to assess";
  const weak = detailProofItems(source)
    .filter((item) => item.value < 70)
    .sort((a, b) => a.value - b.value)
    .slice(0, 2);
  return weak.length
    ? `Weak: ${weak.map((item) => `${item.label} ${item.value}%`).join(", ")}`
    : "Core details strong";
}

function weightedCompleteness(
  sources: SourceHealthRow[],
  key: Exclude<keyof NonNullable<SourceHealthRow["completeness"]>, "counts">,
) {
  const rowsWithCompleteness = sources.filter(
    (source) => Number(source.activeRows || 0) > 0 && source.completeness,
  );
  const totalRows = rowsWithCompleteness.reduce(
    (sum, source) => sum + (Number(source.activeRows) || 0),
    0,
  );
  if (!totalRows) return 0;
  return Math.round(
    rowsWithCompleteness.reduce(
      (sum, source) =>
        sum +
        Number(source.completeness?.[key] || 0) *
          (Number(source.activeRows) || 0),
      0,
    ) / totalRows,
  );
}

function SourceProofPanel({
  health,
  onFocusSource,
}: {
  health: any & { scope?: HealthScope; scopeFiltered?: boolean };
  onFocusSource: (sourceId: string) => void;
}) {
  const loading = !health;
  const [filter, setFilter] =
    useState<(typeof SOURCE_PROOF_FILTERS)[number]["id"]>("all");

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlFilter = normalizeProofFilter(params.get("filter"));
    if (urlFilter) setFilter(urlFilter);
  }, []);

  const sources = (health?.sources || []) as SourceHealthRow[];
  const configured = health?.configured !== false;
  const apiSummary = health?.summary || {};
  const sourceCounts = {
    total: sources.length,
    ready: sources.filter((s) => s.readiness === "ready").length,
    blocked: sources.filter((s) => s.readiness === "blocked").length,
    noRows: sources.filter((s) => s.readiness === "no_rows").length,
    needsRun: sources.filter((s) => s.readiness === "needs_run").length,
    needsLogin: sources.filter((s) => s.readiness === "needs_login").length,
  };
  const summary = {
    total: Number(apiSummary.total ?? sourceCounts.total),
    ready: Number(apiSummary.ready ?? apiSummary.healthy ?? sourceCounts.ready),
    blocked: Number(apiSummary.blocked ?? sourceCounts.blocked),
    noRows: Number(apiSummary.noRows ?? sourceCounts.noRows),
    needsRun: Number(apiSummary.needsRun ?? sourceCounts.needsRun),
    needsLogin: Number(apiSummary.needsLogin ?? sourceCounts.needsLogin),
    activeRows: Number(
      apiSummary.activeRows ??
        sources.reduce(
          (sum, source) => sum + (Number(source.activeRows) || 0),
          0,
        ),
    ),
    rowsWithPhotos: Number(
      apiSummary.rowsWithPhotos ??
        sources.reduce(
          (sum, source) => sum + (Number(source.rowsWithPhotos) || 0),
          0,
        ),
    ),
    photoCoveragePct: Number(apiSummary.photoCoveragePct ?? 0),
    averageQuality: Number(apiSummary.averageQuality ?? 0),
  };
  const visible = [...sources]
    .filter((source) => filter === "all" || source.readiness === filter)
    .sort((a, b) => (b.activeRows || 0) - (a.activeRows || 0))
    .slice(0, 40);
  const readySources = sources
    .filter((source) => source.readiness === "ready")
    .sort((a, b) => (b.activeRows || 0) - (a.activeRows || 0))
    .slice(0, 3);
  const actionSources = sources
    .filter((source) =>
      ["needs_login", "blocked", "needs_run", "no_rows"].includes(
        source.readiness || "",
      ),
    )
    .sort((a, b) => {
      const rank: Record<string, number> = {
        needs_login: 0,
        blocked: 1,
        needs_run: 2,
        no_rows: 3,
      };
      return (rank[a.readiness || ""] ?? 9) - (rank[b.readiness || ""] ?? 9);
    })
    .slice(0, 4);
  const scopeParts = [
    health?.scope?.lane && health.scope.lane !== "all"
      ? `${health.scope.lane} lane`
      : null,
    health?.scope?.sellerType && health.scope.sellerType !== "all"
      ? `${health.scope.sellerType} sellers`
      : null,
    health?.scope?.titleType && health.scope.titleType !== "all"
      ? `${health.scope.titleType} title`
      : null,
    health?.scope?.q || null,
    health?.scope?.makes?.length
      ? `${health.scope.makes.length} make focus`
      : null,
    health?.scope?.state || null,
    health?.scope?.minPrice
      ? `over $${Number(health.scope.minPrice).toLocaleString()}`
      : null,
    health?.scope?.maxPrice
      ? `under $${Number(health.scope.maxPrice).toLocaleString()}`
      : null,
    health?.scope?.dealerHosts?.length
      ? `${health.scope.dealerHosts.length} watched dealer${
          health.scope.dealerHosts.length === 1 ? "" : "s"
        }`
      : null,
    health?.scope?.dealerSourceIds?.length
      ? `${health.scope.dealerSourceIds.length} selected dealer${
          health.scope.dealerSourceIds.length === 1 ? "" : "s"
        }`
      : null,
  ].filter(Boolean);
  const noScopeSources =
    !loading && health?.scopeFiltered && sources.length === 0;
  const noScopeMessage =
    health?.scopeStatus?.message ||
    (noScopeSources && health?.plan?.sourceIds?.length === 0
      ? "No source matches this combination yet. Change the lane, seller type, watched dealer, or broaden your search."
      : "No source has verified matches for this exact search yet. Broaden your search or refresh matching sources.");
  const readyRows = readySources.reduce(
    (sum, source) => sum + (Number(source.activeRows) || 0),
    0,
  );
  const readyPhotos = readySources.reduce(
    (sum, source) => sum + (Number(source.rowsWithPhotos) || 0),
    0,
  );
  const readyQuality = readySources.length
    ? Math.round(
        readySources.reduce(
          (sum, source) => sum + (Number(source.averageQuality) || 0),
          0,
        ) / readySources.length,
      )
    : 0;
  const proofRows = summary.activeRows || readyRows;
  const proofPhotos = summary.rowsWithPhotos || readyPhotos;
  const proofPhotoCoverage =
    summary.photoCoveragePct ||
    (proofRows ? Math.round((proofPhotos / proofRows) * 100) : 0);
  const proofQuality = summary.averageQuality || readyQuality;
  const aggregateProof = [
    { label: "Photos", value: proofPhotoCoverage },
    { label: "VIN", value: weightedCompleteness(readySources, "vinPct") },
    {
      label: "Mileage",
      value: weightedCompleteness(readySources, "mileagePct"),
    },
    {
      label: "Seller contact",
      value: weightedCompleteness(readySources, "sellerContactPct"),
    },
    {
      label: "Auction date",
      value: weightedCompleteness(readySources, "auctionDatePct"),
    },
  ];
  const weakestAggregateProof = aggregateProof
    .filter((item) => item.value < 70)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3);
  const proofFilterCounts: Record<
    (typeof SOURCE_PROOF_FILTERS)[number]["id"],
    number
  > = {
    all: summary.total,
    ready: summary.ready,
    blocked: summary.blocked,
    no_rows: summary.noRows,
    needs_run: summary.needsRun,
    needs_login: summary.needsLogin,
  };
  const scopedScanHref = () => {
    const params = new URLSearchParams();
    if (health?.scope?.lane && health.scope.lane !== "all") {
      params.set("lane", health.scope.lane);
    }
    if (health?.scope?.state) params.set("state", health.scope.state);
    if (health?.scope?.q) params.set("q", health.scope.q);
    if (health?.scope?.makes?.length) {
      params.set("makes", health.scope.makes.join(","));
    }
    if (health?.scope?.sellerType) {
      params.set("sellerType", health.scope.sellerType);
    }
    if (health?.scope?.titleType) {
      params.set("titleType", health.scope.titleType);
    }
    if (health?.scope?.minPrice) {
      params.set("minPrice", String(health.scope.minPrice));
    }
    if (health?.scope?.maxPrice) {
      params.set("maxPrice", String(health.scope.maxPrice));
    }
    if (health?.scope?.dealerHosts?.length) {
      params.set("dealers", health.scope.dealerHosts.join(","));
    }
    if (health?.scope?.dealerSourceIds?.length) {
      params.set("dealerSourceIds", health.scope.dealerSourceIds.join(","));
    }
    params.set("sort", "score");
    return `/scan?${params.toString()}`;
  };
  const scopedScanHrefForSource = (source: SourceHealthRow) => {
    const params = new URLSearchParams();
    const fallback = new URLSearchParams(
      scanHrefForSource(source).split("?")[1] || "",
    );
    const sourceId = source.id || "";
    const sourceIsDealer =
      source.type === "dealer" || FEATURED_DEALER_IDS.has(sourceId);
    const scopedLane =
      health?.scope?.lane ||
      (sourceIsDealer ? "private" : fallback.get("lane") || undefined);
    if (scopedLane && scopedLane !== "all") params.set("lane", scopedLane);
    if (health?.scope?.state) params.set("state", health.scope.state);
    if (health?.scope?.q) params.set("q", health.scope.q);
    if (health?.scope?.makes?.length) {
      params.set("makes", health.scope.makes.join(","));
    }
    if (health?.scope?.sellerType) {
      params.set("sellerType", health.scope.sellerType);
    }
    if (health?.scope?.titleType) {
      params.set("titleType", health.scope.titleType);
    }
    if (health?.scope?.minPrice) {
      params.set("minPrice", String(health.scope.minPrice));
    }
    if (health?.scope?.maxPrice) {
      params.set("maxPrice", String(health.scope.maxPrice));
    }
    if (sourceIsDealer) {
      params.set("sellerType", "dealer");
      params.set("dealerSourceIds", sourceId);
    } else if (sourceId) {
      params.set("source", sourceId);
    }
    params.set("sort", "score");
    return `/scan?${params.toString()}`;
  };

  return (
    <section className="glass-panel mb-6 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Results coverage
          </p>
          <h2 className="text-xl font-black text-[var(--t1)]">
            {health?.scopeFiltered
              ? "Current availability for this buying plan."
              : "See which markets have current listings for your next search."}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
            {loading
              ? "Checking current market availability."
              : health?.scopeStatus?.message
                ? health.scopeStatus.message
                : health?.scopeFiltered
                  ? scopeParts.length
                    ? `Filtered by ${scopeParts.join(" · ")}. Listing count, photos, detail, and freshness reflect that search.`
                    : "Listing count, photos, detail, and freshness reflect this exact buying plan."
                  : "Each market shows current listings, photo coverage, detail quality, and how recently it was updated."}
          </p>
          {noScopeSources ? (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2 text-xs font-bold leading-relaxed text-[var(--amber-d)]">
              {noScopeMessage}{" "}
              {health?.scopeStatus?.nextAction
                ? health.scopeStatus.nextAction
                : ""}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <div className="rounded-[var(--r3)] border border-[var(--green)]/30 bg-[var(--green)]/10 px-3 py-2">
            <div className="font-black text-[var(--green)]">
              {summary.ready}
            </div>
            <div className="text-[var(--t5)]">available</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--red)]/25 bg-[var(--red)]/10 px-3 py-2">
            <div className="font-black text-[var(--red)]">
              {summary.blocked}
            </div>
            <div className="text-[var(--t5)]">unavailable</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">{summary.noRows}</div>
            <div className="text-[var(--t5)]">no matches</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">
              {summary.needsRun}
            </div>
            <div className="text-[var(--t5)]">refreshing</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-3 py-2">
            <div className="font-black text-[var(--amber-d)]">
              {summary.needsLogin}
            </div>
            <div className="text-[var(--t5)]">account access</div>
          </div>
        </div>
      </div>

      {health?.scopeFiltered && (
        <div className="mt-4 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
                Your matching results
              </p>
              <h3 className="mt-1 text-base font-black text-[var(--t1)]">
                {summary.ready
                  ? `${summary.ready} source${
                      summary.ready === 1 ? "" : "s"
                    } can show matching listings now.`
                  : "No matching market is available yet."}
              </h3>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
                {summary.ready
                  ? `${proofRows.toLocaleString()} matching listing${
                      proofRows === 1 ? "" : "s"
                    }, ${proofPhotos.toLocaleString()} photo-backed listing${
                      proofPhotos === 1 ? "" : "s"
                    }, ${proofQuality}/100 average detail quality.`
                  : "Broaden your filters, choose a different market, or adjust your buying plan to find more options."}
                {weakestAggregateProof.length
                  ? ` Verify before bidding: ${weakestAggregateProof
                      .map(
                        (item) => `${item.label.toLowerCase()} ${item.value}%`,
                      )
                      .join(", ")}.`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={scopedScanHref()}
                className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
              >
                View matching vehicles
              </Link>
              <Link
                href="/discover"
                className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
              >
                Adjust intent
              </Link>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {aggregateProof.map((item) => (
              <span
                key={item.label}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[10px] font-black",
                  item.value >= 70
                    ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                    : "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
                )}
              >
                {item.label} {item.value}%
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {SOURCE_PROOF_FILTERS.map((item) => {
          const active = filter === item.id;
          const count = proofFilterCounts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                active
                  ? "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]"
                  : "border-[var(--b1)] bg-[var(--s1)] text-[var(--t4)] hover:text-[var(--t1)]",
              )}
            >
              {item.label} {count}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.3fr]">
        <div className="rounded-[var(--r3)] border border-[var(--gbd)] bg-[var(--glo)] p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--green)]">
            Available now
          </div>
          {readySources.length ? (
            <div className="mt-2 space-y-2">
              {readySources.map((source) => (
                <Link
                  key={source.id}
                  href={scopedScanHrefForSource(source)}
                  className="block rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--s0)] px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black text-[var(--t1)]">
                      {source.name}
                    </span>
                    <span className="font-mono text-[var(--green)]">
                      {Number(source.activeRows || 0).toLocaleString()} listings
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--t4)]">
                    {Number(source.rowsWithPhotos || 0).toLocaleString()} photos
                    · {source.photoCoveragePct || 0}% photo coverage ·{" "}
                    {source.qualityLabel ||
                      `${source.averageQuality || 0}% detail`}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
              {loading
                ? "Checking ready sources..."
                : "No market has current matching listings yet."}
            </p>
          )}
        </div>

        <div className="rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--amber-d)]">
            Coverage notes
          </div>
          {actionSources.length ? (
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {actionSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => onFocusSource(source.id)}
                  className="rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--s0)] px-3 py-2 text-left text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-black text-[var(--t1)]">
                      {source.name}
                    </span>
                    <span className="shrink-0 text-[10px] font-black uppercase text-[var(--amber-d)]">
                      {readinessLabel(source.readiness)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--t4)]">
                    {source.lastError
                      ? userFacingErrorMessage(
                          source.lastError,
                          "This source is temporarily unavailable. Try again later.",
                        )
                      : source.userImpact
                        ? userFacingErrorMessage(
                            source.userImpact,
                            sourceNextAction(source, configured),
                          )
                        : sourceNextAction(source, configured)}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
              {loading
                ? "Checking sources that need action..."
                : "No markets need attention for this search right now."}
            </p>
          )}
        </div>
      </div>

      <details className="mt-4 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)]">
        <summary className="cursor-pointer px-4 py-3 text-xs font-black text-[var(--t2)]">
          See detailed market availability
        </summary>
        <div className="overflow-x-auto px-3 pb-3">
          <div className="min-w-[1180px] divide-y divide-[var(--b1)] rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)]">
            <div className="grid grid-cols-[1.2fr_0.75fr_0.5fr_0.65fr_0.7fr_1.15fr_0.75fr_1.25fr_0.8fr] gap-3 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
              <div>Source</div>
              <div>Availability</div>
              <div>Listings</div>
              <div>Photos</div>
              <div>Quality</div>
              <div>Vehicle details</div>
              <div>Last verified</div>
              <div>Next action</div>
              <div>Open</div>
            </div>
            {visible.map((source) => (
              <div
                key={source.id}
                className="grid grid-cols-[1.2fr_0.75fr_0.5fr_0.65fr_0.7fr_1.15fr_0.75fr_1.25fr_0.8fr] gap-3 px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-[var(--t1)]">
                    {source.name}
                  </div>
                </div>
                <div>
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black",
                      readinessTone(source.readiness),
                    )}
                  >
                    {source.userStatus
                      ? userFacingErrorMessage(
                          source.userStatus,
                          readinessLabel(source.readiness),
                        )
                      : readinessLabel(source.readiness)}
                  </span>
                </div>
                <div className="font-mono text-[var(--t2)]">
                  {source.activeRows || 0}
                </div>
                <div className="font-mono text-[var(--t2)]">
                  {source.rowsWithPhotos || 0}
                  <span className="ml-1 text-[10px] text-[var(--t5)]">
                    ({source.photoCoveragePct || 0}%)
                  </span>
                </div>
                <div className="text-[var(--t4)]">
                  <span className="font-mono text-[var(--t2)]">
                    {source.averageQuality || "—"}
                  </span>{" "}
                  {source.qualityLabel && (
                    <span className="text-[10px]">{source.qualityLabel}</span>
                  )}
                </div>
                <div className="space-y-1 text-[10px] text-[var(--t4)]">
                  <div className="flex flex-wrap gap-1">
                    {detailProofItems(source)
                      .slice(0, 4)
                      .map((item) => (
                        <span
                          key={item.label}
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 font-mono",
                            item.value >= 70
                              ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                              : "border-[var(--b1)] bg-[var(--s0)] text-[var(--t5)]",
                          )}
                        >
                          {item.label} {item.value}%
                        </span>
                      ))}
                  </div>
                  <div>{weakestDetailProof(source)}</div>
                </div>
                <div className="text-[var(--t4)]">
                  {source.lastSeenAt
                    ? `${new Date(source.lastSeenAt).toLocaleDateString()}${
                        source.freshnessHours != null
                          ? ` · ${source.freshnessHours}h`
                          : ""
                      }`
                    : "never"}
                </div>
                <div className="text-[var(--t4)]">
                  {source.lastError
                    ? userFacingErrorMessage(
                        source.lastError,
                        "This source is temporarily unavailable. Try again later.",
                      )
                    : source.proofSummary
                      ? userFacingErrorMessage(
                          source.proofSummary,
                          sourceNextAction(source, configured),
                        )
                      : sourceNextAction(source, configured)}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={scanHrefForSource(source)}
                    className="rounded-[var(--r1)] border border-[var(--b1)] bg-[var(--s0)] px-2 py-1 text-[10px] font-bold text-[var(--t2)] hover:border-[var(--amber-bd)]"
                  >
                    Scan
                  </Link>
                  <button
                    type="button"
                    onClick={() => onFocusSource(source.id)}
                    className="rounded-[var(--r1)] border border-[var(--b1)] bg-[var(--s0)] px-2 py-1 text-[10px] font-bold text-[var(--t4)] hover:text-[var(--t1)]"
                  >
                    Card
                  </button>
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-[var(--t4)]">
                {loading
                  ? "Loading live source proof..."
                  : noScopeSources
                    ? noScopeMessage
                    : "No sources match this health filter."}
              </div>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}

// ── Source Card ──
function sourceCardProof(source: SourceConfig, health?: SourceHealthRow) {
  const scraped = hasScraper(source.id);
  const sharedImported = !scraped && hasSharedImporter(source);
  if (health?.readiness) {
    return {
      label: readinessLabel(health.readiness),
      tone: readinessTone(health.readiness),
      title: `${health.name} listing evidence: ${health.activeRows || 0} listings, ${
        health.rowsWithPhotos || 0
      } photos, ${health.averageQuality || 0}% detail quality.`,
    };
  }
  if (scraped) {
    return {
      label: "Checking listings",
      tone: "border-[var(--b1)] bg-[var(--s1)] text-[var(--t3)]",
      title:
        "This market is configured, but it has not returned matching current listings yet.",
    };
  }
  if (sharedImported) {
    return {
      label: "Search this market",
      tone: "border-[var(--abd)] bg-[var(--alo)] text-[var(--amber)]",
      title:
        "Add this dealer to your scope and we will look for matching current listings.",
    };
  }
  return {
    label: "Coming soon",
    tone: "border-[var(--b1)] bg-[var(--s3)] text-[var(--t5)]",
    title: "We do not have verified inventory from this market yet.",
  };
}

function SourceCard({
  source,
  health,
}: {
  source: SourceConfig;
  health?: SourceHealthRow;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  // `status` describes the SITE (reachable / in-progress / dead). It does NOT mean we can scrape
  // it — that's `hasScraper()`, which checks the live runner registry. Showing both stops the
  // dashboard from implying 50 working scrapers when the pipeline actually runs a subset.
  const scraped = hasScraper(source.id);
  const sharedImported = !scraped && hasSharedImporter(source);
  const proof = sourceCardProof(source, health);

  const typeIcons: Record<SourceType, string> = {
    auction: "🔨",
    dealer: "🏪",
    marketplace: "🛒",
    aggregator: "🔗",
    government: "🏛️",
    parts: "🔧",
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="glass-panel overflow-hidden"
    >
      <div
        className="p-4 cursor-pointer hover:bg-[var(--s2)] transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl">{typeIcons[source.type]}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-bold text-[var(--t1)] truncate">
                {source.name}
              </h3>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-bold border",
                  proof.tone,
                )}
                title={proof.title}
              >
                {proof.label}
              </span>
            </div>
            <p className="text-xs text-[var(--t4)] truncate">
              {source.description}
            </p>
            <div className="flex items-center gap-3 mt-2 text-[10px] text-[var(--t5)]">
              <span className="flex items-center gap-1">
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {source.location || "Nationwide"}
              </span>
              {source.inventorySize && (
                <span className="flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                  {source.inventorySize}
                </span>
              )}
              {source.updateFrequency && (
                <span className="flex items-center gap-1">
                  <svg
                    className="w-3 h-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  {source.updateFrequency}
                </span>
              )}
            </div>
          </div>
          <svg
            className={cn(
              "w-4 h-4 text-[var(--t4)] transition-transform",
              isExpanded && "rotate-180",
            )}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[var(--b1)]"
          >
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[var(--t5)]">URL</span>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[var(--amber)] hover:underline truncate"
                  >
                    {source.url}
                  </a>
                </div>
                <div>
                  <span className="text-[var(--t5)]">Type</span>
                  <span className="block text-[var(--t2)] capitalize">
                    {source.type}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--t5)]">Category</span>
                  <span className="block text-[var(--t2)] capitalize">
                    {source.category.replace("-", " ")}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--t5)]">Account access</span>
                  <span className="block text-[var(--t2)] capitalize">
                    {source.authRequired === "none"
                      ? "Not required"
                      : "May be required"}
                  </span>
                </div>
              </div>
              {source.notes && (
                <div className="p-2 rounded-lg bg-[var(--s1)] text-xs text-[var(--t3)]">
                  <span className="font-semibold">Notes:</span> {source.notes}
                </div>
              )}
              <div className="rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-3 text-xs">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-semibold text-[var(--t1)]">
                    Listing evidence
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-black",
                      proof.tone,
                    )}
                  >
                    {proof.label}
                  </span>
                </div>
                {health ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-[var(--r1)] bg-[var(--s0)] p-2">
                        <div className="font-mono font-black text-[var(--t1)]">
                          {health.activeRows || 0}
                        </div>
                        <div className="text-[10px] text-[var(--t5)]">
                          listings
                        </div>
                      </div>
                      <div className="rounded-[var(--r1)] bg-[var(--s0)] p-2">
                        <div className="font-mono font-black text-[var(--t1)]">
                          {health.rowsWithPhotos || 0}
                        </div>
                        <div className="text-[10px] text-[var(--t5)]">
                          photos
                        </div>
                      </div>
                      <div className="rounded-[var(--r1)] bg-[var(--s0)] p-2">
                        <div className="font-mono font-black text-[var(--t1)]">
                          {health.photoCoveragePct || 0}%
                        </div>
                        <div className="text-[10px] text-[var(--t5)]">
                          coverage
                        </div>
                      </div>
                      <div className="rounded-[var(--r1)] bg-[var(--s0)] p-2">
                        <div className="font-mono font-black text-[var(--t1)]">
                          {health.averageQuality || "—"}
                        </div>
                        <div className="text-[10px] text-[var(--t5)]">
                          {health.qualityLabel || "quality"}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-[var(--r1)] border border-[var(--b1)] bg-[var(--s0)] p-2">
                      <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                        Detail completeness
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {detailProofItems(health).map((item) => (
                          <span
                            key={item.label}
                            className={cn(
                              "rounded-full border px-1.5 py-0.5 font-mono text-[10px]",
                              item.value >= 70
                                ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                                : "border-[var(--b1)] bg-[var(--s1)] text-[var(--t5)]",
                            )}
                          >
                            {item.label} {item.value}%
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--t4)]">
                        {weakestDetailProof(health)}
                      </div>
                    </div>
                    {health.proofBadges?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {health.proofBadges.slice(0, 5).map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full border border-[var(--b1)] bg-[var(--s0)] px-2 py-0.5 text-[10px] font-black text-[var(--t4)]"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="leading-relaxed text-[var(--t4)]">
                    {scraped
                      ? "This source is connected but has not returned verified matches yet."
                      : sharedImported
                        ? "Select this dealer for a tailored search to check for current matches."
                        : "This source is being prepared and is not available for searches yet."}
                  </p>
                )}
                <p className="mt-2 leading-relaxed text-[var(--t4)]">
                  {health?.lastError
                    ? userFacingErrorMessage(
                        health.lastError,
                        "This source is temporarily unavailable. Try again later.",
                      )
                    : health?.proofSummary
                      ? userFacingErrorMessage(
                          health.proofSummary,
                          sourceNextAction(health, true),
                        )
                      : health?.userImpact
                        ? userFacingErrorMessage(
                            health.userImpact,
                            sourceNextAction(health, true),
                          )
                        : health
                          ? sourceNextAction(health, true)
                          : scraped
                            ? "Search this market, then verify listings, photos, and freshness."
                            : sharedImported
                              ? "Select this dealer in Discover, preview the scope, and run the targeted search."
                              : "This source is being prepared. Check back for verified matches."}
                </p>
                {health?.nextAction && (
                  <p className="mt-1 font-bold leading-relaxed text-[var(--t2)]">
                    Next: {health.nextAction}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--grad)] text-white text-xs font-bold text-center"
                >
                  Visit Site
                </a>
                {health?.readiness === "ready" ? (
                  <Link
                    href={scanHrefForSource(health)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--s2)] text-[var(--t2)] text-xs font-bold text-center"
                  >
                    Search this market
                  </Link>
                ) : (
                  <button className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--s2)] text-[var(--t2)] text-xs font-bold">
                    View availability
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Stats Card ──
function StatsCard({
  label,
  value,
  Icon,
  tone = "var(--t3)",
}: {
  label: string;
  value: number | string;
  Icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="glass-panel p-4 text-center">
      <div className="mb-2 flex justify-center">
        <span
          className="grid h-8 w-8 place-items-center rounded-xl border border-[var(--b1)] bg-[var(--s1)]"
          style={{ color: tone }}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <div className="text-2xl font-bold text-[var(--t1)]">{value}</div>
      <div className="text-xs text-[var(--t4)]">{label}</div>
    </div>
  );
}

// ── Main Page ──
export default function SourcesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [healthScope, setHealthScope] = useState<HealthScope>({});
  const [selectedCategory, setSelectedCategory] = useState<
    SourceCategory | "all"
  >("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const healthUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (healthScope.lane) params.set("lane", healthScope.lane);
    if (healthScope.state) params.set("state", healthScope.state);
    if (healthScope.q) params.set("q", healthScope.q);
    if (healthScope.makes?.length)
      params.set("makes", healthScope.makes.join(","));
    if (healthScope.sellerType)
      params.set("sellerType", healthScope.sellerType);
    if (healthScope.titleType) params.set("titleType", healthScope.titleType);
    if (healthScope.minPrice)
      params.set("minPrice", String(healthScope.minPrice));
    if (healthScope.maxPrice)
      params.set("maxPrice", String(healthScope.maxPrice));
    if (healthScope.dealerHosts?.length) {
      params.set("dealers", healthScope.dealerHosts.join(","));
    }
    if (healthScope.dealerSourceIds?.length) {
      params.set("dealerSourceIds", healthScope.dealerSourceIds.join(","));
    }
    const query = params.toString();
    return `/api/scrape/health${query ? `?${query}` : ""}`;
  }, [healthScope]);
  const { data: health } = useSWR(healthUrl, fetcher, {
    revalidateOnFocus: false,
  });

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const category = params.get("category") || params.get("lane");
    const source = params.get("source");
    const sourceIds = normalizeDealerSourceIds(
      [
        params.get("source"),
        params.get("sourceId"),
        params.get("dealerSourceIds"),
      ]
        .filter(Boolean)
        .join(","),
    );
    const scopeLane = params.get("lane") || undefined;
    const scopeState = params.get("state")?.toUpperCase();
    const scopeQ = params.get("q");
    const scopeMakes = (params.get("makes") || "")
      .split(",")
      .map((make) =>
        make
          .replace(/[^a-zA-Z0-9\s-]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 12);
    const scopeSellerType = params.get("sellerType") || undefined;
    const scopeTitleType = params.get("titleType") || undefined;
    const scopeMinPrice = params.get("minPrice");
    const scopeMaxPrice = params.get("maxPrice");
    const scopeDealers = (params.get("dealers") || "")
      .split(",")
      .map((host) =>
        host
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0]
          .replace(/[^a-z0-9.-]/g, ""),
      )
      .filter(Boolean)
      .slice(0, 25);
    if (category) {
      const normalizedCategory = category.replace("_", "-") as SourceCategory;
      const validCategory = categories.some(
        (item) => item.id === normalizedCategory,
      );
      if (validCategory) setSelectedCategory(normalizedCategory);
    }
    if (source) setSearchQuery(source);
    if (
      scopeLane ||
      scopeState ||
      scopeQ ||
      scopeMakes.length ||
      scopeSellerType ||
      scopeTitleType ||
      scopeMinPrice ||
      scopeMaxPrice ||
      scopeDealers.length ||
      sourceIds.length
    ) {
      setHealthScope({
        lane: scopeLane || (sourceIds.length ? "private" : undefined),
        state: scopeState || undefined,
        q: scopeQ || undefined,
        makes: scopeMakes.length ? scopeMakes : undefined,
        sellerType:
          scopeSellerType || (sourceIds.length ? "dealer" : undefined),
        titleType: scopeTitleType,
        minPrice:
          scopeMinPrice && Number.isFinite(Number(scopeMinPrice))
            ? Number(scopeMinPrice)
            : undefined,
        maxPrice:
          scopeMaxPrice && Number.isFinite(Number(scopeMaxPrice))
            ? Number(scopeMaxPrice)
            : undefined,
        dealerHosts: scopeDealers.length ? scopeDealers : undefined,
        dealerSourceIds: sourceIds.length ? sourceIds : undefined,
      });
    }

    const onCategory = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) {
        setSelectedCategory(detail as SourceCategory);
        setSearchQuery("");
      }
    };
    window.addEventListener("mh-source-category", onCategory);
    return () => window.removeEventListener("mh-source-category", onCategory);
  }, []);

  const filteredSources = useMemo(() => {
    return ALL_SOURCES.filter((source) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !normalizedQuery ||
        source.id.toLowerCase().includes(normalizedQuery) ||
        source.name.toLowerCase().includes(normalizedQuery) ||
        source.description.toLowerCase().includes(normalizedQuery) ||
        source.url.toLowerCase().includes(normalizedQuery);
      const matchesCategory =
        selectedCategory === "all" || source.category === selectedCategory;
      const matchesPriority =
        selectedPriority === "all" || source.priority === selectedPriority;
      const matchesStatus =
        selectedStatus === "all" || source.status === selectedStatus;
      const matchesState =
        !healthScope.state ||
        !source.states?.length ||
        source.states.includes(healthScope.state);
      const matchesResearchVisibility =
        !source.id.startsWith("research-") ||
        Boolean(healthScope.state) ||
        Boolean(normalizedQuery);
      return (
        matchesSearch &&
        matchesCategory &&
        matchesPriority &&
        matchesStatus &&
        matchesState &&
        matchesResearchVisibility
      );
    });
  }, [
    healthScope.state,
    searchQuery,
    selectedCategory,
    selectedPriority,
    selectedStatus,
  ]);
  const scopedResearchCandidates = useMemo(
    () =>
      healthScope.state
        ? filteredSources.filter((source) =>
            source.states?.includes(healthScope.state!),
          ).length
        : 0,
    [filteredSources, healthScope.state],
  );
  const healthBySourceId = useMemo(() => {
    return new Map(
      ((health?.sources || []) as SourceHealthRow[]).map((source) => [
        normalizeSourceId(source.id),
        source,
      ]),
    );
  }, [health]);

  const categories: Array<{ id: SourceCategory | "all"; label: string }> = [
    { id: "all", label: "All Sources" },
    { id: "salvage", label: "Salvage Auctions" },
    { id: "dealer-auction", label: "Dealer Auctions" },
    { id: "online-marketplace", label: "Online Marketplaces" },
    { id: "government-surplus", label: "Government Surplus" },
    { id: "retail", label: "Retail Platforms" },
    { id: "parts", label: "Parts" },
    { id: "aggregator", label: "Aggregators" },
  ];

  return (
    <div className="min-h-screen bg-[var(--s1)]">
      {/* Header */}
      <div className="relative z-20 border-b border-[var(--b1)] bg-[var(--s0)] md:sticky md:top-0 md:z-40">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-black text-[var(--t1)]">
                Market coverage
              </h1>
              <p className="text-sm text-[var(--t4)]">
                Choose trusted markets for your buying plan and see where the
                available vehicles come from.
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--blue)]">
                {RESEARCHED_DEALER_STATES.length}-state dealer research appears
                when you choose a state or search for a dealer.
              </p>
            </div>
            <Link
              href="/discover"
              className="px-4 py-2 rounded-xl bg-[var(--grad)] text-white text-sm font-bold"
            >
              Find vehicles
            </Link>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--t4)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search markets or dealers..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
            />
          </div>

          <div className="mb-4 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] p-3">
            <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
                  Your search scope
                </p>
                <p className="text-xs text-[var(--t4)]">
                  Keep coverage aligned with the state, vehicle, title, and
                  budget you selected.
                </p>
              </div>
              {(healthScope.lane ||
                healthScope.state ||
                healthScope.q ||
                healthScope.makes?.length ||
                healthScope.sellerType ||
                healthScope.titleType ||
                healthScope.minPrice ||
                healthScope.maxPrice ||
                healthScope.dealerHosts?.length ||
                healthScope.dealerSourceIds?.length) && (
                <button
                  type="button"
                  onClick={() => setHealthScope({})}
                  className="self-start rounded-[var(--r2)] border border-[var(--b1)] px-3 py-1.5 text-xs font-bold text-[var(--t4)] hover:text-[var(--t1)] sm:self-auto"
                >
                  Clear scope
                </button>
              )}
            </div>
            <div className="grid gap-2 lg:grid-cols-9">
              <select
                value={healthScope.lane || ""}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    lane: event.target.value || undefined,
                  }))
                }
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              >
                {HEALTH_LANES.map((lane) => (
                  <option key={lane.value || "all"} value={lane.value}>
                    {lane.label}
                  </option>
                ))}
              </select>
              <select
                value={healthScope.sellerType || ""}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    sellerType: event.target.value || undefined,
                  }))
                }
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              >
                {SELLER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={healthScope.titleType || ""}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    titleType: event.target.value || undefined,
                  }))
                }
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              >
                {TITLE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value || "all"} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={healthScope.state || ""}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    state:
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, "")
                        .slice(0, 2) || undefined,
                  }))
                }
                placeholder="State, e.g. FL"
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              />
              <input
                value={healthScope.q || ""}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    q: event.target.value || undefined,
                  }))
                }
                placeholder="Vehicle keyword, e.g. suv"
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              />
              <input
                value={(healthScope.makes || []).join(", ")}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    makes: event.target.value
                      .split(",")
                      .map((make) =>
                        make
                          .replace(/[^a-zA-Z0-9\s-]/g, " ")
                          .replace(/\s+/g, " ")
                          .trim(),
                      )
                      .filter(Boolean)
                      .slice(0, 12),
                  }))
                }
                placeholder="Makes, e.g. Ford, Toyota"
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              />
              <select
                value={healthScope.minPrice ? String(healthScope.minPrice) : ""}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    minPrice: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  }))
                }
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              >
                <option value="">No min</option>
                <option value="2000">Over $2k</option>
                <option value="5000">Over $5k</option>
                <option value="10000">Over $10k</option>
                <option value="20000">Over $20k</option>
              </select>
              <select
                value={healthScope.maxPrice ? String(healthScope.maxPrice) : ""}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    maxPrice: event.target.value
                      ? Number(event.target.value)
                      : undefined,
                  }))
                }
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              >
                <option value="">No max</option>
                <option value="5000">Under $5k</option>
                <option value="10000">Under $10k</option>
                <option value="20000">Under $20k</option>
                <option value="35000">Under $35k</option>
                <option value="50000">Under $50k</option>
              </select>
              <select
                value={(healthScope.dealerSourceIds || []).join(",")}
                onChange={(event) =>
                  setHealthScope((current) => ({
                    ...current,
                    lane: event.target.value ? "private" : current.lane,
                    sellerType: event.target.value
                      ? "dealer"
                      : current.sellerType,
                    dealerSourceIds: event.target.value
                      ? event.target.value.split(",").filter(Boolean)
                      : undefined,
                    dealerHosts: undefined,
                  }))
                }
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm text-[var(--t1)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
              >
                <option value="">Any watched dealer</option>
                <option
                  value={FEATURED_DEALER_OPTIONS.map(
                    (dealer) => dealer.id,
                  ).join(",")}
                >
                  All featured dealers
                </option>
                {FEATURED_DEALER_OPTIONS.map((dealer) => (
                  <option key={dealer.id} value={dealer.id}>
                    {dealer.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--t4)]">
              <span className="font-bold text-[var(--t2)]">Checking:</span>
              <span>
                {healthScope.lane || "all lanes"}
                {healthScope.state
                  ? ` · ${healthScope.state}`
                  : " · nationwide"}
                {healthScope.q ? ` · ${healthScope.q}` : ""}
                {healthScope.makes?.length
                  ? ` · ${healthScope.makes.join("/")}`
                  : ""}
                {healthScope.sellerType
                  ? ` · ${healthScope.sellerType} sellers`
                  : ""}
                {healthScope.titleType
                  ? ` · ${healthScope.titleType} title`
                  : ""}
                {healthScope.minPrice
                  ? ` · over $${healthScope.minPrice.toLocaleString()}`
                  : ""}
                {healthScope.maxPrice
                  ? ` · under $${healthScope.maxPrice.toLocaleString()}`
                  : ""}
              </span>
              {healthScope.dealerHosts?.length ? (
                <span className="rounded-full border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-2 py-0.5 font-bold text-[var(--amber-d)]">
                  {healthScope.dealerHosts.length} watched dealer
                  {healthScope.dealerHosts.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {healthScope.dealerSourceIds?.length ? (
                <span className="rounded-full border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-2 py-0.5 font-bold text-[var(--amber-d)]">
                  {healthScope.dealerSourceIds.length} selected dealer
                  {healthScope.dealerSourceIds.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                  selectedCategory === cat.id
                    ? "bg-[var(--grad-amber)] text-[#0A0A0F]"
                    : "bg-[var(--s0)] text-[var(--t3)] border border-[var(--b1)] hover:border-[var(--amber)]",
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <IndependentDealerCoverage />
        <SourceProofPanel
          health={health}
          onFocusSource={(sourceId) => {
            setSelectedCategory("all");
            setSearchQuery(sourceId);
          }}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <StatsCard
            label="Total"
            value={SOURCE_STATS.total}
            Icon={BarChart3}
          />
          <StatsCard
            label="Active"
            value={SOURCE_STATS.active}
            Icon={CheckCircle2}
            tone="var(--green)"
          />
          <StatsCard
            label="Planned"
            value={SOURCE_STATS.planned}
            Icon={ClipboardList}
            tone="var(--amber)"
          />
          <StatsCard
            label="P0"
            value={SOURCE_STATS.p0}
            Icon={Activity}
            tone="var(--red)"
          />
          <StatsCard
            label="P1"
            value={SOURCE_STATS.p1}
            Icon={Gauge}
            tone="var(--amber)"
          />
          <StatsCard
            label="P2"
            value={SOURCE_STATS.p2}
            Icon={Circle}
            tone="var(--blue, #5b9bef)"
          />
          <StatsCard label="P3" value={SOURCE_STATS.p3} Icon={Circle} />
        </div>

        {/* Category Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          {Object.entries(SOURCE_STATS.byCategory).map(([category, count]) => (
            <div key={category} className="glass-panel p-3 text-center">
              <div className="text-lg font-bold text-[var(--t1)]">{count}</div>
              <div className="text-[10px] text-[var(--t4)] capitalize">
                {category.replace("-", " ")}
              </div>
            </div>
          ))}
        </div>

        {/* Scraper coverage: catalogued vs actually wired into the runner */}
        <div className="glass-panel p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-bold text-[var(--t1)]">
                Available market coverage
              </h2>
              <p className="text-xs text-[var(--t4)]">
                {COVERAGE.implemented} active markets •{" "}
                {COVERAGE.sharedImported} selectable dealer markets •{" "}
                {COVERAGE.catalogOnly} awaiting availability
              </p>
              {healthScope.state && (
                <p className="mt-1 text-[10px] font-semibold text-[var(--blue)]">
                  {scopedResearchCandidates} researched dealer option
                  {scopedResearchCandidates === 1 ? "" : "s"} for{" "}
                  {healthScope.state} are included below alongside national
                  markets.
                </p>
              )}
            </div>
            <span className="text-lg font-black text-[var(--amber)]">
              {Math.round(COVERAGE.ratio * 100)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-[var(--s3)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--grad-amber)] transition-[width] duration-700"
              style={{
                width: `${Math.max(2, Math.round(COVERAGE.ratio * 100))}%`,
              }}
            />
          </div>
          <p className="text-[10px] text-[var(--t5)] mt-2">
            Coverage shows the markets you can include in a search. Open a
            market to confirm current matching inventory and listing proof.
          </p>
        </div>

        {/* Sources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredSources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                health={healthBySourceId.get(normalizeSourceId(source.id))}
              />
            ))}
          </AnimatePresence>
        </div>

        {filteredSources.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-2">🔍</div>
            <p className="text-[var(--t4)]">No sources match your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
