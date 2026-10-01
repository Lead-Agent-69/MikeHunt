"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Suspense,
} from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useViewTransition } from "@/hooks/useViewTransition";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Ico } from "@/components/shared/Ico";
import { useRecentSearches } from "@/components/shared/useRecentSearches";

import { LayoutGrid, Rows3, Table2 } from "lucide-react";
import { DealTable } from "@/components/scan/DealTable";
import { DealCard, DealCardSkeleton } from "@/components/shared/DealCard";
import { LaneModeHUD } from "@/components/scan/LaneModeHUD";
import { isValidVin } from "@/lib/vehicle/vin";
import { ErrorState as SharedErrorState } from "@/components/shared/ErrorState";
import { ALL_VEHICLE_SOURCES } from "@/lib/utils/sources";
import { sourceMeta, tint } from "@/lib/sources/source-meta";
import { cn } from "@/lib/utils";
import { Deal } from "@/lib/data/deals-service";
import { US_STATES } from "@/lib/utils/titleRules";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { useDealerId } from "@/hooks/useDealerId";
import { fetcher } from "@/lib/swr-config";
import {
  CAR_CATEGORIES,
  carCategories,
  type CarLike,
} from "@/lib/scoring/deal-categories";
import { ProfitSimulatorDrawer } from "@/components/ui/next-level-features";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { fieldLabel, gradeDataQuality } from "@/lib/data-quality";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanResult {
  id: string;
  source: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  bodyClass?: string;
  recallsCount?: number;
  askPrice: number;
  mmrValue: number;
  profitEstimate: number;
  profitScore: number;
  locationCity?: string;
  locationState?: string;
  mileage?: number;
  condition?: string;
  damageType?: string;
  dealVerdict?: "go" | "hold" | "pass";
  recommendedMaxBid?: number;
  sellEstimate?: number;
  repairEstimate: number;
  auctionEnds: string;
  priceDropAmount?: number;
  priceDropDays?: number;
  auctionEndAt?: string | Date;
  bidCount?: number;
  firstSeenAt?: string | Date;
  lastSeenAt?: string | Date;
  imageUrl?: string;
  vin?: string;
  sourceUrl?: string;
  seller?: string;
  sellerType?: string;
  dataQuality?: {
    score: number;
    label: "Excellent" | "Good" | "Thin" | "Sparse";
    missing: string[];
  };
}

type PreviewProofItem = {
  id: string;
  label: string;
  status: "working" | "no_rows" | "blocked";
  rows: number;
  matchedRows: number;
  detail?: string;
};

type ImportRunItem = {
  source: string;
  success: boolean;
  dealsFound: number;
  duration: number;
  error?: string;
};

type ReadinessItem = {
  id: string;
  label: string;
  status: "ready" | "missing" | "partial";
  detail: string;
  nextStep: string;
};

function mapDealToResult(deal: Deal): ScanResult {
  const images = Array.isArray(deal.images) ? deal.images : [];
  const existingQuality = (deal as any).dataQuality;
  const quality =
    existingQuality ||
    gradeDataQuality({
      images,
      imageUrl: images[0],
      vin: deal.vin,
      condition: deal.condition,
      damageType: deal.damageType,
      mileage: deal.mileage,
      locationCity: deal.locationCity,
      locationState: deal.locationState,
      askPrice: deal.askPrice,
      seller: deal.seller,
      sellerType: deal.sellerType,
      sourceUrl: deal.sourceUrl,
    });

  return {
    id: deal.id,
    source: deal.source,
    year: deal.year ?? 0,
    make: deal.make || "",
    model: deal.model || "",
    trim: (deal as any).trim || undefined,
    bodyClass: (deal as any).bodyClass || undefined,
    recallsCount: (deal as any).recallsCount ?? undefined,
    askPrice: deal.askPrice ?? 0,
    mmrValue: deal.mmrValue ?? 0,
    profitEstimate: deal.profitEstimate ?? 0,
    profitScore: deal.profitScore ?? 50,
    locationCity: deal.locationCity,
    locationState: deal.locationState,
    mileage: deal.mileage,
    condition: deal.condition,
    damageType: deal.damageType,
    dealVerdict: deal.dealVerdict,
    recommendedMaxBid: deal.recommendedMaxBid,
    sellEstimate: deal.sellEstimate,
    repairEstimate: (deal as any).repair_estimate ?? 0,
    auctionEnds: deal.auctionEndAt
      ? new Date(deal.auctionEndAt).toLocaleDateString()
      : "Active",
    priceDropAmount: deal.priceDropAmount,
    priceDropDays: deal.priceDropDays,
    auctionEndAt: deal.auctionEndAt,
    bidCount: (deal as any).bidCount,
    firstSeenAt: deal.firstSeenAt,
    lastSeenAt: deal.lastSeenAt,
    imageUrl: images[0],
    vin: deal.vin,
    sourceUrl: deal.sourceUrl,
    seller: deal.seller,
    sellerType: deal.sellerType,
    dataQuality: {
      score: quality.score,
      label: quality.label,
      missing: quality.missing.map((field: any) =>
        typeof field === "string" && field.includes(" ")
          ? field
          : fieldLabel(field),
      ),
    },
  };
}

// ── Toast notification ────────────────────────────────────────────────────────

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "info" | "error";
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-3 rounded-[var(--r3)] px-4 py-3 border shadow-lg"
          style={{
            background:
              t.type === "success"
                ? "rgba(5,150,105,0.10)"
                : t.type === "error"
                  ? "rgba(220,38,38,0.10)"
                  : "rgba(255,56,92,0.08)",
            borderColor:
              t.type === "success"
                ? "rgba(5,150,105,0.25)"
                : t.type === "error"
                  ? "rgba(220,38,38,0.25)"
                  : "rgba(255,56,92,0.25)",
            color:
              t.type === "success"
                ? "var(--green)"
                : t.type === "error"
                  ? "var(--red)"
                  : "var(--amber)",
            animation: "fadeUp 200ms cubic-bezier(.16,1,.3,1)",
            backdropFilter: "blur(12px)",
          }}
        >
          <span className="text-sm font-semibold">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Status strip ──────────────────────────────────────────────────────────────

