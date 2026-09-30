"use client";

import React, { useState, useMemo } from "react";
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
import { hasScraper, scraperCoverage } from "@/lib/scrapers/source-index";
import { cn } from "@/lib/utils";

// Computed once at module scope: how much of the researched catalog is actually wired into the
// live scraper runner. Safe here — scraperCoverage() only reads the two static registries.
const COVERAGE = scraperCoverage();

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<
    SourceCategory | "all"
  >("all");
  const [selectedPriority, setSelectedPriority] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

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
