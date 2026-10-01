"use client";

import React, { useState, useMemo } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ALL_SOURCES,
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
  normalizeSourceId,
  scraperCoverage,
} from "@/lib/scrapers/source-index";
import {
  CURATED_SITES,
  SITE_TYPE_META,
  type CuratedSiteType,
} from "@/lib/scrapers/curated-sites";
import { cn } from "@/lib/utils";

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
    ready: "Ready",
    no_rows: "No rows",
    blocked: "Blocked",
    needs_run: "Needs run",
    needs_login: "Needs login",
    disabled: "Disabled",
    not_configured: "Needs database",
  };
  return labels[value || ""] || "Unknown";
}

function SetupOverview({ health }: { health: any }) {
  const healthById = new Map(
    (health?.sources || []).map((s: any) => [normalizeSourceId(s.id), s]),
  );
  const configured = health?.configured !== false;

  return (
    <section className="space-y-4 mb-6">
      <div className="glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
              Data setup
            </p>
            <h2 className="text-xl font-black text-[var(--t1)]">
              Connect one lane, import rows, then Scan becomes useful.
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
              Adoption depends on trust: users need to see which sources are
              connected, when they last ran, and why inventory is empty. Start
              with one low-friction lane, then expand.
            </p>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3 text-sm">
            <div className="font-bold text-[var(--t1)]">
              {configured ? "Database connected" : "Database not connected"}
            </div>
            <div className="text-xs text-[var(--t4)]">
              {health?.enabled || 0} enabled runner sources ·{" "}
              {health?.healthy || 0} healthy
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
              Choose salvage, wholesale, private, retail, repo, or parts.
            </p>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
              Step 2
            </div>
            <div className="mt-1 font-bold text-[var(--t1)]">
              Configure credentials
            </div>
            <p className="mt-1 text-xs text-[var(--t4)]">
              Add required account, dealer license, proxy, or API settings.
            </p>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
              Step 3
            </div>
            <div className="mt-1 font-bold text-[var(--t1)]">
              Run and verify
            </div>
            <p className="mt-1 text-xs text-[var(--t4)]">
              Rows imported should appear in Scan with source, price, state, and
              VIN where available.
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
          const laneReadiness = !configured
            ? "not_configured"
            : lastRuns.some((row: any) => row.readiness === "ready")
              ? "ready"
              : lastRuns.some((row: any) => row.readiness === "blocked")
                ? "blocked"
                : lastRuns.some((row: any) => row.readiness === "needs_login")
                  ? "needs_login"
                  : lastRuns.some((row: any) => row.readiness === "no_rows")
                    ? "no_rows"
                    : lastRuns.some((row: any) => row.readiness === "needs_run")
                      ? "needs_run"
                      : undefined;
          const hasCredentials = catalog.some(
            (source) => source.authRequired !== "none",
          );
          const status = !configured
            ? "Needs database"
            : live.length
              ? readinessLabel(laneReadiness)
              : "Needs scraper";

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
                  <div className="text-[var(--t5)]">runners</div>
                </div>
                <div className="rounded-[var(--r2)] bg-[var(--s1)] p-2">
                  <div className="font-black text-[var(--t1)]">
                    {activeRows}
                  </div>
                  <div className="text-[var(--t5)]">live rows</div>
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
                  : "Can start with public/no-auth sources where runners exist."}
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
              Independent dealer network
            </p>
            <h2 className="text-xl font-black text-[var(--t1)]">
              Small shops are covered through one smart fan-out runner.
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
              AE of Miami, Damage.com, D&G Auto, ReCar, and St. James are
              present in the curated dealer catalog. They run through{" "}
              <span className="font-bold text-[var(--t2)]">
                curated_dealers
              </span>
              , not as five separate runner IDs, so buyer intent can include the
              whole small-dealer lane without overloading the database.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3">
              <div className="text-lg font-black text-[var(--t1)]">
                {CURATED_SITES.length}
              </div>
              <div className="text-[var(--t5)]">sites</div>
            </div>
            <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3">
              <div className="text-lg font-black text-[var(--t1)]">
                {curatedStateCount}
              </div>
              <div className="text-[var(--t5)]">states</div>
            </div>
            <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3">
              <div className="text-lg font-black text-[var(--t1)]">1</div>
              <div className="text-[var(--t5)]">runner</div>
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
              cataloged
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
                  curated_dealers
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceProofPanel({ health }: { health: any }) {
  const sources = (health?.sources || []) as any[];
  const summary = {
    ready: sources.filter((s) => s.readiness === "ready").length,
    blocked: sources.filter((s) => s.readiness === "blocked").length,
    noRows: sources.filter((s) => s.readiness === "no_rows").length,
    needsRun: sources.filter((s) => s.readiness === "needs_run").length,
    needsLogin: sources.filter((s) => s.readiness === "needs_login").length,
  };
  const visible = [...sources]
    .sort((a, b) => (b.activeRows || 0) - (a.activeRows || 0))
    .slice(0, 10);

  return (
    <section className="glass-panel mb-6 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Source proof
          </p>
          <h2 className="text-xl font-black text-[var(--t1)]">
            Working, blocked, empty, and fresh sources are separated.
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
            Each source reports operational health plus inventory proof: rows,
            photos, average detail quality, and the newest listing seen.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          <div className="rounded-[var(--r3)] border border-[var(--green)]/30 bg-[var(--green)]/10 px-3 py-2">
            <div className="font-black text-[var(--green)]">
              {summary.ready}
            </div>
            <div className="text-[var(--t5)]">ready</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--red)]/25 bg-[var(--red)]/10 px-3 py-2">
            <div className="font-black text-[var(--red)]">
              {summary.blocked}
            </div>
            <div className="text-[var(--t5)]">blocked</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">{summary.noRows}</div>
            <div className="text-[var(--t5)]">no rows</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">
              {summary.needsRun}
            </div>
            <div className="text-[var(--t5)]">needs run</div>
          </div>
          <div className="rounded-[var(--r3)] border border-[var(--amber)]/30 bg-[var(--amber)]/10 px-3 py-2">
            <div className="font-black text-[var(--amber-d)]">
              {summary.needsLogin}
            </div>
            <div className="text-[var(--t5)]">login</div>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[760px] divide-y divide-[var(--b1)] rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)]">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.8fr_1fr] gap-3 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
            <div>Source</div>
            <div>Status</div>
            <div>Rows</div>
            <div>Photos</div>
            <div>Quality</div>
            <div>Newest seen</div>
          </div>
          {visible.map((source) => (
            <div
              key={source.id}
              className="grid grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.8fr_1fr] gap-3 px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="truncate font-bold text-[var(--t1)]">
                  {source.name}
                </div>
                <div className="truncate text-[10px] text-[var(--t5)]">
                  {source.id}
                </div>
              </div>
              <div className="font-bold text-[var(--t3)]">
                {readinessLabel(source.readiness)}
              </div>
              <div className="font-mono text-[var(--t2)]">
                {source.activeRows || 0}
              </div>
              <div className="font-mono text-[var(--t2)]">
                {source.rowsWithPhotos || 0}
              </div>
              <div className="font-mono text-[var(--t2)]">
                {source.averageQuality || "—"}
              </div>
              <div className="text-[var(--t4)]">
                {source.lastSeenAt
                  ? new Date(source.lastSeenAt).toLocaleDateString()
                  : "never"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Source Card ──
function SourceCard({ source }: { source: SourceConfig }) {
  const [isExpanded, setIsExpanded] = useState(false);
  // `status` describes the SITE (reachable / in-progress / dead). It does NOT mean we can scrape
  // it — that's `hasScraper()`, which checks the live runner registry. Showing both stops the
  // dashboard from implying 50 working scrapers when the pipeline actually runs a subset.
  const scraped = hasScraper(source.id);

  const priorityColors = {
    P0: "bg-[var(--red)]",
    P1: "bg-[var(--orange)]",
    P2: "bg-[var(--blue)]",
    P3: "bg-[var(--s5)]",
  };

  const statusColors = {
    active: "bg-[var(--green)]",
    planned: "bg-[var(--blue)]",
    testing: "bg-[var(--orange)]",
    disabled: "bg-[var(--s5)]",
  };

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
                  "px-1.5 py-0.5 rounded text-[10px] font-bold text-white",
                  priorityColors[source.priority],
                )}
              >
                {source.priority}
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-bold text-white",
                  statusColors[source.status],
                )}
              >
                {source.status}
              </span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-bold border",
                  scraped
                    ? "bg-[var(--green)]/15 border-[var(--green)]/40 text-[var(--green)]"
                    : "bg-[var(--s3)] border-[var(--b1)] text-[var(--t5)]",
                )}
                title={
                  scraped
                    ? "A scraper for this source is registered in the live runner."
                    : "Catalogued only — no scraper is wired into the runner yet."
                }
              >
                {scraped ? "SCRAPING" : "NO SCRAPER"}
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
                  <span className="text-[var(--t5)]">Auth Required</span>
                  <span className="block text-[var(--t2)] capitalize">
                    {source.authRequired.replace("-", " ")}
                  </span>
                </div>
                {source.rateLimit && (
                  <div>
                    <span className="text-[var(--t5)]">Rate Limit</span>
                    <span className="block text-[var(--t2)]">
                      {source.rateLimit.requests} req /{" "}
                      {source.rateLimit.perMs / 1000}s
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[var(--t5)]">FlareSolverr</span>
                  <span className="block text-[var(--t2)]">
                    {source.requiresFlareSolverr ? "Yes" : "No"}
                  </span>
                </div>
              </div>
              {source.notes && (
                <div className="p-2 rounded-lg bg-[var(--s1)] text-xs text-[var(--t3)]">
                  <span className="font-semibold">Notes:</span> {source.notes}
                </div>
              )}
              <div className="flex gap-2">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--grad)] text-white text-xs font-bold text-center"
                >
                  Visit Site
                </a>
                <button className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--s2)] text-[var(--t2)] text-xs font-bold">
                  Configure Scraper
                </button>
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
  icon,
}: {
  label: string;
  value: number | string;
  icon: string;
}) {
  return (
    <div className="glass-panel p-4 text-center">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold text-[var(--t1)]">{value}</div>
      <div className="text-xs text-[var(--t4)]">{label}</div>
    </div>
  );
}