function StatusStrip({
  loading,
  error,
  total,
  results,
  lastScan,
}: {
  loading: boolean;
  error: string | null;
  total: number;
  results: ScanResult[];
  lastScan: Date | null;
}) {
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach((r) => {
      counts[r.source] = (counts[r.source] || 0) + 1;
    });
    return counts;
  }, [results]);

  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const lastScanText = lastScan
    ? lastScan.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "never";

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 rounded-[var(--r3)] font-mono text-[11px] overflow-x-auto"
      style={{ background: "var(--s1)", border: "1px solid var(--b1)" }}
    >
      {/* Status dot */}
      <span className="flex items-center gap-1.5 shrink-0">
        <span
          className={cn(
            "w-2 h-2 rounded-full inline-block",
            loading ? "animate-pulse" : "",
          )}
          style={{ background: error ? "var(--red)" : "var(--green)" }}
        />
        <span style={{ color: error ? "var(--red)" : "var(--green)" }}>
          {error ? "[ERR]" : "[OK]"}
        </span>
        <span className="text-[var(--t4)] font-semibold">Connected</span>
      </span>

      <span className="text-[var(--b3)] hidden sm:inline">·</span>

      <span className="text-[var(--t2)] shrink-0">
        <span style={{ color: "var(--amber)" }}>{total}</span> active deals
      </span>

      <span className="text-[var(--b3)] hidden sm:inline">·</span>

      <span className="text-[var(--t4)] shrink-0">
        Last scan: <span className="text-[var(--t2)]">{lastScanText}</span>
      </span>

      {topSources.length > 0 && (
        <>
          <span className="text-[var(--b3)] hidden md:inline">·</span>
          <span className="hidden items-center gap-1.5 md:inline-flex">
            {topSources.map(([src, n]) => {
              const m = sourceMeta(src);
              return (
                <span
                  key={src}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: tint(m.color), color: m.color }}
                  title={`${n} from ${m.label}`}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: m.color }}
                  />
                  {m.short} {n}
                </span>
              );
            })}
          </span>
        </>
      )}

      {loading && (
        <span className="text-[var(--amber)] animate-pulse shrink-0 ml-auto">
          Fetching...
        </span>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-20 px-6 rounded-2xl"
      style={{ border: "2px dashed var(--b2)", background: "var(--s0)" }}
    >
      {/* Animated radar pulse */}
      <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
        {/* Pulse rings */}
        <span
          className="absolute inset-0 rounded-full border-2"
          style={{
            borderColor: "rgba(37,99,111,0.14)",
            animation: "pulse-ring 2s ease-out infinite",
          }}
        />
        <span
          className="absolute inset-0 rounded-full border-2 scale-75"
          style={{
            borderColor: "rgba(37,99,111,0.20)",
            animation: "pulse-ring 2s ease-out infinite 0.5s",
          }}
        />
        <span
          className="absolute inset-0 rounded-full border-2 scale-50"
          style={{
            borderColor: "rgba(37,99,111,0.26)",
            animation: "pulse-ring 2s ease-out infinite 1s",
          }}
        />
        {/* Center icon */}
        <div
          className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: "var(--clo)", border: "2px solid var(--cbd)" }}
        >
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--amber)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
          </svg>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-[var(--t1)] mb-3">
        Scanning for deals
      </h2>
      <p className="text-[var(--t3)] max-w-sm mb-8 leading-relaxed">
        We’re continuously scanning thousands of listings for profitable flips.
        Nothing matches your current view yet — try widening your filters, or
        check back in a few minutes as fresh deals land.
      </p>

      <button
        onClick={onRetry}
        className="flex items-center gap-2 text-sm font-bold rounded-xl px-5 py-2.5 transition-all text-white border-none"
        style={{ background: "var(--grad)" }}
      >
        <Ico name="refresh" size={16} />
        Refresh Now
      </button>

      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(1);    opacity: 1; }
          100% { transform: scale(1.5);  opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Error state (uses shared ErrorState component) ────────────────────────────

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <SharedErrorState
      title="Scan Failed"
      message={message}
      onRetry={onRetry}
      retryLabel="Retry"
    />
  );
}

function SmartDataPlanCard({
  configured,
  total,
  plan,
  onPreview,
  onRun,
  onLivePreview,
  previewing,
  running,
  livePreviewing,
  showingPreview,
  proof,
  importRun,
  readinessItems,
  message,
}: {
  configured: boolean;
  total: number;
  plan: ReturnType<typeof planScrapeForBuyerScope>;
  onPreview: () => void;
  onRun: () => void;
  onLivePreview: () => void;
  previewing: boolean;
  running: boolean;
  livePreviewing: boolean;
  showingPreview: boolean;
  proof: PreviewProofItem[];
  importRun: ImportRunItem[];
  readinessItems: ReadinessItem[];
  message: string | null;
}) {
  const ready = configured && total > 0;
  const importReadiness = readinessItems.filter((item) =>
    ["supabase", "service-role", "scrape-control", "google-login"].includes(
      item.id,
    ),
  );
  const proofStyles: Record<PreviewProofItem["status"], string> = {
    working: "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]",
    no_rows: "border-[var(--b2)] bg-[var(--s0)] text-[var(--t3)]",
    blocked:
      "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
  };
  const proofLabel: Record<PreviewProofItem["status"], string> = {
    working: "Working",
    no_rows: "No rows",
    blocked: "Blocked",
  };
  const importedRows = importRun.reduce(
    (sum, item) => sum + (item.dealsFound || 0),
    0,
  );
  const importSuccesses = importRun.filter((item) => item.success).length;

  return (
    <section className="glass-panel p-4 md:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Smart data plan
          </p>
          <h2 className="text-lg font-black text-[var(--t1)]">
            {ready
              ? "Live inventory is being filtered by your buying intent."
              : showingPreview
                ? "Showing real public preview rows while setup is pending."
                : configured
                  ? "Connected, but this search has no matching live rows yet."
                  : "Real data is waiting on provider setup."}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
            This view will fetch only the relevant source lane, then normalize
            photos, VIN, mileage, title, state, price, seller, and source URL
            into the deal cards.
          </p>
          {!configured && (
            <Link
              href="/status"
              className="mt-2 inline-flex text-xs font-bold text-[var(--amber-d)] hover:underline"
            >
              Open readiness checklist
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onPreview}
            disabled={previewing || running}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Ico name="scan" size={15} />
            {previewing ? "Planning..." : "Preview source plan"}
          </button>
          {!configured && (
            <button
              type="button"
              onClick={onLivePreview}
              disabled={previewing || running || livePreviewing}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)] transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <Ico name="search" size={15} />
              {livePreviewing ? "Fetching..." : "Live public preview"}
            </button>
          )}
          <button
            type="button"
            onClick={onRun}
            disabled={!configured || previewing || running}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ background: "var(--grad)" }}
            title={
              configured
                ? "Run only the selected source lane."
                : "Connect Supabase and auth before importing live inventory."
            }
          >
            <Ico name="refresh" size={15} />
            {running ? "Running..." : "Run matching sources"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
            Sources
          </div>
          <div className="mt-1 text-base font-black text-[var(--t1)]">
            {plan.sourceIds.length} selected
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
            {plan.sourceIds.join(", ")}
          </p>
        </div>
        <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
            Scope
          </div>
          <div className="mt-1 text-base font-black text-[var(--t1)]">
            {plan.scope.lane}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
            {plan.filters.state || "Nationwide"} ·{" "}
            {plan.filters.q || "all vehicles"}
          </p>
        </div>
        <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
            Status
          </div>
          <div className="mt-1 text-base font-black text-[var(--t1)]">
            {configured
              ? `${total.toLocaleString()} rows`
              : showingPreview
                ? `${total.toLocaleString()} preview rows`
                : "setup needed"}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
            {configured
              ? "Scan is querying the live deals table."
              : showingPreview
                ? "Preview rows are fetched live and are not saved yet."
                : "Add real Supabase/Auth keys and run an ingestion job."}
          </p>
        </div>
      </div>

      {message && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-4 py-3 text-sm font-semibold text-[var(--t2)]">
          {message}
        </div>
      )}

      {!configured && importReadiness.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Import readiness
              </div>
              <p className="text-xs text-[var(--t4)]">
                These gates control saved inventory, Google sign-in, and
                protected scraper runs.
              </p>
            </div>
            <Link
              href="/status"
              className="text-xs font-bold text-[var(--accent)] hover:underline"
            >
              Setup
            </Link>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {importReadiness.map((item) => {
              const ok = item.status === "ready";
              const partial = item.status === "partial";
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-[var(--r2)] border px-3 py-2",
                    ok
                      ? "border-[var(--gbd)] bg-[var(--glo)]"
                      : partial
                        ? "border-[var(--amber-bd)] bg-[var(--amber-lo)]"
                        : "border-[var(--b2)] bg-[var(--s0)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-[var(--t1)]">
                      {item.label}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-black uppercase tracking-wider",
                        ok
                          ? "text-[var(--green)]"
                          : partial
                            ? "text-[var(--amber-d)]"
                            : "text-[var(--t5)]",
                      )}
                    >
                      {ok ? "Ready" : partial ? "Needs provider" : "Missing"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                    {item.nextStep}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {proof.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Source proof
              </div>
              <p className="text-xs text-[var(--t4)]">
                Live preview attempts from this network, before anything is
                saved.
              </p>
            </div>
            <Link
              href="/sources"
              className="text-xs font-bold text-[var(--accent)] hover:underline"
            >
              All sources
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {proof.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "rounded-[var(--r2)] border px-3 py-2 text-xs",
                  proofStyles[item.status],
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-[var(--t1)]">
                    {item.label}
                  </span>
                  <span className="font-black">{proofLabel[item.status]}</span>
                </div>
                <div className="mt-1 font-semibold text-[var(--t3)]">
                  {item.matchedRows.toLocaleString()} matched ·{" "}
                  {item.rows.toLocaleString()} read
                </div>
                {item.detail && (
                  <div className="mt-1 line-clamp-2 text-[var(--t4)]">
                    {item.detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {importRun.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Last import run
              </div>
              <p className="text-xs text-[var(--t4)]">
                {importSuccesses}/{importRun.length} sources succeeded ·{" "}
                {importedRows.toLocaleString()} rows found
              </p>
            </div>
            <Link
              href="/status"
              className="text-xs font-bold text-[var(--accent)] hover:underline"
            >
              Run health
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {importRun.map((item) => {
              const ok = item.success;
              return (
                <div
                  key={`${item.source}-${item.duration}`}
                  className={cn(
                    "rounded-[var(--r2)] border px-3 py-2 text-xs",
                    ok
                      ? "border-[var(--gbd)] bg-[var(--glo)]"
                      : "border-[var(--amber-bd)] bg-[var(--amber-lo)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-black text-[var(--t1)]">
                      {item.source}
                    </span>
                    <span
                      className={cn(
                        "font-black",
                        ok ? "text-[var(--green)]" : "text-[var(--amber-d)]",
                      )}
                    >
                      {ok ? "Ready" : "Failed"}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-[var(--t3)]">
                    {(item.dealsFound || 0).toLocaleString()} rows ·{" "}
                    {Math.round((item.duration || 0) / 1000)}s
                  </div>
                  {item.error && (
                    <div className="mt-1 line-clamp-2 text-[var(--t4)]">
                      {item.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Filter select ─────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm text-[var(--t1)] rounded-[var(--r2)] px-3 py-2 outline-none transition-all"
      style={{
        background: "var(--s0)",
        border: "1px solid var(--b2)",
        fontFamily: "var(--fn)",
      }}
      aria-label={label}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A small labeled cluster of filters (what / where / kind / from), for the advanced panel. */
function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--t5)] shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

let _toastId = 0;

function ScanPageInner() {
  const urlParams = useSearchParams();
  const { transitionTo } = useViewTransition();
  const { dealerId, loading: dealerLoading } = useDealerId();

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">(
    "comfortable",
  );
  const [view, setView] = useState<"grid" | "table">("grid");
  const [isLaneModeOpen, setIsLaneModeOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const { recents, addRecent, removeRecent, clearRecents } =
    useRecentSearches();

  // Persisted display density (Visor "compact view" — see more listings at once).
  useEffect(() => {
    const d = localStorage.getItem("dhp_density");
    if (d === "compact" || d === "comfortable") setDensity(d);
    const v = localStorage.getItem("dhp_view");
    if (v === "grid" || v === "table") setView(v);
  }, []);
  const changeView = useCallback((v: "grid" | "table") => {
    setView(v);
    try {
      localStorage.setItem("dhp_view", v);
    } catch {
      /* ignore */
    }
  }, []);
  const changeDensity = useCallback((d: "comfortable" | "compact") => {
    setDensity(d);
    try {
      localStorage.setItem("dhp_density", d);
    } catch {
      /* ignore */
    }
  }, []);
  const gridClass =
    density === "compact"
      ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5"
      : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Commit a query to history + apply it immediately (used by Enter, Scan button, recent chips).
  // Natural-language parse (Visor "souped-up search"): "F-150 under 25k in Texas" → make=Ford,
  // q="F-150", maxPrice=25000, state=TX. Plain queries with no recognized tokens search as before.
  const commitSearch = useCallback(
    async (val: string) => {
      const raw = val.trim();
      addRecent(raw);

      // VIN paste: search inventory by VIN directly (the scan API matches the vin column) and skip
      // the NL parser, which would otherwise mangle the 17-char string into make/model tokens.
      if (isValidVin(raw)) {
        setSearchInput(raw);
        setSearch(raw);
        return;
      }

      try {
        const res = await fetch(`/api/scan/parse?q=${encodeURIComponent(raw)}`);
        const p = await res.json();

        if (p.make) setMake(p.make);
        if (p.state) setState(p.state);
        if (p.maxPrice) setMaxPrice(String(p.maxPrice));
        if (p.targetProfit) setMinProfit(String(p.targetProfit));
        if (p.minYear) setMinYear(String(p.minYear));

        const structured = !!(
          p.make ||
          p.state ||
          p.maxPrice ||
          p.targetProfit ||
          p.minYear
        );
        // Residual free-text: the model if we recognized one, else the raw query
        // (so a plain "sienna" still searches), else empty when only filters were found.
        const residual = p.model || (structured ? "" : raw);
        setSearchInput(residual);
        setSearch(residual);
      } catch (err) {
        setSearchInput(raw);
        setSearch(raw);
      }
    },
    [addRecent],
  );

  // Filters
  const [sourceFilter, setSourceFilter] = useState("all");
  const [titleType, setTitleType] = useState("all");
  const [lane, setLane] = useState("all"); // acquisition lane segment (auction/salvage/…)
  const [minProfit, setMinProfit] = useState("any");
  const [state, setState] = useState("all");
  const [make, setMake] = useState("all");
  const [model, setModel] = useState("all");
  const [maxPrice, setMaxPrice] = useState("any");
  const [minYear, setMinYear] = useState("any");
  const [maxMileage, setMaxMileage] = useState("any");
  const [availability, setAvailability] = useState("all");
  const [madeInUsa, setMadeInUsa] = useState(false);
  const [drivetrain, setDrivetrain] = useState("all");
  const [sort, setSort] = useState("profit");
  // New: verdict (GO-only), price floor, year ceiling, and an advanced-filters disclosure.
  const [verdict, setVerdict] = useState("all");
  const [category, setCategory] = useState("all"); // browsable one-tap lead category
  const [minPrice, setMinPrice] = useState("any");
  const [maxYear, setMaxYear] = useState("any");
  const [showMore, setShowMore] = useState(false);
  const [planPreviewing, setPlanPreviewing] = useState(false);
  const [runImporting, setRunImporting] = useState(false);
  const [livePreviewing, setLivePreviewing] = useState(false);
  const [livePreviewRows, setLivePreviewRows] = useState<any[]>([]);
  const [livePreviewProof, setLivePreviewProof] = useState<PreviewProofItem[]>(
    [],
  );
  const [importRunProof, setImportRunProof] = useState<ImportRunItem[]>([]);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  useEffect(() => {
    const q = urlParams.get("q");
    const source = urlParams.get("source");
    const title = urlParams.get("titleType");
    const laneParam = urlParams.get("lane");
    const stateParam = urlParams.get("state");
    const makeParam = urlParams.get("make");
    const modelParam = urlParams.get("model");
    const sortParam = urlParams.get("sort");

    if (q) {
      setSearchInput(q);
      setSearch(q);
    }
    if (source) setSourceFilter(source);
    if (title) setTitleType(title);
    if (laneParam) setLane(laneParam);
    if (stateParam) setState(stateParam.toUpperCase());
    if (makeParam) setMake(makeParam);
    if (modelParam) setModel(modelParam);
    if (sortParam) setSort(sortParam);
  }, [urlParams]);

  // How many advanced filters are active (shown on the "More filters" button).
  const advancedCount = useMemo(() => {
    let c = 0;
    if (sourceFilter !== "all") c++;
    if (minPrice !== "any") c++;
    if (minProfit !== "any") c++;
    if (minYear !== "any") c++;
    if (maxYear !== "any") c++;
    if (maxMileage !== "any") c++;
    if (titleType !== "all") c++;
    if (availability !== "all") c++;
    if (madeInUsa) c++;
    if (drivetrain !== "all") c++;
    return c;
  }, [
    sourceFilter,
    minPrice,
    minProfit,
    minYear,
    maxYear,
    maxMileage,
    titleType,
    availability,
    madeInUsa,
    drivetrain,
  ]);

  const resetFilters = useCallback(() => {
    setSourceFilter("all");
    setMinPrice("any");
    setMinProfit("any");
    setMinYear("any");
    setMaxYear("any");
    setMaxMileage("any");
    setTitleType("all");
    setLane("all");
    setAvailability("all");
    setMadeInUsa(false);
    setDrivetrain("all");
  }, []);

  const searchSummary = useMemo(() => {
    const laneLabel: Record<string, string> = {
      all: "all buying lanes",
      auction: "auction / wholesale",
      damaged: "salvage & repairable",
      "clean-retail": "clean retail",
      private: "private marketplace",
    };
    const parts = [
      search || "all vehicles",
      laneLabel[lane] || lane,
      state !== "all" ? state : "nationwide",
      titleType !== "all" ? `${titleType} title` : null,
      make !== "all" ? make : null,
      model !== "all" ? model : null,
      maxPrice !== "any" ? `under $${maxPrice.replace("k", ",000")}` : null,
    ].filter(Boolean);
    return `Searching ${parts.join(" · ")} · sorted by ${sort}`;
  }, [search, lane, state, titleType, make, model, maxPrice, sort]);

  const smartPlan = useMemo(
    () =>
      planScrapeForBuyerScope({
        q: search,
        vehicleType:
          make !== "all"
            ? [make, model !== "all" ? model : ""].join(" ").trim()
            : undefined,
        lane,
        state: state !== "all" ? state : undefined,
        make: make !== "all" ? make : undefined,
        model: model !== "all" ? model : undefined,
        titleType: titleType !== "all" ? titleType : undefined,
        maxPrice:
          maxPrice !== "any" ? Number(maxPrice.replace("k", "000")) : undefined,
        minYear: minYear !== "any" ? Number(minYear) : undefined,
        maxMileage:
          maxMileage !== "any"
            ? Number(maxMileage.replace("k", "000"))
            : undefined,
      }),
    [
      search,
      lane,
      state,
      make,
      model,
      titleType,
      maxPrice,
      minYear,
      maxMileage,
    ],
  );

  const previewSourcePlan = useCallback(async () => {
    setPlanPreviewing(true);
    setPlanMessage(null);
    try {
      const q =
        search ||
        [make !== "all" ? make : "", model !== "all" ? model : ""]
          .filter(Boolean)
          .join(" ")
          .trim() ||
        "all vehicles";
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q,
          scope: smartPlan.scope,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Could not preview source plan.");
      setPlanMessage(data?.message || "Smart source plan is ready.");
    } catch (error) {
      setPlanMessage(
        error instanceof Error
          ? error.message
          : "Could not preview source plan.",
      );
    } finally {
      setPlanPreviewing(false);
    }
  }, [search, make, model, smartPlan.scope]);

  const fetchLivePreview = useCallback(async () => {
    setLivePreviewing(true);
    setPlanMessage(null);
    try {
      const params = new URLSearchParams();
      if (smartPlan.scope.q) params.set("q", smartPlan.scope.q);
      if (smartPlan.scope.lane)
        params.set("lane", String(smartPlan.scope.lane));
      if (smartPlan.scope.state) params.set("state", smartPlan.scope.state);
      const res = await fetch(`/api/scan/live-preview?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error || "Could not fetch live preview.");
      setLivePreviewRows(data.vehicles || []);
      setLivePreviewProof(data.proof || []);
      setPlanMessage(data.message || "Live public preview loaded.");
    } catch (error) {
      setPlanMessage(
        error instanceof Error
          ? error.message
          : "Could not fetch live preview.",
      );
    } finally {
      setLivePreviewing(false);
    }
  }, [smartPlan.scope]);

  // Dynamic facets — only offer makes that have live inventory (in the selected state).
  const { data: facets } = useSWR(
    `/api/scan/facets${state !== "all" ? `?state=${state}` : ""}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const makeOptions = useMemo(() => {
    const opts = [{ value: "all", label: "Make: All" }];
    for (const m of facets?.makes ?? [])
      opts.push({ value: m.make, label: `${m.make} (${m.count})` });
    return opts;
  }, [facets]);

  // CASCADE: once a make is chosen, load its full model list (Copart-style make → model).
  const { data: modelFacets } = useSWR(
    make !== "all"
      ? `/api/scan/facets?make=${encodeURIComponent(make)}${state !== "all" ? `&state=${state}` : ""}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const modelOptions = useMemo(() => {
    const opts = [{ value: "all", label: "Model: All" }];
    for (const m of modelFacets?.models ?? [])
      opts.push({ value: m.model, label: `${m.model} (${m.count})` });
    return opts;
  }, [modelFacets]);
  // Reset the model whenever the make changes so a stale model can't linger.
  useEffect(() => {
    setModel("all");
  }, [make]);

  // Build SWR key from filters
  const swrKey = useMemo(() => {
    if (dealerLoading || !dealerId) return null;
    const params = new URLSearchParams({ sort });
    if (search) params.set("q", search);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (titleType !== "all") params.set("titleType", titleType);
    if (lane !== "all") params.set("lane", lane);
    if (state !== "all") params.set("state", state);
    if (make !== "all") params.set("make", make);
    if (model !== "all") params.set("model", model);
    if (minProfit !== "any")
      params.set("minProfit", minProfit.replace("k", "000"));
    if (maxPrice !== "any")
      params.set("maxPrice", maxPrice.replace("k", "000"));
    if (minPrice !== "any")
      params.set("minPrice", minPrice.replace("k", "000"));
    if (minYear !== "any") params.set("minYear", minYear);
    if (maxYear !== "any") params.set("maxYear", maxYear);
    if (maxMileage !== "any")
      params.set("maxMileage", maxMileage.replace("k", "000"));
    if (availability !== "all") params.set("availability", availability);
    if (verdict !== "all") params.set("verdict", verdict);
    if (madeInUsa) params.set("madeInUsa", "1");
    if (drivetrain !== "all") params.set("drivetrain", drivetrain);
    return `/api/scan?${params.toString()}`;
  }, [
    dealerId,
    dealerLoading,
    search,
    sourceFilter,
    titleType,
    lane,
    state,
    make,
    model,
    minProfit,
    maxPrice,
    minPrice,
    minYear,
    maxYear,
    maxMileage,
    availability,
    verdict,
    madeInUsa,
    drivetrain,
    sort,
  ]);

  // Use SWR for data fetching
  const {
    data: swrData,
    error: swrError,
    isLoading: swrLoading,
    mutate,
  } = useSWR(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
    // Keep the current results on screen while a new filter/search refetches, instead of flashing the
    // whole list to skeletons on every change — makes filtering feel instant/seamless. (isLoading then
    // only fires on the very first load, so the skeleton block below shows once, not on every filter.)
    keepPreviousData: true,
    onSuccess: (data) => {
      // Cache for offline fallback
      if (swrKey) {
        try {
          localStorage.setItem(
            `dhp-scan-${swrKey}`,
            JSON.stringify({
              results: data.vehicles || [],
              total: data.total || 0,
              ts: Date.now(),
            }),
          );
        } catch {}
      }
    },
    onError: () => {
      // Try offline cache on error
      if (swrKey) {
        try {
          const cached = localStorage.getItem(`dhp-scan-${swrKey}`);
          if (cached) {
            const { results: r, total: t } = JSON.parse(cached);
            mutate({ vehicles: r, total: t }, false);
            addToast("Running offline — showing cached results", "info");
          }
        } catch {}
      }
    },
  });

  const { data: systemStatus } = useSWR("/api/system/status", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  const runMatchingSources = useCallback(async () => {
    setRunImporting(true);
    setPlanMessage(null);
    setImportRunProof([]);
    try {
      const res = await fetch("/api/scrape/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: smartPlan.scope,
          concurrency: Math.min(2, Math.max(1, smartPlan.sourceIds.length)),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error(
            "Only an admin session or scrape secret can run imports.",
          );
        }
        if (res.status === 503) {
          throw new Error(data?.error || "Scraper control is not configured.");
        }
        throw new Error(data?.error || "Could not run matching sources.");
      }
      const runResults = Array.isArray(data.results) ? data.results : [];
      setImportRunProof(
        runResults.map((item: any) => ({
          source: String(item.source || "unknown"),
          success: Boolean(item.success),
          dealsFound: Number(item.dealsFound || 0),
          duration: Number(item.duration || 0),
          error: item.error ? String(item.error) : undefined,
        })),
      );
      setPlanMessage(
        `Import finished: ${data.successful || 0}/${data.total || 0} sources succeeded, ${data.totalDeals || 0} rows found.`,
      );
      mutate();
    } catch (error) {
      setPlanMessage(
        error instanceof Error
          ? error.message
          : "Could not run matching sources.",
      );
    } finally {
      setRunImporting(false);
    }
  }, [smartPlan.scope, smartPlan.sourceIds.length, mutate]);

  // Client-driven infinite scroll: SWR fetches page 0; "load more" APPENDS further pages so the grid
  // surfaces ALL matching inventory, not just the first screen. `extra` resets when the filter key changes.
  const [extra, setExtra] = useState<any[]>([]);
  const [morePage, setMorePage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const autoPreviewKeyRef = useRef<string | null>(null);
  useEffect(() => {
    setExtra([]);
    setMorePage(0);
    setLivePreviewRows([]);
    setLivePreviewProof([]);
    setImportRunProof([]);
    autoPreviewKeyRef.current = null;
  }, [swrKey]);

  // Derive state from SWR + the appended pages.
  const results = useMemo(
    () =>
      [...(swrData?.vehicles || []), ...livePreviewRows, ...extra].map(
        mapDealToResult,
      ),
    [swrData, livePreviewRows, extra],
  );
  const total = (swrData?.total || 0) + livePreviewRows.length;
  const loading = dealerLoading || swrLoading;
  const scanConfigured =
    swrData?.configured === false ? false : isSupabaseConfigured();

  useEffect(() => {
    if (
      scanConfigured ||
      swrLoading ||
      livePreviewing ||
      livePreviewRows.length
    )
      return;
    if (!smartPlan.sourceIds.includes("copart")) return;
    const key = JSON.stringify(smartPlan.scope);
    if (autoPreviewKeyRef.current === key) return;
    autoPreviewKeyRef.current = key;
    fetchLivePreview();
  }, [
    scanConfigured,
    swrLoading,
    livePreviewing,
    livePreviewRows.length,
    smartPlan.sourceIds,
    smartPlan.scope,
    fetchLivePreview,
  ]);
  const hasMore = !loading && !!swrKey && results.length < total;
  const loadMore = useCallback(async () => {
    if (!swrKey || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = morePage + 1;
      const res = await fetch(`${swrKey}&page=${next}`).then((r) => r.json());
      const v = res?.vehicles || [];
      if (v.length) {
        setExtra((prev) => [...prev, ...v]);
        setMorePage(next);
      }
    } catch {
      /* transient — the sentinel will retry on next scroll */
    } finally {
      setLoadingMore(false);
    }
  }, [swrKey, loadingMore, hasMore, morePage]);

  // Auto-load the next page when the sentinel scrolls into view (top-app infinite scroll).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);
  const error =
    !dealerId && !dealerLoading
      ? "Please sign in to view scan results."
      : swrError?.message || swrData?.error || null;
  const [lastScan, setLastScan] = useState<Date | null>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastItem["type"] = "success") => {
      const id = ++_toastId;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        4000,
      );
    },
    [],
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Debounce search input → set search state after 300ms idle
  const handleSearchInput = useCallback((val: string) => {
    setSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setSearch(val), 300);
  }, []);

  // Update last scan time when data changes
  useEffect(() => {
    if (swrData && !swrLoading) {
      setLastScan(new Date());
    }
  }, [swrData, swrLoading]);

  // Realtime subscription
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClientComponentClient();
    const channel = supabase
      .channel("scan-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "deals" },
        (payload) => {
          const d = payload.new;
          if (state !== "all" && d.location_state !== state) return;
          if (sourceFilter !== "all" && d.source !== sourceFilter) return;

          // Build a row in the SAME (camelCase, Deal-like) shape the rest of the
          // `vehicles` array holds — i.e. the shape `normalizeRow()` produces on the
          // server — so that `mapDealToResult` reads it correctly. Pushing the raw
          // snake_case `payload.new` here would surface as a $0 / score-50 card.
          const newVehicle = {
            id: d.id,
            source: d.source || "unknown",
            year: d.year ?? undefined,
            make: d.make || "",
            model: d.model || "",
            askPrice: Number(d.ask_price ?? 0),
            mmrValue: Number(d.mmr_value ?? 0),
            profitEstimate: Number(d.profit_estimate ?? 0),
            profitScore:
              d.profit_score != null ? Number(d.profit_score) : undefined,
            locationCity: d.location_city || undefined,
            locationState: d.location_state || undefined,
            mileage: d.mileage ?? undefined,
            condition: d.condition || "",
            damageType: d.damage_type || undefined,
            dealVerdict: d.deal_verdict || undefined,
            recommendedMaxBid:
              d.recommended_max_bid != null
                ? Number(d.recommended_max_bid)
                : undefined,
            sellEstimate:
              d.sell_estimate != null ? Number(d.sell_estimate) : undefined,
            true_net_profit:
              d.true_net_profit != null ? Number(d.true_net_profit) : undefined,
            repair_estimate:
              d.repair_estimate != null ? Number(d.repair_estimate) : undefined,
            auctionEndAt: d.auction_end ? new Date(d.auction_end) : undefined,
          };

          // Optimistically add to SWR cache (same shape as other `vehicles` entries)
          mutate((current: any) => {
            const vehicles = current?.vehicles || [];
            if (vehicles.some((x: any) => x.id === d.id)) return current;
            return {
              vehicles: [newVehicle, ...vehicles],
              total: (current?.total || 0) + 1,
            };
          }, false);
          addToast(
            `+1 new deal found · ${newVehicle.year ?? ""} ${newVehicle.make} ${newVehicle.model}`,
            "success",
          );
        },
      )
      // Re-score / price-drop updates: merge the changed fields into the row already on screen,
      // so a verdict flip or a price drop shows without a refetch.
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "deals" },
        (payload) => {
          const d = payload.new;
          mutate((current: any) => {
            const vehicles = current?.vehicles || [];
            const idx = vehicles.findIndex((x: any) => x.id === d.id);
            if (idx === -1) return current;
            const updated = [...vehicles];
            updated[idx] = {
              ...updated[idx],
              askPrice: Number(d.ask_price ?? updated[idx].askPrice),
              profitScore:
                d.profit_score != null
                  ? Number(d.profit_score)
                  : updated[idx].profitScore,
              dealVerdict: d.deal_verdict ?? updated[idx].dealVerdict,
              recommendedMaxBid:
                d.recommended_max_bid != null
                  ? Number(d.recommended_max_bid)
                  : updated[idx].recommendedMaxBid,
              sellEstimate:
                d.sell_estimate != null
                  ? Number(d.sell_estimate)
                  : updated[idx].sellEstimate,
              true_net_profit:
                d.true_net_profit != null
                  ? Number(d.true_net_profit)
                  : updated[idx].true_net_profit,
            };
            return { ...current, vehicles: updated };
          }, false);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state, sourceFilter, sort, addToast, mutate]);

  // Client-side filtering + sorting with useMemo (instant, no re-fetch).
  // The API ignores `sort`, so the sort control is honored here.
  const filteredResults = useMemo(() => {
    let list = results;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r: ScanResult) =>
        `${r.year} ${r.make} ${r.model} ${r.locationCity ?? ""} ${r.locationState ?? ""}`
          .toLowerCase()
          .includes(q),
      );
    }
    if (category !== "all") {
      list = list.filter((r: ScanResult) =>
        carCategories(r as CarLike).includes(category),
      );
    }
    const sorted = [...list];
    if (sort === "score") {
      sorted.sort((a, b) => (b.profitScore ?? 0) - (a.profitScore ?? 0));
    } else if (sort === "price") {
      sorted.sort((a, b) => (a.askPrice ?? 0) - (b.askPrice ?? 0));
    } else {
      // default: profit (descending)
      sorted.sort((a, b) => (b.profitEstimate ?? 0) - (a.profitEstimate ?? 0));
    }
    return sorted;
  }, [results, search, sort, category]);

  // Category chip counts (from the fetched result set) — only non-empty chips render.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of results)
      for (const k of carCategories(r as CarLike))
        counts[k] = (counts[k] || 0) + 1;
    return counts;
  }, [results]);

  // Source options for filter
  const sourceOptions = useMemo(() => {
    const opts = [{ value: "all", label: "Source: All" }];
    ALL_VEHICLE_SOURCES.slice(0, 20).forEach((s) =>
      opts.push({ value: s.id, label: s.name }),
    );
    return opts;
  }, []);

  const stateOptions = useMemo(() => {
    const opts = [{ value: "all", label: "State: All" }];
    US_STATES.forEach((s) => opts.push({ value: s, label: s }));
    return opts;
  }, []);

  return (
    <div
      className="max-w-7xl mx-auto px-4 space-y-5 pb-24"
      style={{ animation: "fadeUp 200ms cubic-bezier(.16,1,.3,1)" }}
    >
      {/* ── Search bar ── */}
      <div className="glass-panel p-4 flex flex-col sm:flex-row gap-3 items-center sticky top-4 z-20">
        <div className="relative flex-1 w-full">
          <Ico
            name="search"
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--t4)] pointer-events-none"
          />
          <input
            type="text"
            className="w-full rounded-[var(--r3)] py-3.5 pl-11 pr-5 text-[var(--t1)] text-base outline-none transition-all"
            style={{
              background: "var(--s1)",
              border: "1.5px solid var(--b1)",
            }}
            placeholder='Try "F-150 under 25k in Texas" or "clean Accords" — press Enter'
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchInput.trim())
                commitSearch(searchInput);
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--amber)";
              setSearchFocused(true);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--b1)";
              // Delay so a recent-chip mousedown registers before the row hides.
              setTimeout(() => setSearchFocused(false), 120);
            }}
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
              aria-label="Clear search"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Recent searches — Visor-style chips under the bar, shown when empty + focused */}
          {searchFocused && !searchInput && recents.length > 0 && (
            <div
              className="absolute left-0 right-0 top-full mt-2 z-30 glass-panel p-2"
              style={{ boxShadow: "var(--shadow)" }}
            >
              <div className="flex items-center justify-between px-2 pb-1.5">
                <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--t4)]">
                  Recent
                </span>
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    clearRecents();
                  }}
                  className="text-[10px] text-[var(--t4)] hover:text-[var(--red)]"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recents.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1.5 text-xs font-medium"
                    style={{ background: "var(--s2)", color: "var(--t2)" }}
                  >
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        commitSearch(r);
                      }}
                      className="hover:text-[var(--amber)] transition-colors"
                    >
                      {r}
                    </button>
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        removeRecent(r);
                      }}
                      aria-label={`Remove ${r}`}
                      className="text-[var(--t4)] hover:text-[var(--red)] transition-colors"
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                      >
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => {
            if (searchInput.trim()) commitSearch(searchInput);
            mutate();
          }}
          disabled={loading}
          className="w-full sm:w-auto flex items-center justify-center gap-2 font-bold text-white rounded-xl py-3.5 px-7 transition-all disabled:opacity-50 border-none"
          style={{ background: "var(--grad)" }}
        >
          {loading ? (
            <>
              <span
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                style={{ animation: "spin 700ms linear infinite" }}
              />
              Scanning…
            </>
          ) : (
            <>
              <Ico name="scan" size={16} />
              Scan Market
            </>
          )}
        </button>
        <button
          onClick={() => setIsLaneModeOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 font-bold rounded-xl py-3.5 px-6 transition-all border hover:-translate-y-0.5"
          style={{
            background: "var(--s0)",
            color: "var(--t2)",
            borderColor: "var(--b2)",
            boxShadow: "var(--shadow2)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M4 7V4h16v3M9 20h6M12 4v16" />
          </svg>
          Lane Mode
        </button>
      </div>

      {/* ── Status strip ── */}
      <StatusStrip
        loading={loading}
        error={error}
        total={total}
        results={results}
        lastScan={lastScan}
      />

      <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] px-4 py-2.5 text-xs font-semibold text-[var(--t3)]">
        {searchSummary}
      </div>

      <SmartDataPlanCard
        configured={scanConfigured}
        total={total}
        plan={smartPlan}
        onPreview={previewSourcePlan}
        onRun={runMatchingSources}
        onLivePreview={fetchLivePreview}
        previewing={planPreviewing}
        running={runImporting}
        livePreviewing={livePreviewing}
        showingPreview={!scanConfigured && livePreviewRows.length > 0}
        proof={livePreviewProof}
        importRun={importRunProof}
        readinessItems={systemStatus?.readiness?.items || []}
        message={planMessage}
      />

      {/* ── Filter bar: primary row + grouped advanced panel ── */}
      <div className="glass-panel px-4 py-3 space-y-3">
        {/* PRIMARY: the dealer's most-used controls, always visible */}
        <div className="flex flex-wrap items-center gap-2">
          {/* GO-only — the #1 filter */}
          <button
            type="button"
            onClick={() => setVerdict((v) => (v === "go" ? "all" : "go"))}
            className="px-3 py-1.5 rounded-[var(--r2)] text-xs font-bold border transition-colors shrink-0"
            style={{
              background: verdict === "go" ? "var(--glo)" : "var(--s0)",
              color: verdict === "go" ? "var(--green)" : "var(--t3)",
              borderColor: verdict === "go" ? "var(--gbd)" : "var(--b2)",
            }}
            title="Only show deals the engine rates BUY"
          >
            ✓ BUY only
          </button>
          <FilterSelect
            label="Make"
            value={make}
            onChange={setMake}
            options={makeOptions}
          />
          {/* Model cascades off the chosen make (Copart-style) — appears once a make is picked. */}
          {make !== "all" && (
            <FilterSelect
              label="Model"
              value={model}
              onChange={setModel}
              options={modelOptions}
            />
          )}
          <FilterSelect
            label="State"
            value={state}
            onChange={setState}
            options={stateOptions}
          />
          <FilterSelect
            label="Max Price"
            value={maxPrice}
            onChange={setMaxPrice}
            options={[
              { value: "any", label: "Price: Any" },
              { value: "5k", label: "Under $5,000" },
              { value: "10k", label: "Under $10,000" },
              { value: "20k", label: "Under $20,000" },
              { value: "35k", label: "Under $35,000" },
              { value: "50k", label: "Under $50,000" },
            ]}
          />
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: "profit", label: "Sort: Profit ↓" },
              { value: "score", label: "Sort: Score ↓" },
              { value: "price", label: "Sort: Price ↑" },
            ]}
          />
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r2)] text-xs font-bold border transition-colors shrink-0"
            style={{
              background: advancedCount > 0 ? "var(--amber-lo)" : "var(--s0)",
              color: advancedCount > 0 ? "var(--amber-d)" : "var(--t3)",
              borderColor: advancedCount > 0 ? "var(--amber-bd)" : "var(--b2)",
            }}
          >
            <Ico name="filter" size={12} />
            More filters{advancedCount > 0 ? ` (${advancedCount})` : ""}
            <span className="text-[10px]">{showMore ? "▲" : "▼"}</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSimulatorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r2)] text-xs font-bold border transition-all shrink-0 shadow-sm hover:-translate-y-0.5"
            style={{
              background: "var(--s0)",
              color: "var(--t2)",
              borderColor: "var(--b2)",
            }}
          >
            Profit Simulator
          </button>

          {/* Results count + density */}
          {!loading && (
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span className="text-xs text-[var(--t3)] font-mono">
                {filteredResults.length} result
                {filteredResults.length !== 1 ? "s" : ""}
              </span>
              <div
                className="flex items-center gap-0.5 p-0.5 rounded-[var(--r2)]"
                style={{ background: "var(--s2)" }}
                title="View"
              >
                {(
                  [
                    { key: "comfortable", Icon: LayoutGrid, mode: "grid" },
                    { key: "compact", Icon: Rows3, mode: "grid" },
                    { key: "table", Icon: Table2, mode: "table" },
                  ] as const
                ).map((opt) => {
                  const active =
                    opt.mode === "table"
                      ? view === "table"
                      : view === "grid" && density === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => {
                        if (opt.mode === "table") changeView("table");
                        else {
                          changeView("grid");
                          changeDensity(opt.key as "comfortable" | "compact");
                        }
                      }}
                      aria-label={`${opt.key} view`}
                      className="flex items-center justify-center h-6 w-6 rounded-[var(--r1)] transition-colors"
                      style={{
                        background: active ? "var(--s0)" : "transparent",
                        color: active ? "var(--t1)" : "var(--t4)",
                        boxShadow: active ? "var(--shadow2)" : "none",
                      }}
                    >
                      <opt.Icon size={13} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Browsable category chips — one-tap money-relevant slices (only non-empty render). */}
        {CAR_CATEGORIES.some((c) => categoryCounts[c.key]) && (
          <div className="flex items-center gap-2 overflow-x-auto pt-2 -mx-1 px-1">
            <button
              onClick={() => setCategory("all")}
              className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
              style={{
                background: category === "all" ? "var(--t1)" : "var(--s0)",
                color: category === "all" ? "var(--s0)" : "var(--t3)",
                borderColor: category === "all" ? "var(--t1)" : "var(--b2)",
              }}
            >
              All
            </button>
            {CAR_CATEGORIES.filter((c) => categoryCounts[c.key]).map((c) => {
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(active ? "all" : c.key)}
                  className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors"
                  style={{
                    background: active ? "var(--amber-lo)" : "var(--s0)",
                    color: active ? "var(--amber-d)" : "var(--t3)",
                    borderColor: active ? "var(--amber-bd)" : "var(--b2)",
                  }}
                >
                  {c.label} {categoryCounts[c.key]}
                </button>
              );
            })}
          </div>
        )}

        {/* ADVANCED: grouped by what / where / kind / from — intuitive */}
        {showMore && (
          <div className="pt-3 border-t border-[var(--b1)] flex flex-wrap items-center gap-x-2 gap-y-2.5">
            <FilterGroup label="From">
              <FilterSelect
                label="Source"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={sourceOptions}
              />
            </FilterGroup>

            <FilterGroup label="Price & profit">
              <FilterSelect
                label="Min Price"
                value={minPrice}
                onChange={setMinPrice}
                options={[
                  { value: "any", label: "Min: Any" },
                  { value: "2k", label: "Over $2,000" },
                  { value: "5k", label: "Over $5,000" },
                  { value: "10k", label: "Over $10,000" },
                  { value: "20k", label: "Over $20,000" },
                ]}
              />
              <FilterSelect
                label="Min Profit"
                value={minProfit}
                onChange={setMinProfit}
                options={[
                  { value: "any", label: "Profit: Any" },
                  { value: "1k", label: "Min $1,000" },
                  { value: "2k", label: "Min $2,000" },
                  { value: "3k", label: "Min $3,000" },
                  { value: "5k", label: "Min $5,000" },
                ]}
              />
            </FilterGroup>

            <FilterGroup label="Year">
              <FilterSelect
                label="From"
                value={minYear}
                onChange={setMinYear}
                options={[
                  { value: "any", label: "From: Any" },
                  { value: "2000", label: "2000 +" },
                  { value: "2010", label: "2010 +" },
                  { value: "2015", label: "2015 +" },
                  { value: "2018", label: "2018 +" },
                  { value: "2021", label: "2021 +" },
                ]}
              />
              <FilterSelect
                label="To"
                value={maxYear}
                onChange={setMaxYear}
                options={[
                  { value: "any", label: "To: Any" },
                  { value: "2024", label: "to 2024" },
                  { value: "2020", label: "to 2020" },
                  { value: "2015", label: "to 2015" },
                  { value: "2010", label: "to 2010" },
                ]}
              />
            </FilterGroup>

            <FilterGroup label="Condition">
              <FilterSelect
                label="Max Miles"
                value={maxMileage}
                onChange={setMaxMileage}
                options={[
                  { value: "any", label: "Miles: Any" },
                  { value: "50k", label: "Under 50k" },
                  { value: "100k", label: "Under 100k" },
                  { value: "150k", label: "Under 150k" },
                ]}
              />
              <FilterSelect
                label="Title Type"
                value={titleType}
                onChange={setTitleType}
                options={[
                  { value: "all", label: "Title: All" },
                  { value: "clean", label: "Clean Title" },
                  { value: "salvage", label: "Salvage Title" },
                  { value: "rebuilt", label: "Rebuilt Title" },
                ]}
              />
              <FilterSelect
                label="Availability"
                value={availability}
                onChange={setAvailability}
                options={[
                  { value: "all", label: "Availability: All" },
                  { value: "on_lot", label: "On lot" },
                  { value: "in_transit", label: "In transit" },
                  { value: "online_only", label: "Online only" },
                ]}
              />
              <FilterSelect
                label="Drivetrain"
                value={drivetrain}
                onChange={setDrivetrain}
                options={[
                  { value: "all", label: "Drivetrain: All" },
                  { value: "AWD", label: "AWD" },
                  { value: "4WD", label: "4WD" },
                  { value: "FWD", label: "FWD" },
                  { value: "RWD", label: "RWD" },
                ]}
              />
              <button
                type="button"
                onClick={() => setMadeInUsa((v) => !v)}
                className="px-3 py-1.5 rounded-[var(--r2)] text-xs font-bold border transition-colors shrink-0"
                style={{
                  background: madeInUsa ? "var(--amber-lo)" : "var(--s0)",
                  color: madeInUsa ? "var(--amber-d)" : "var(--t3)",
                  borderColor: madeInUsa ? "var(--amber-bd)" : "var(--b2)",
                }}
                title="Filter to vehicles assembled in the USA (VIN-decoded)"
              >
                🇺🇸 USA
              </button>
            </FilterGroup>

            {advancedCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto text-xs font-semibold text-[var(--t4)] hover:text-[var(--red)] transition-colors shrink-0"
              >
                Reset all
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Acquisition lane segments — browse the way a flipper sorts inventory ── */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { v: "all", l: "All deals", c: "var(--t3)" },
          { v: "auction", l: "Auction lots", c: "#f59e0b" },
          { v: "damaged", l: "Salvage & Repairable", c: "#ef4444" },
          { v: "clean-retail", l: "Clean retail", c: "#22c55e" },
          { v: "private", l: "Private", c: "#3b82f6" },
        ].map((seg) => {
          const on = lane === seg.v;
          return (
            <button
              key={seg.v}
              type="button"
              onClick={() => setLane(seg.v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors"
              style={
                on
                  ? { background: seg.c, color: "#fff" }
                  : { background: "var(--s1)", color: "var(--t3)" }
              }
            >
              {seg.v !== "all" && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: on ? "#fff" : seg.c }}
                />
              )}
              {seg.l}
            </button>
          );
        })}
      </div>

      {/* ── Results grid ── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <DealCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && error && (
        <ErrorState message={error} onRetry={() => mutate()} />
      )}

      {!loading && !error && filteredResults.length === 0 && (
        <EmptyState onRetry={() => mutate()} />
      )}

      {!loading && !error && filteredResults.length > 0 && view === "table" && (
        <DealTable rows={filteredResults as any} />
      )}

      {!loading && !error && filteredResults.length > 0 && view === "grid" && (
        <motion.div
          className={gridClass}
          variants={{
            hidden: {},
            show: {
              transition: { staggerChildren: 0.06, delayChildren: 0.05 },
            },
          }}
          initial="hidden"
          animate="show"
        >
          {filteredResults.map((car: ScanResult) => (
            <motion.div
              key={car.id}
              variants={{
                hidden: { opacity: 0, y: 20, scale: 0.97 },
                show: {
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  transition: {
                    type: "spring" as const,
                    stiffness: 120,
                    damping: 18,
                  },
                },
              }}
            >
              <DealCard
                id={car.id}
                source={car.source}
                year={car.year}
                make={car.make}
                model={car.model}
                trim={car.trim}
                bodyClass={car.bodyClass}
                recallsCount={car.recallsCount}
                askPrice={car.askPrice}
                mmrValue={car.mmrValue}
                profitEstimate={car.profitEstimate}
                profitScore={car.profitScore}
                locationCity={car.locationCity}
                locationState={car.locationState}
                mileage={car.mileage}
                condition={car.condition}
                damageType={car.damageType}
                dealVerdict={car.dealVerdict}
                recommendedMaxBid={car.recommendedMaxBid}
                sellEstimate={car.sellEstimate}
                priceDropAmount={car.priceDropAmount}
                priceDropDays={car.priceDropDays}
                auctionEndAt={car.auctionEndAt}
                bidCount={car.bidCount}
                firstSeenAt={car.firstSeenAt}
                lastSeenAt={car.lastSeenAt}
                imageUrl={car.imageUrl}
                vin={car.vin}
                sourceUrl={car.sourceUrl}
                seller={car.seller}
                sellerType={car.sellerType}
                dataQuality={car.dataQuality}
                onClick={() => {
                  if (car.id.startsWith("live-") && car.sourceUrl) {
                    window.open(car.sourceUrl, "_blank", "noopener,noreferrer");
                    return;
                  }
                  transitionTo(`/deal/${car.id}`);
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Infinite scroll — auto-append more inventory as you near the bottom (grid + table views). */}
      {!loading && !error && hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-5 py-2.5 rounded-full text-sm font-bold border border-[var(--b2)] text-[var(--t2)] hover:border-[var(--b3)] transition-colors disabled:opacity-50"
          >
            {loadingMore
              ? "Loading…"
              : `Load more — ${(total - results.length).toLocaleString()} more`}
          </button>
        </div>
      )}

      {/* Toasts */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <LaneModeHUD
        isOpen={isLaneModeOpen}
        onClose={() => setIsLaneModeOpen(false)}
      />

      <ProfitSimulatorDrawer
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
      />
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="glass-panel p-6 text-sm text-[var(--t3)]">
          Loading scanner…
        </div>
      }
    >
      <ScanPageInner />
    </Suspense>
  );
}