// ── Main Page ──
export default function SourcesPage() {
  const { data: health } = useSWR("/api/scrape/health", fetcher, {
    revalidateOnFocus: false,
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    SourceCategory | "all"
  >("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  React.useEffect(() => {
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
      const matchesSearch =
        source.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        source.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "all" || source.category === selectedCategory;
      const matchesPriority =
        selectedPriority === "all" || source.priority === selectedPriority;
      const matchesStatus =
        selectedStatus === "all" || source.status === selectedStatus;
      return (
        matchesSearch && matchesCategory && matchesPriority && matchesStatus
      );
    });
  }, [searchQuery, selectedCategory, selectedPriority, selectedStatus]);

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
      <div className="sticky top-0 z-40 frosted border-b border-[var(--b1)]">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-black text-[var(--t1)]">
                Source Registry
              </h1>
              <p className="text-sm text-[var(--t4)]">
                {SOURCE_STATS.total} sources • {SOURCE_STATS.active} active •{" "}
                {SOURCE_STATS.planned} planned • {COVERAGE.implemented} with a
                live scraper
              </p>
            </div>
            <Link
              href="/discover"
              className="px-4 py-2 rounded-xl bg-[var(--grad)] text-white text-sm font-bold"
            >
              Back to Discover
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
              placeholder="Search sources..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--b1)] bg-[var(--s0)] text-[var(--t1)] placeholder:text-[var(--t5)] focus:outline-none focus:ring-2 focus:ring-[var(--amber)]"
            />
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
        <SetupOverview health={health} />
        <IndependentDealerCoverage />
        <SourceProofPanel health={health} />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
          <StatsCard label="Total" value={SOURCE_STATS.total} icon="📊" />
          <StatsCard label="Active" value={SOURCE_STATS.active} icon="✅" />
          <StatsCard label="Planned" value={SOURCE_STATS.planned} icon="📋" />
          <StatsCard label="P0" value={SOURCE_STATS.p0} icon="🔴" />
          <StatsCard label="P1" value={SOURCE_STATS.p1} icon="🟠" />
          <StatsCard label="P2" value={SOURCE_STATS.p2} icon="🔵" />
          <StatsCard label="P3" value={SOURCE_STATS.p3} icon="⚪" />
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
                Scraper Coverage
              </h2>
              <p className="text-xs text-[var(--t4)]">
                {COVERAGE.implemented} of {COVERAGE.catalogued} catalogued sites
                have a scraper registered in the runner • {COVERAGE.runnerOnly}{" "}
                runner-only meta-sources
              </p>
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
            Sites marked <span className="text-[var(--t3)]">NO SCRAPER</span>{" "}
            are research records only — they are not being fetched. Build queue:{" "}
            {COVERAGE.missing.slice(0, 6).join(", ")}
            {COVERAGE.missing.length > 6
              ? `, +${COVERAGE.missing.length - 6} more`
              : ""}
          </p>
        </div>

        {/* Sources Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredSources.map((source) => (
              <SourceCard key={source.id} source={source} />
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
