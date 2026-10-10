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
import dynamic from "next/dynamic";
import { useViewTransition } from "@/hooks/useViewTransition";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Ico } from "@/components/shared/Ico";
import { useRecentSearches } from "@/components/shared/useRecentSearches";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { wantsAuctionInventory } from "@/lib/discovery/auction-scope";
import { isAuctionChannel } from "@/lib/sources/source-meta";
import { MikeHuntLoader } from "@/components/brand/MikeHuntLoader";
import { pollScopedScrapeJob } from "@/lib/scrapers/job-status-client";
import { createLatestRequest } from "@/lib/latest-request";
import {
  previewFilterMessage,
  unsupportedPreviewFilters,
} from "@/lib/search/preview-filter-support";

import {
  ArrowUpRight,
  Camera,
  LayoutGrid,
  Rows3,
  ShieldCheck,
  Sparkles,
  Table2,
  TrendingUp,
  X,
  Copy,
} from "lucide-react";
import { DealTable } from "@/components/scan/DealTable";
import { DealCard, DealCardSkeleton } from "@/components/shared/DealCard";
import { LaneModeHUD } from "@/components/scan/LaneModeHUD";
import { isValidVin } from "@/lib/vehicle/vin";
import { ErrorState as SharedErrorState } from "@/components/shared/ErrorState";
import { ALL_VEHICLE_SOURCES } from "@/lib/utils/sources";
import {
  dealerSourceIdFromUrl,
  displaySource,
  sourceMeta,
  tint,
} from "@/lib/sources/source-meta";
import { cn } from "@/lib/utils";
import { Deal } from "@/lib/data/deals-service";
import { US_STATES } from "@/lib/utils/titleRules";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { fetcher } from "@/lib/swr-config";
import {
  CAR_CATEGORIES,
  carCategories,
  type CarLike,
} from "@/lib/scoring/deal-categories";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { fieldLabel, gradeDataQuality } from "@/lib/data-quality";
import { useLocalSavedVehicles } from "@/hooks/useLocalSavedVehicles";
import { saveLocalSavedSearch } from "@/hooks/useLocalSavedSearches";
import { matchesVehicleQuery } from "@/lib/search/vehicle-query";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { buildBuyerIntentQuery, useBuyerIntent } from "@/hooks/useBuyerIntent";
import { defaultScanSort } from "@/lib/buyer/scan-sort";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { scanPageHrefFromApiKey } from "@/lib/search/scan-page-href";
import { scanStatusCopy } from "@/lib/ui/load-state-copy";

const ProfitSimulatorDrawer = dynamic(
  () =>
    import("@/components/ui/next-level-features").then(
      (module) => module.ProfitSimulatorDrawer,
    ),
  { ssr: false },
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScanResult {
  id: string;
  source: string;
  title?: string;
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
  titleType?: string;
  dealVerdict?: "go" | "hold" | "pass";
  recommendedMaxBid?: number;
  sellEstimate?: number;
  sellBasis?: "comps" | "market" | "baseline";
  valuation?: {
    basis?: "comps" | "market" | "baseline";
    compCount?: number;
    compConfidence?: "high" | "medium" | "low" | "none";
    soldCount?: number;
    soldAnchored?: boolean;
    titleTag?: string;
    mileageMult?: number;
    titleMult?: number;
  };
  soldAnchored?: boolean;
  repairEstimate: number;
  transportEstimate?: number;
  warnings?: string[];
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
  sellerPhone?: string;
  sellerEmail?: string;
  sellerContactUrl?: string;
  dataQuality?: {
    score: number;
    label: "Excellent" | "Good" | "Thin" | "Sparse";
    missing: string[];
  };
  trustExplanation?: {
    confidence?: "high" | "medium" | "low" | string;
    score?: number;
    reasons?: string[];
    missing?: string[];
    nextChecks?: string[];
    summary?: string;
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
  verifyPath?: string;
  actionLabel?: string;
};

type SourceHealthItem = {
  id: string;
  name: string;
  readiness:
    | "ready"
    | "needs_login"
    | "blocked"
    | "no_rows"
    | "needs_run"
    | "not_configured"
    | "disabled";
  activeRows: number;
  rowsWithPhotos: number;
  averageQuality: number;
  lastSeenAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  nextAction?: string | null;
  userImpact?: string | null;
  proofSummary?: string | null;
  proofBadges?: string[];
  photoCoveragePct?: number;
  qualityLabel?: string | null;
  freshnessHours?: number | null;
  completeness?: {
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

type SourceScopeStatus = {
  status: "ready" | "empty" | "no_match" | "unfiltered" | string;
  label: string;
  message: string;
  nextAction: string;
  scopeLabel?: string;
};

type ScrapePlanSource = {
  id: string;
  name: string;
  readiness: string;
  runnable: boolean;
  action: string;
  estimatedDealsPerRun?: number;
};

type ScrapePlanGate = {
  id: string;
  label: string;
  status: "ready" | "missing" | "partial";
  nextStep: string;
  actionLabel?: string;
};

type ScrapePlanResult = {
  canImport: boolean;
  scraperControlReady: boolean;
  sourceIds?: string[];
  requestedSourceIds?: string[];
  mismatchedSourceIds?: string[];
  dealerSourceIds?: string[];
  gates: ScrapePlanGate[];
  sources: ScrapePlanSource[];
  summary: {
    total: number;
    runnable: number;
    heldBack: number;
    estimatedDealsPerRun: number;
    firstBlocker?: string | null;
  };
  message?: string;
};

function normalizeMaxPriceFilter(value: unknown) {
  if (value == null || value === "" || value === "any") return "any";
  const raw = String(value).trim().toLowerCase();
  if (raw.endsWith("k")) {
    const amount = Number(raw.replace("k", ""));
    return Number.isFinite(amount) ? String(amount * 1000) : "any";
  }
  const digits = raw.replace(/[^0-9]/g, "");
  return digits ? digits : "any";
}

function formatMaxPriceFilter(value: string) {
  const normalized = normalizeMaxPriceFilter(value);
  if (normalized === "any") return null;
  return `$${Number(normalized).toLocaleString()}`;
}

function mapDealToResult(deal: Deal): ScanResult {
  const images = Array.isArray(deal.images) ? deal.images : [];
  const existingQuality = (deal as any).dataQuality;
  const quality =
    existingQuality ||
    gradeDataQuality({
      images,
      imageUrl: images[0],
      vin: deal.vin,
      titleType:
        (deal as any).titleType ||
        (deal as any).title_type ||
        (deal as any).titleStatus ||
        (deal as any).title_status,
      condition: deal.condition,
      damageType: deal.damageType,
      mileage: deal.mileage,
      locationCity: deal.locationCity,
      locationState: deal.locationState,
      askPrice: deal.askPrice,
      seller: deal.seller,
      sellerType: deal.sellerType,
      sellerPhone: deal.contact?.phone,
      sellerEmail: deal.contact?.email,
      sellerContactUrl:
        (deal as any).sellerContactUrl ||
        (deal.contact as any)?.url ||
        deal.contact?.listingUrl,
      auctionEndAt: deal.auctionEndAt,
      sourceUrl: deal.sourceUrl,
    });

  return {
    id: deal.id,
    source: deal.source,
    title: deal.title,
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
    titleType:
      (deal as any).titleType ||
      (deal as any).title_type ||
      (deal as any).titleStatus ||
      (deal as any).title_status,
    dealVerdict: deal.dealVerdict,
    recommendedMaxBid: deal.recommendedMaxBid,
    sellEstimate: deal.sellEstimate,
    sellBasis:
      (deal as any).sellBasis ||
      (deal as any).dealAnalysis?.sellBasis ||
      (deal as any).deal_analysis?.sellBasis ||
      (deal as any).valuation?.basis,
    valuation:
      (deal as any).valuation ||
      (deal as any).dealAnalysis?.valuation ||
      (deal as any).deal_analysis?.valuation,
    soldAnchored:
      (deal as any).soldAnchored ||
      (deal as any).dealAnalysis?.soldAnchored ||
      (deal as any).deal_analysis?.soldAnchored,
    repairEstimate: (deal as any).repair_estimate ?? 0,
    transportEstimate: (deal as any).transport_cost ?? undefined,
    warnings:
      (deal as any).warnings ||
      (deal as any).dealAnalysis?.warnings ||
      (deal as any).deal_analysis?.warnings ||
      [],
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
    sellerPhone: (deal as any).sellerPhone || deal.contact?.phone,
    sellerEmail: (deal as any).sellerEmail || deal.contact?.email,
    sellerContactUrl:
      (deal as any).sellerContactUrl ||
      (deal.contact as any)?.url ||
      deal.contact?.listingUrl,
    dataQuality: {
      score: quality.score,
      label: quality.label,
      missing: quality.missing.map((field: any) =>
        typeof field === "string" && field.includes(" ")
          ? field
          : fieldLabel(field),
      ),
    },
    trustExplanation: (deal as any).trustExplanation,
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
    <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-3 z-40 flex max-w-[calc(100vw-24px)] flex-col gap-2 items-end pointer-events-none md:bottom-6 md:right-4 md:z-50 md:max-w-none">
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
  hasData,
}: {
  loading: boolean;
  error: string | null;
  total: number;
  results: ScanResult[];
  lastScan: Date | null;
  hasData: boolean;
}) {
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach((r) => {
      const source = displaySource(r.source, r.sourceUrl);
      counts[source] = (counts[source] || 0) + 1;
    });
    return counts;
  }, [results]);

  const topSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  // No false "0 · never" before the first response (lib/ui/load-state-copy).
  const copy = scanStatusCopy({
    hasData,
    error,
    total,
    lastLoadedAt: lastScan,
  });
  const busy = loading || (!hasData && !error);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-xs">
      {/* Status dot */}
      <span className="flex items-center gap-1.5 shrink-0">
        <span
          className={cn(
            "w-2 h-2 rounded-full inline-block",
            busy ? "animate-pulse" : "",
          )}
          style={{ background: error ? "var(--red)" : "var(--green)" }}
        />
        <span className="text-[var(--t4)] font-semibold">
          {error
            ? "Couldn't update vehicles"
            : busy
              ? "Updating saved inventory…"
              : "Saved inventory loaded"}
        </span>
      </span>

      <span className="text-[var(--b3)] hidden sm:inline">·</span>

      <span className="text-[var(--t2)] shrink-0">
        {copy.count !== null && (
          <>
            <span style={{ color: "var(--amber)" }}>{copy.count}</span>{" "}
          </>
        )}
        {copy.countLabel}
      </span>

      <span className="text-[var(--b3)] hidden sm:inline">·</span>

      <span className="text-[var(--t4)] shrink-0">
        Last loaded: <span className="text-[var(--t2)]">{copy.lastLoaded}</span>
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
          Loading…
        </span>
      )}
    </div>
  );
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function ScopeQualityPanel({
  results,
  sourceHealthById,
}: {
  results: ScanResult[];
  sourceHealthById: Map<string, SourceHealthItem>;
}) {
  const summary = useMemo(() => {
    const total = results.length;
    const count = (ok: (row: ScanResult) => boolean) =>
      results.reduce((sum, row) => sum + (ok(row) ? 1 : 0), 0);
    const scoreTotal = results.reduce(
      (sum, row) => sum + (Number(row.dataQuality?.score) || 0),
      0,
    );
    const sourceIds = new Set(results.map((row) => row.source).filter(Boolean));
    const scopedSourceIds = Array.from(sourceIds);
    const readySources = scopedSourceIds.filter((id) => {
      const health = sourceHealthById.get(id);
      return health?.readiness === "ready" || health?.readiness === "needs_run";
    }).length;
    const freshestHours = scopedSourceIds.reduce<number | null>((best, id) => {
      const hours = sourceHealthById.get(id)?.freshnessHours;
      if (typeof hours !== "number" || !Number.isFinite(hours)) return best;
      return best == null ? hours : Math.min(best, hours);
    }, null);

    return {
      total,
      avgQuality: total ? Math.round(scoreTotal / total) : 0,
      photoPct: pct(
        count((row) => Boolean(row.imageUrl)),
        total,
      ),
      vinPct: pct(
        count((row) => Boolean(row.vin)),
        total,
      ),
      titlePct: pct(
        count((row) => Boolean(row.titleType || row.condition)),
        total,
      ),
      mileagePct: pct(
        count((row) => Number(row.mileage || 0) > 0),
        total,
      ),
      sellerPct: pct(
        count((row) => Boolean(row.seller || row.sellerType)),
        total,
      ),
      sourceLinkPct: pct(
        count((row) => Boolean(row.sourceUrl)),
        total,
      ),
      damagePct: pct(
        count((row) => Boolean(row.condition || row.damageType)),
        total,
      ),
      pricePct: pct(
        count((row) => Number(row.askPrice || 0) > 0),
        total,
      ),
      sellerContactPct: pct(
        count((row) =>
          Boolean(row.sellerPhone || row.sellerEmail || row.sellerContactUrl),
        ),
        total,
      ),
      auctionDatePct: pct(
        count((row) => Boolean(row.auctionEndAt)),
        total,
      ),
      sourceCount: sourceIds.size,
      readySources,
      freshestHours,
    };
  }, [results, sourceHealthById]);

  if (!summary.total) return null;

  const fields = [
    { label: "Photos", value: summary.photoPct },
    { label: "VIN", value: summary.vinPct },
    { label: "Title/detail", value: summary.titlePct },
    { label: "Condition", value: summary.damagePct },
    { label: "Price", value: summary.pricePct },
    { label: "Mileage", value: summary.mileagePct },
    { label: "Seller", value: summary.sellerPct },
    { label: "Contact", value: summary.sellerContactPct },
    { label: "Auction date", value: summary.auctionDatePct },
    { label: "Source link", value: summary.sourceLinkPct },
  ];
  const weakFields = fields.filter((item) => item.value < 70).slice(0, 3);
  const criticalMissing = [
    summary.vinPct < 70 ? "VIN" : null,
    summary.mileagePct < 70 ? "mileage" : null,
    summary.sellerContactPct < 70 ? "seller contact" : null,
    summary.auctionDatePct < 70 ? "auction timing" : null,
  ].filter(Boolean) as string[];
  const buyerVerdict =
    summary.avgQuality >= 78 &&
    summary.photoPct >= 85 &&
    summary.sourceLinkPct >= 85 &&
    criticalMissing.length === 0
      ? {
          label: "Buyer-ready",
          tone: "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]",
          detail:
            "This scope has enough proof for confident shortlisting. Still inspect individual listings before bidding.",
          action: "Sort by Trust and save the best candidates.",
        }
      : summary.photoPct >= 70 && summary.sourceLinkPct >= 70
        ? {
            label: "Inspect-first",
            tone: "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
            detail:
              "The source is usable, but the buyer should verify weak fields before acting.",
            action: criticalMissing.length
              ? `Verify ${criticalMissing.slice(0, 3).join(", ")} on the original listing.`
              : "Open the original listing and confirm title, fees, transport, and comparable prices.",
          }
        : {
            label: "Thin proof",
            tone: "border-[var(--b2)] bg-[var(--s0)] text-[var(--t4)]",
            detail:
              "This result set is too thin for a serious buyer decision without more proof.",
            action:
              "Try a broader search, review source details, or refresh the matching sources.",
          };
  const freshness =
    summary.freshestHours == null
      ? "freshness pending"
      : summary.freshestHours < 1
        ? "seen this hour"
        : summary.freshestHours < 24
          ? `${summary.freshestHours}h fresh`
          : `${Math.round(summary.freshestHours / 24)}d fresh`;

  return (
    <section className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
            Scope quality
          </div>
          <h2 className="mt-1 text-base font-black text-[var(--t1)]">
            {summary.total.toLocaleString()} rows · {summary.avgQuality}/100
            detail
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--t4)]">
            This grades only the vehicles currently shown. It tells a buyer
            whether the result set has enough proof to trust photos, VIN,
            title/detail, mileage, seller, and original source links.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2">
            <div className="font-black text-[var(--green)]">
              {summary.readySources}/{summary.sourceCount}
            </div>
            <div className="text-[var(--t5)]">sources ready</div>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">
              {summary.photoPct}%
            </div>
            <div className="text-[var(--t5)]">photo proof</div>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">{freshness}</div>
            <div className="text-[var(--t5)]">freshest source</div>
          </div>
        </div>
      </div>
      <div
        className={cn(
          "mt-4 rounded-[var(--r2)] border px-3 py-2.5",
          buyerVerdict.tone,
        )}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em]">
              Buyer data verdict
            </div>
            <p className="mt-1 text-sm font-black">{buyerVerdict.label}</p>
          </div>
          <p className="max-w-2xl text-xs font-semibold leading-relaxed text-[var(--t3)]">
            {buyerVerdict.detail} {buyerVerdict.action}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {fields.map((item) => (
          <div
            key={item.label}
            className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-black text-[var(--t2)]">{item.label}</span>
              <span
                className={cn(
                  "font-black",
                  item.value >= 85
                    ? "text-[var(--green)]"
                    : item.value >= 60
                      ? "text-[var(--amber-d)]"
                      : "text-[var(--red)]",
                )}
              >
                {item.value}%
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--s2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${item.value}%`,
                  background:
                    item.value >= 85
                      ? "var(--green)"
                      : item.value >= 60
                        ? "var(--amber)"
                        : "var(--red)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {weakFields.length > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--t4)]">
          Weakest proof in this scope:{" "}
          <span className="font-bold text-[var(--t2)]">
            {weakFields
              .map((field) => `${field.label} ${field.value}%`)
              .join(", ")}
          </span>
          . Treat those listings as inspect-first until the source provides
          better detail.
        </p>
      )}
    </section>
  );
}

function money(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function ScanReviewStrip({
  results,
  sourceHealthById,
  href,
  flipDesk,
}: {
  results: ScanResult[];
  sourceHealthById: Map<string, SourceHealthItem>;
  href: string;
  /** Reseller/dealer desk. Everyone else gets price-first wording, not profit or max bid. */
  flipDesk: boolean;
}) {
  if (!results.length) return null;

  // Flip desks start with the highest modeled profit; other desks start with the
  // top row of their chosen sort (trust score by default).
  const best = !flipDesk
    ? (results[0] ?? null)
    : results.reduce(
        (winner, row) => {
          if (!winner) return row;
          if ((row.profitScore || 0) !== (winner.profitScore || 0)) {
            return (row.profitScore || 0) > (winner.profitScore || 0)
              ? row
              : winner;
          }
          return (row.profitEstimate || 0) > (winner.profitEstimate || 0)
            ? row
            : winner;
        },
        null as ScanResult | null,
      );
  const avgProfit = Math.round(
    results.reduce((sum, row) => sum + (row.profitEstimate || 0), 0) /
      Math.max(results.length, 1),
  );
  const pricedRows = results.filter((row) => (row.askPrice || 0) > 0);
  const avgAsk = Math.round(
    pricedRows.reduce((sum, row) => sum + (row.askPrice || 0), 0) /
      Math.max(pricedRows.length, 1),
  );
  const photoRows = results.filter((row) => Boolean(row.imageUrl)).length;
  const qualityRows = results.filter(
    (row) => (row.dataQuality?.score || 0) >= 70,
  ).length;
  const sourceIds = new Set(results.map((row) => row.source).filter(Boolean));
  const readySources = Array.from(sourceIds).filter(
    (source) => sourceHealthById.get(source)?.readiness === "ready",
  ).length;
  const photoPct = Math.round((photoRows / Math.max(results.length, 1)) * 100);
  const qualityPct = Math.round(
    (qualityRows / Math.max(results.length, 1)) * 100,
  );
  const bestTitle = best
    ? [best.year, best.make, best.model].filter(Boolean).join(" ")
    : "Top match";

  return (
    <section className="glass-panel motion-enter overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
                Review queue
              </p>
              <h2 className="mt-1 text-lg font-black text-[var(--t1)] md:text-xl">
                Start with {bestTitle}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
                This strip summarizes the visible ranked set before you scroll:
                {flipDesk ? " profit signal," : " asking prices,"} proof
                quality, source health, and the safest next action.
              </p>
            </div>
            {best && (
              <Link
                href={`/deal/${best.id}`}
                className="interactive-surface premium-focus inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2 text-xs font-black text-[var(--green)]"
              >
                Open best match
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </div>

          <div className="stagger-children mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Visible rows",
                value: results.length.toLocaleString(),
                detail: "after filters",
                Icon: Sparkles,
              },
              flipDesk
                ? {
                    label: "Avg profit",
                    value: money(avgProfit),
                    detail: "modeled, verify",
                    Icon: TrendingUp,
                  }
                : {
                    label: "Avg asking",
                    value: pricedRows.length ? money(avgAsk) : "—",
                    detail: `${pricedRows.length}/${results.length} priced`,
                    Icon: TrendingUp,
                  },
              {
                label: "Photo proof",
                value: `${photoPct}%`,
                detail: `${photoRows}/${results.length} rows`,
                Icon: Camera,
              },
              {
                label: "Ready sources",
                value: `${readySources}/${sourceIds.size || 1}`,
                detail: "source health",
                Icon: ShieldCheck,
              },
            ].map(({ label, value, detail, Icon }) => (
              <div
                key={label}
                className="interactive-surface rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                    {label}
                  </span>
                  <Icon
                    className="h-3.5 w-3.5 text-[var(--t4)]"
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-2 text-base font-black text-[var(--t1)]">
                  {value}
                </div>
                <div className="text-[11px] font-semibold text-[var(--t5)]">
                  {detail}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-[var(--b1)] bg-[var(--s1)] p-4 md:p-5 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Action order
          </p>
          <div className="mt-3 space-y-2">
            {[
              [
                "1",
                "Open best match",
                "Check photos, VIN, title, source proof.",
              ],
              flipDesk
                ? [
                    "2",
                    "Verify max bid",
                    "Confirm costs before bidding or calling.",
                  ]
                : [
                    "2",
                    "Check the price",
                    "Compare similar listings and confirm fees before calling.",
                  ],
              [
                "3",
                "Save or move on",
                "Keep the row only if the proof is real.",
              ],
            ].map(([step, title, detail]) => (
              <div
                key={step}
                className="flex gap-3 rounded-[var(--r2)] bg-[var(--s0)] p-2.5"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--t1)] text-[11px] font-black text-[var(--s0)]">
                  {step}
                </span>
                <div>
                  <div className="text-xs font-black text-[var(--t1)]">
                    {title}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--t4)]">
                    {detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link
            href={href}
            className="interactive-surface premium-focus mt-3 inline-flex w-full items-center justify-center gap-2 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
          >
            Refresh this ranked scope
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--t5)]">
            {qualityPct}% of visible rows have strong listing detail. Thin rows
            should stay inspect-first until VIN, mileage, title, contact, and
            original source proof improve.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  onRetry,
  sourceHealth = [],
  broadHref = "/scan?sort=profit",
}: {
  onRetry: () => void;
  sourceHealth?: SourceHealthItem[];
  broadHref?: string;
}) {
  const checkedSources = sourceHealth.filter((item) =>
    ["ready", "no_rows", "needs_run"].includes(item.readiness),
  );
  const blockedSources = sourceHealth.filter((item) =>
    ["needs_login", "blocked", "disabled", "not_configured"].includes(
      item.readiness,
    ),
  );
  const scopedRows = sourceHealth.reduce(
    (sum, item) => sum + (Number(item.activeRows) || 0),
    0,
  );
  const hasScopedProof = sourceHealth.length > 0;

  return (
    <div
      className="flex flex-col items-center justify-center text-center py-20 px-6 rounded-2xl"
      style={{ border: "2px dashed var(--b2)", background: "var(--s0)" }}
    >
      {/* Static empty marker — no animated rings (not inventing a live scan) */}
      <div className="relative w-24 h-24 mb-8 flex items-center justify-center">
        <span
          className="absolute inset-0 rounded-full border-2"
          style={{ borderColor: "rgba(37,99,111,0.14)" }}
        />
        <span
          className="absolute inset-0 rounded-full border-2 scale-75"
          style={{ borderColor: "rgba(37,99,111,0.20)" }}
        />
        <span
          className="absolute inset-0 rounded-full border-2 scale-50"
          style={{ borderColor: "rgba(37,99,111,0.26)" }}
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
        No matching saved vehicles for this scope yet.
      </h2>
      <p className="text-[var(--t3)] max-w-sm mb-8 leading-relaxed">
        {hasScopedProof
          ? "Nothing in saved inventory matches these filters. Try another location, a higher budget, or a broader vehicle search."
          : "Adjust your filters, widen search locations in Settings, or wait for background coverage to fill this scope."}
      </p>

      {hasScopedProof && (
        <div className="mb-6 grid w-full max-w-xl grid-cols-3 gap-2 text-xs">
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">
              {checkedSources.length}
            </div>
            <div className="text-[var(--t5)]">listing sites searched</div>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">
              {scopedRows.toLocaleString()}
            </div>
            <div className="text-[var(--t5)]">matching vehicles</div>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="font-black text-[var(--t1)]">
              {blockedSources.length}
            </div>
            <div className="text-[var(--t5)]">sites could not be checked</div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          onClick={onRetry}
          className="flex items-center justify-center gap-2 text-sm font-bold rounded-xl px-5 py-2.5 transition-all text-white border-none"
          style={{ background: "var(--grad)" }}
        >
          <Ico name="refresh" size={16} />
          Search saved inventory
        </button>
        {hasScopedProof && (
          <Link
            href={broadHref}
            className="flex items-center justify-center rounded-xl border border-[var(--b2)] bg-[var(--s1)] px-5 py-2.5 text-sm font-bold text-[var(--t2)] transition-colors hover:text-[var(--t1)]"
          >
            Broaden search
          </Link>
        )}
      </div>
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
  importPlan,
  readinessItems,
  sourceHealth,
  scopeStatus,
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
  importPlan: ScrapePlanResult | null;
  readinessItems: ReadinessItem[];
  sourceHealth: SourceHealthItem[];
  scopeStatus?: SourceScopeStatus | null;
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
  const importFailures = importRun.filter((item) => !item.success);
  const importEmptySuccesses = importRun.filter(
    (item) => item.success && (item.dealsFound || 0) === 0,
  );
  const runHealthBySource = new Map(
    sourceHealth.map((item) => [item.id, item]),
  );
  const postRunProof = importRun
    .map((item) => {
      const health =
        runHealthBySource.get(item.source) ||
        (item.source === "curated_dealers"
          ? sourceHealth.find(
              (source) =>
                source.id !== "curated_dealers" && source.readiness === "ready",
            )
          : undefined);
      return { ...item, health };
    })
    .filter((item) => item.success || item.health || item.error);
  const postRunThinFields = Array.from(
    new Set(
      postRunProof.flatMap((item) => {
        const c = item.health?.completeness || {};
        return [
          ["VIN", c.vinPct],
          ["mileage", c.mileagePct],
          ["seller contact", c.sellerContactPct],
          ["auction date", c.auctionDatePct],
          ["source link", c.sourceLinkPct],
          ["photos", c.photosPct],
        ]
          .filter(
            ([, value]) => typeof value === "number" && Number(value) < 70,
          )
          .map(([label]) => String(label));
      }),
    ),
  );
  const postRunReadyRows = postRunProof.reduce(
    (sum, item) => sum + Number(item.health?.activeRows || 0),
    0,
  );
  const postRunPhotos = postRunProof.reduce(
    (sum, item) => sum + Number(item.health?.rowsWithPhotos || 0),
    0,
  );
  const importOutcome =
    importRun.length === 0
      ? null
      : importedRows > 0
        ? {
            tone: "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]",
            label: "Rows saved",
            detail:
              "Open matching rows, check completeness, then save/watch the best candidates.",
          }
        : importFailures.length === importRun.length
          ? {
              tone: "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
              label: "All sources failed",
              detail:
                "Inspect source errors and source proof before rerunning this scope.",
            }
          : {
              tone: "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
              label: "No matching rows",
              detail:
                "The run completed, but this exact scope is empty. Broaden state, budget, keyword, or dealer targets.",
            };
  const blockingImportItems = importReadiness.filter(
    (item) => item.status !== "ready",
  );
  const nextImportGate = blockingImportItems[0] || null;
  const selectedHealthIds = new Set([
    ...plan.sourceIds,
    ...(((plan.scope as { dealerSourceIds?: string[] }).dealerSourceIds ||
      []) as string[]),
  ]);
  const selectedHealth = sourceHealth
    .filter((item) => selectedHealthIds.has(item.id))
    .sort((a, b) => {
      const rank: Record<string, number> = {
        ready: 0,
        no_rows: 1,
        needs_run: 2,
        needs_login: 3,
        blocked: 4,
        not_configured: 5,
        disabled: 6,
      };
      const ar = rank[a.readiness] ?? 9;
      const br = rank[b.readiness] ?? 9;
      if (ar !== br) return ar - br;
      return (b.activeRows || 0) - (a.activeRows || 0);
    });
  const selectedReady = selectedHealth.filter(
    (item) => item.readiness === "ready",
  );
  const selectedNeedsLogin = selectedHealth.filter(
    (item) => item.readiness === "needs_login",
  );
  const selectedRunnable = selectedHealth.filter((item) =>
    ["ready", "no_rows", "needs_run", "not_configured"].includes(
      item.readiness,
    ),
  );
  const selectedBlocked = selectedHealth.filter((item) =>
    ["needs_login", "blocked", "disabled"].includes(item.readiness),
  );
  const selectedRows = selectedHealth.reduce(
    (sum, item) => sum + (Number(item.activeRows) || 0),
    0,
  );
  const hasNoMatchingSources = plan.sourceIds.length === 0;
  const hasScopeNoMatch =
    hasNoMatchingSources || scopeStatus?.status === "no_match";
  const hasScopeEmpty = scopeStatus?.status === "empty";
  const plannedSearchHref = `/scan?${new URLSearchParams({
    lane: String(plan.scope.lane || "all"),
    ...(plan.filters.state ? { state: plan.filters.state } : {}),
    ...(plan.scope.states?.length
      ? { states: plan.scope.states.join(",") }
      : {}),
    ...(plan.filters.q ? { q: plan.filters.q } : {}),
    ...(plan.scope.sellerType
      ? { sellerType: String(plan.scope.sellerType) }
      : {}),
    ...(plan.scope.maxPrice ? { maxPrice: String(plan.scope.maxPrice) } : {}),
    ...(Array.isArray(plan.scope.dealerSourceIds) &&
    plan.scope.dealerSourceIds.length
      ? { dealerSourceIds: plan.scope.dealerSourceIds.join(",") }
      : {}),
  }).toString()}`;
  const readinessLabel: Record<string, string> = {
    ready: "Ready",
    no_rows: "No rows",
    needs_run: "Needs run",
    needs_login: "Needs login",
    blocked: "Blocked",
    not_configured: "Setup",
    disabled: "Disabled",
  };
  const readinessTone = (status: string) => {
    if (status === "ready") return "text-[var(--green)]";
    if (status === "no_rows" || status === "needs_run")
      return "text-[var(--amber-d)]";
    if (status === "needs_login" || status === "blocked")
      return "text-[var(--red)]";
    return "text-[var(--t5)]";
  };
  const sourceProofText = (item: SourceHealthItem) => {
    const lastRun = item.lastRunAt
      ? `ran ${new Date(item.lastRunAt).toLocaleDateString()}`
      : "never run";
    const freshness =
      typeof item.freshnessHours === "number"
        ? item.freshnessHours < 24
          ? `${item.freshnessHours}h fresh`
          : `${Math.round(item.freshnessHours / 24)}d fresh`
        : item.lastSeenAt
          ? `seen ${new Date(item.lastSeenAt).toLocaleDateString()}`
          : "no rows seen";
    return `${lastRun} · ${freshness}`;
  };
  const sourceListText = (sourceIds: string[], limit = 5) => {
    if (!sourceIds.length) return "";
    const visible = sourceIds
      .slice(0, limit)
      .map((sourceId) => sourceMeta(sourceId).label)
      .join(", ");
    return `${visible}${sourceIds.length > limit ? `, +${sourceIds.length - limit} more` : ""}`;
  };
  const runContract = [
    {
      label: "Buying lane",
      value: String(plan.scope.lane || "all"),
      detail:
        plan.scope.titleType || plan.filters.q || "All title and vehicle types",
    },
    {
      label: "Market",
      value:
        plan.filters.states?.join(", ") || plan.filters.state || "Nationwide",
      detail: plan.scope.maxPrice
        ? `Up to $${Number(plan.scope.maxPrice).toLocaleString()}`
        : "No budget cap",
    },
    {
      label: "Dealer targets",
      value:
        Array.isArray(plan.scope.dealerSourceIds) &&
        plan.scope.dealerSourceIds.length
          ? `${plan.scope.dealerSourceIds.length} selected source${
              plan.scope.dealerSourceIds.length === 1 ? "" : "s"
            }`
          : Array.isArray(plan.scope.dealerHosts) &&
              plan.scope.dealerHosts.length
            ? `${plan.scope.dealerHosts.length} selected host${
                plan.scope.dealerHosts.length === 1 ? "" : "s"
              }`
            : "Any matching seller",
      detail:
        Array.isArray(plan.scope.dealerSourceIds) &&
        plan.scope.dealerSourceIds.length
          ? sourceListText(plan.scope.dealerSourceIds)
          : Array.isArray(plan.scope.dealerHosts) &&
              plan.scope.dealerHosts.length
            ? plan.scope.dealerHosts.join(", ")
            : "No specific dealer target filter",
    },
    {
      label: "Search discipline",
      value: `${plan.sourceIds.length} source${plan.sourceIds.length === 1 ? "" : "s"}`,
      detail: hasNoMatchingSources
        ? "No source matches this exact lane and seller type"
        : "Searches this scope only, not the whole catalog",
    },
  ];

  return (
    <motion.section
      className="glass-panel p-4 md:p-5"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Buyer search plan
          </p>
          <h2 className="text-lg font-black text-[var(--t1)]">
            {hasScopeNoMatch
              ? "This search needs broader criteria."
              : hasScopeEmpty
                ? scopeStatus?.label || "No matching vehicles are ready yet."
                : ready
                  ? "Matching vehicles are being filtered for your buying intent."
                  : showingPreview
                    ? "Showing available matching vehicles while results refresh."
                    : configured
                      ? "This search has no matching vehicles ready to review yet."
                      : "This search is not ready to return vehicles yet."}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
            {scopeStatus?.message ||
              "MIKEHUNT searches only the markets that match your location, vehicle, budget, and seller preferences, then turns results into photo-backed deal cards."}
          </p>
          {!configured && (
            <Link
              href={plannedSearchHref}
              className="mt-2 inline-flex text-xs font-bold text-[var(--amber-d)] hover:underline"
            >
              Refine search
            </Link>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <motion.button
            type="button"
            onClick={onPreview}
            disabled={previewing || running}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Ico name="scan" size={15} />
            {previewing ? "Checking..." : "Check sources"}
          </motion.button>
          {!configured && (
            <motion.button
              type="button"
              onClick={onLivePreview}
              disabled={previewing || running || livePreviewing}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)] transition-transform active:scale-[0.98] disabled:opacity-60"
            >
              <Ico name="search" size={15} />
              {livePreviewing ? "Fetching..." : "Live public preview"}
            </motion.button>
          )}
          <motion.button
            type="button"
            onClick={onRun}
            disabled={previewing || running || hasScopeNoMatch}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] px-4 py-2.5 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-50"
            style={{ background: "var(--grad)" }}
            title={
              hasNoMatchingSources
                ? "Change lane or seller type before running."
                : configured
                  ? "Search only the selected sources."
                  : "Show the exact data setup path for this scope."
            }
          >
            {running ? (
              <MikeHuntLoader
                state="loading"
                size={20}
                label="Searching selected sources"
              />
            ) : (
              <Ico name="refresh" size={15} />
            )}
            {running
              ? "Running..."
              : hasNoMatchingSources
                ? "No matching sources"
                : configured
                  ? "Search selected sources"
                  : "Finish setup"}
          </motion.button>
        </div>
      </div>

      {hasScopeNoMatch && (
        <div className="mt-4 rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-4 py-3">
          <div className="text-sm font-black text-[var(--amber-d)]">
            {scopeStatus?.label || "This scope has no safe source match."}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--t3)]">
            {scopeStatus?.message ||
              "The selected lane and seller type conflict, so MikeHunt will not run a broad fallback search."}{" "}
            {scopeStatus?.nextAction ||
              "Change seller type, lane, or dealer targets to preview sources again."}
          </p>
        </div>
      )}

      {hasScopeEmpty && !hasScopeNoMatch && (
        <div className="mt-4 rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-4 py-3">
          <div className="text-sm font-black text-[var(--amber-d)]">
            {scopeStatus?.label || "No ready rows yet."}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--t3)]">
            {scopeStatus?.message} {scopeStatus?.nextAction}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
            Sources
          </div>
          <div className="mt-1 text-base font-black text-[var(--t1)]">
            {plan.sourceIds.length} selected
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
            {hasScopeNoMatch
              ? "No search starts until the buyer scope has a matching source lane."
              : sourceListText(plan.sourceIds)}
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
            {plan.filters.states?.join(", ") ||
              plan.filters.state ||
              "Nationwide"}{" "}
            · {plan.filters.q || "all vehicles"}
            {plan.scope.sellerType ? ` · ${plan.scope.sellerType} sellers` : ""}
          </p>
        </div>
        <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="text-xs font-bold uppercase tracking-wider text-[var(--t5)]">
            Status
          </div>
          <div className="mt-1 text-base font-black text-[var(--t1)]">
            {hasScopeNoMatch
              ? "adjust filters"
              : configured
                ? `${total.toLocaleString()} rows`
                : showingPreview
                  ? `${total.toLocaleString()} preview rows`
                  : "setup needed"}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
            {hasScopeNoMatch
              ? "No data path will run for this conflicting scope."
              : configured
                ? "Scan is reading the live deal table."
                : showingPreview
                  ? "Preview rows are fetched live and are not saved yet."
                  : "Connect data/auth keys and search selected sources."}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
              Search promise
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--t4)]">
              MikeHunt only looks for inventory that matches this buyer intent,
              then shows source proof and completeness on the matching rows.
              This keeps results useful and avoids collecting cars the buyer did
              not ask for.
            </p>
          </div>
          <Link
            href={plannedSearchHref}
            className="shrink-0 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)] hover:text-[var(--accent)]"
          >
            Search details
          </Link>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {runContract.map((item, index) => (
            <motion.div
              key={item.label}
              className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035, duration: 0.18 }}
              whileHover={{ y: -2 }}
            >
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                {item.label}
              </div>
              <div className="mt-1 truncate text-sm font-black text-[var(--t1)]">
                {item.value}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--t4)]">
                {item.detail}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {message && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-4 py-3 text-sm font-semibold text-[var(--t2)]">
          {message}
        </div>
      )}

      {importRun.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Post-run proof
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--t4)]">
                This is what the last scoped source search returned for this
                buyer intent. Use it to decide whether to inspect, broaden, or
                verify weak fields before bidding.
              </p>
            </div>
            <div
              className={cn(
                "rounded-[var(--r2)] border px-3 py-2 text-xs font-black uppercase",
                importOutcome?.tone ||
                  "border-[var(--b1)] bg-[var(--s0)] text-[var(--t3)]",
              )}
            >
              {importOutcome?.label || "Run complete"}
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Found
              </div>
              <div className="mt-1 text-lg font-black text-[var(--t1)]">
                {importedRows.toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-[var(--t4)]">
                rows reported by the run
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Current proof
              </div>
              <div className="mt-1 text-lg font-black text-[var(--t1)]">
                {postRunReadyRows.toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-[var(--t4)]">
                scoped live rows after search
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Photos
              </div>
              <div className="mt-1 text-lg font-black text-[var(--t1)]">
                {postRunPhotos.toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-[var(--t4)]">
                rows with image proof
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Verify next
              </div>
              <div className="mt-1 line-clamp-1 text-sm font-black text-[var(--t1)]">
                {postRunThinFields.length
                  ? postRunThinFields.slice(0, 2).join(", ")
                  : "Ready for review"}
              </div>
              <p className="mt-1 text-[11px] text-[var(--t4)]">
                {postRunThinFields.length
                  ? `${postRunThinFields.length} weak field${postRunThinFields.length === 1 ? "" : "s"}`
                  : "No major weak source fields"}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {postRunProof.map((item) => (
              <div
                key={`${item.source}-${item.duration}`}
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-black text-[var(--t1)]">
                    {item.health?.name || item.source}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase",
                      item.success
                        ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                        : "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
                    )}
                  >
                    {item.success ? "saved" : "failed"}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-[var(--t4)]">
                  {item.dealsFound.toLocaleString()} found ·{" "}
                  {Math.max(0, Math.round(item.duration / 100) / 10)}s run
                  {item.health
                    ? ` · ${Number(item.health.activeRows || 0).toLocaleString()} live rows · ${Number(
                        item.health.photoCoveragePct || 0,
                      )}% photos`
                    : ""}
                </p>
                <p className="mt-1 line-clamp-2 leading-relaxed text-[var(--t5)]">
                  {item.error ||
                    item.health?.nextAction ||
                    importOutcome?.detail ||
                    "Open matching rows and review source proof."}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link
              href={`/scan?${new URLSearchParams({
                lane: String(plan.scope.lane || "all"),
                ...(plan.filters.state ? { state: plan.filters.state } : {}),
                ...(plan.scope.states?.length
                  ? { states: plan.scope.states.join(",") }
                  : {}),
                ...(plan.filters.q ? { q: plan.filters.q } : {}),
                ...(plan.scope.sellerType
                  ? { sellerType: String(plan.scope.sellerType) }
                  : {}),
                ...(plan.scope.maxPrice
                  ? { maxPrice: String(plan.scope.maxPrice) }
                  : {}),
                ...(Array.isArray(plan.scope.dealerHosts) &&
                plan.scope.dealerHosts.length
                  ? { dealers: plan.scope.dealerHosts.join(",") }
                  : {}),
                ...(Array.isArray(plan.scope.dealerSourceIds) &&
                plan.scope.dealerSourceIds.length
                  ? { dealerSourceIds: plan.scope.dealerSourceIds.join(",") }
                  : {}),
                sort: "fresh",
              }).toString()}`}
              className="inline-flex items-center justify-center rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)] hover:text-[var(--accent)]"
            >
              View matching rows
            </Link>
            <Link
              href={plannedSearchHref}
              className="inline-flex items-center justify-center rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)] hover:text-[var(--accent)]"
            >
              Inspect source proof
            </Link>
          </div>
        </div>
      )}

      {importPlan && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Planned source search
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                {importPlan.message ||
                  "Exact source plan for this buyer scope."}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2">
                <div className="font-black text-[var(--t1)]">
                  {importPlan.summary.total}
                </div>
                <div className="text-[var(--t5)]">sources</div>
              </div>
              <div className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2">
                <div className="font-black text-[var(--green)]">
                  {importPlan.summary.runnable}
                </div>
                <div className="text-[var(--t5)]">ready</div>
              </div>
              <div className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2">
                <div className="font-black text-[var(--amber-d)]">
                  {importPlan.summary.heldBack}
                </div>
                <div className="text-[var(--t5)]">skipped</div>
              </div>
              <div className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2">
                <div className="font-black text-[var(--t1)]">
                  {Number(
                    importPlan.summary.estimatedDealsPerRun || 0,
                  ).toLocaleString()}
                </div>
                <div className="text-[var(--t5)]">est rows</div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {importPlan.sources.slice(0, 8).map((source, index) => (
              <motion.div
                key={source.id}
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2 text-xs"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.025, duration: 0.18 }}
                whileHover={{ y: -2 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-black text-[var(--t1)]">
                    {source.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase",
                      source.runnable
                        ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                        : "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
                    )}
                  >
                    {source.runnable ? "ready" : source.readiness}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--t4)]">
                  {source.action}
                </p>
              </motion.div>
            ))}
          </div>
          {importPlan.mismatchedSourceIds?.length ? (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2 text-xs">
              <div className="font-black uppercase tracking-wider text-[var(--amber-d)]">
                Outside this buyer lane
              </div>
              <p className="mt-1 leading-relaxed text-[var(--t3)]">
                {sourceListText(importPlan.mismatchedSourceIds)}{" "}
                {importPlan.mismatchedSourceIds.length === 1 ? "was" : "were"}{" "}
                skipped because{" "}
                {importPlan.mismatchedSourceIds.length === 1 ? "it" : "they"} do
                not match the selected {plan.scope.lane} lane.
              </p>
            </div>
          ) : null}
          {importPlan.dealerSourceIds?.length ? (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2 text-xs">
              <div className="font-black uppercase tracking-wider text-[var(--green)]">
                Dealer targets included
              </div>
              <p className="mt-1 leading-relaxed text-[var(--t3)]">
                {sourceListText(importPlan.dealerSourceIds)} will be handled by
                the curated dealer network for this selected lane.
              </p>
            </div>
          ) : null}
          {importPlan.gates.some((gate) => gate.status !== "ready") && (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2 text-xs">
              <div className="font-black uppercase tracking-wider text-[var(--amber-d)]">
                Setup checks
              </div>
              <div className="mt-1 space-y-1 text-[var(--t3)]">
                {importPlan.gates
                  .filter((gate) => gate.status !== "ready")
                  .map((gate) => (
                    <div key={gate.id}>
                      <span className="font-bold text-[var(--t2)]">
                        {gate.label}:
                      </span>{" "}
                      {gate.nextStep}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selectedHealth.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Source readiness
              </div>
              <p className="text-xs text-[var(--t4)]">
                {selectedReady.length} ready · {selectedRows.toLocaleString()}{" "}
                known rows · {selectedNeedsLogin.length} need login
              </p>
            </div>
            <Link
              href={plannedSearchHref}
              className="text-xs font-bold text-[var(--accent)] hover:underline"
            >
              Source details
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {selectedHealth.slice(0, 8).map((item, index) => (
              <Link
                key={item.id}
                href={`/scan?${new URLSearchParams({
                  lane: String(plan.scope.lane || "all"),
                  source: item.id,
                  ...(plan.filters.state ? { state: plan.filters.state } : {}),
                  ...(plan.scope.states?.length
                    ? { states: plan.scope.states.join(",") }
                    : {}),
                  ...(plan.filters.q ? { q: plan.filters.q } : {}),
                  ...(plan.scope.sellerType
                    ? { sellerType: String(plan.scope.sellerType) }
                    : {}),
                  sort: "profit",
                }).toString()}`}
                className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2 text-xs"
              >
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.025, duration: 0.18 }}
                  whileHover={{ y: -2 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-1 font-black text-[var(--t1)]">
                      {item.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-black uppercase",
                        readinessTone(item.readiness),
                      )}
                    >
                      {readinessLabel[item.readiness] || item.readiness}
                    </span>
                  </div>
                  <div className="mt-1 font-semibold text-[var(--t3)]">
                    {Number(item.activeRows || 0).toLocaleString()} rows ·{" "}
                    {Number(item.rowsWithPhotos || 0).toLocaleString()} photos
                  </div>
                  <div className="mt-1 text-[var(--t4)]">
                    {item.qualityLabel || `${item.averageQuality || 0}% detail`}{" "}
                    · {Number(item.photoCoveragePct || 0)}% photo coverage
                  </div>
                  <div className="mt-1 text-[var(--t5)]">
                    {sourceProofText(item)}
                  </div>
                  <div className="mt-1 line-clamp-2 text-[var(--t5)]">
                    {item.lastError || item.nextAction || item.userImpact}
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {selectedHealth.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Search coverage
              </div>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--t4)]">
                The search uses the sources and filters above. It will not fan
                out across unrelated lanes, states, or dealers.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2">
                <div className="font-black text-[var(--green)]">
                  {selectedRunnable.length}
                </div>
                <div className="text-[var(--t5)]">ready</div>
              </div>
              <div className="rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2">
                <div className="font-black text-[var(--amber-d)]">
                  {selectedBlocked.length}
                </div>
                <div className="text-[var(--t5)]">needs setup</div>
              </div>
              <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
                <div className="font-black text-[var(--t1)]">
                  {configured ? "Ready" : "Setup"}
                </div>
                <div className="text-[var(--t5)]">data access</div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--green)]">
                Ready to search
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--t3)]">
                {selectedRunnable.length
                  ? sourceListText(selectedRunnable.map((item) => item.id))
                  : "No selected source is ready yet."}
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-wider text-[var(--amber-d)]">
                Needs setup
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--t3)]">
                {selectedBlocked.length
                  ? selectedBlocked
                      .map(
                        (item) =>
                          `${sourceMeta(item.id).label}: ${
                            readinessLabel[item.readiness] || item.readiness
                          }`,
                      )
                      .join(", ")
                  : "No selected source is blocked by login, captcha, or disabled status."}
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--t4)]">
            {configured
              ? `Search selected sources will use ${sourceListText(
                  plan.sourceIds,
                )} with this exact buyer scope.`
              : nextImportGate
                ? `Setup needed: ${nextImportGate.nextStep}`
                : "Data access is ready, but this scope has not returned live rows yet."}
          </p>
        </div>
      )}

      {!configured && importReadiness.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Data readiness
              </div>
              <p className="text-xs text-[var(--t4)]">
                These items control saved inventory, Google sign-in, and
                protected source searches.
              </p>
            </div>
            <Link
              href={plannedSearchHref}
              className="text-xs font-bold text-[var(--accent)] hover:underline"
            >
              Refine search
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
          <div className="mt-3 rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--amber-d)]">
                  Next setup step
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--t3)]">
                  {nextImportGate
                    ? `Next: ${nextImportGate.nextStep}`
                    : "All data access checks are ready."}
                </p>
              </div>
              <Link
                href={plannedSearchHref}
                className="shrink-0 rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--amber-d)]"
              >
                Refine search
              </Link>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--t4)]">
              Once ready, this search will use only{" "}
              <span className="font-bold text-[var(--t2)]">
                {sourceListText(plan.sourceIds)}
              </span>{" "}
              for this scope, then matching rows appear here with data quality
              and source proof.
            </p>
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
              href={plannedSearchHref}
              className="text-xs font-bold text-[var(--accent)] hover:underline"
            >
              Search details
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {proof.map((item) => (
              <Link
                key={item.id}
                href={`/scan?${new URLSearchParams({
                  source: item.id,
                  filter: item.status === "working" ? "ready" : item.status,
                }).toString()}`}
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
              </Link>
            ))}
          </div>
        </div>
      )}

      {importRun.length > 0 && (
        <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Last source search
              </div>
              <p className="text-xs text-[var(--t4)]">
                {importSuccesses}/{importRun.length} sources succeeded ·{" "}
                {importedRows.toLocaleString()} rows found
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={plannedSearchHref}
                className="text-xs font-bold text-[var(--accent)] hover:underline"
              >
                Search details
              </Link>
              <Link
                href={plannedSearchHref}
                className="text-xs font-bold text-[var(--accent)] hover:underline"
              >
                Search details
              </Link>
            </div>
          </div>
          {importOutcome && (
            <div
              className={cn(
                "mb-3 rounded-[var(--r2)] border px-3 py-2 text-xs",
                importOutcome.tone,
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-black uppercase tracking-wider">
                    {importOutcome.label}
                  </div>
                  <p className="mt-1 leading-relaxed text-[var(--t3)]">
                    {importOutcome.detail}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {importedRows > 0 ? (
                    <Link
                      href={`/scan?${new URLSearchParams({
                        lane: String(plan.scope.lane || "all"),
                        ...(plan.filters.state
                          ? { state: plan.filters.state }
                          : {}),
                        ...(plan.filters.q ? { q: plan.filters.q } : {}),
                        ...(plan.scope.states?.length
                          ? { states: plan.scope.states.join(",") }
                          : {}),
                        sort: "profit",
                      }).toString()}`}
                      className="rounded-[var(--r1)] border border-[var(--gbd)] bg-[var(--s0)] px-2 py-1 text-[10px] font-black text-[var(--green)]"
                    >
                      Review rows
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={onPreview}
                      disabled={previewing || running}
                      className="rounded-[var(--r1)] border border-[var(--amber-bd)] bg-[var(--s0)] px-2 py-1 text-[10px] font-black text-[var(--amber-d)] disabled:opacity-60"
                    >
                      Recheck plan
                    </button>
                  )}
                </div>
              </div>
              {(importEmptySuccesses.length > 0 ||
                importFailures.length > 0) && (
                <p className="mt-2 leading-relaxed text-[var(--t4)]">
                  {importEmptySuccesses.length > 0
                    ? `Empty: ${importEmptySuccesses
                        .map((item) => item.source)
                        .join(", ")}. `
                    : ""}
                  {importFailures.length > 0
                    ? `Failed: ${importFailures
                        .map((item) => item.source)
                        .join(", ")}.`
                    : ""}
                </p>
              )}
            </div>
          )}
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
    </motion.section>
  );
}

// ── Filter select ─────────────────────────────────────────────────────────────

function RangeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--t3)]">
      {label}
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        aria-label={label}
        placeholder="Any"
        value={value === "any" ? "" : value.replace("k", "000")}
        onChange={(event) => onChange(event.target.value || "any")}
        className="min-h-11 w-28 max-w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 text-sm text-[var(--t1)]"
      />
    </label>
  );
}

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
      className="min-h-11 max-w-full text-sm text-[var(--t1)] rounded-[var(--r2)] px-3 py-2 outline-none transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
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
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

let _toastId = 0;

function ScanPageInner() {
  const { isAdmin } = useIsAdmin();
  const urlParams = useSearchParams();
  const { intent: savedBuyerIntent } = useBuyerIntent();
  // Unknown mode is personal. Only reseller/dealer desks see flip tools and copy.
  const flipDesk = isFlipBuyerMode(savedBuyerIntent?.buyerMode);
  const reviewMode = urlParams.get("review");
  const isFreshImportReview = reviewMode === "fresh-import";
  const { transitionTo } = useViewTransition();

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
  const localSaved = useLocalSavedVehicles();

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
        if (p.maxPrice) setMaxPrice(normalizeMaxPriceFilter(p.maxPrice));
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
  const [sellerTypeFilter, setSellerTypeFilter] = useState("all");
  const [titleType, setTitleType] = useState("all");
  const [lane, setLane] = useState("all"); // acquisition lane segment (auction/salvage/…)
  const [minProfit, setMinProfit] = useState("any");
  const [state, setStateValue] = useState("all");
  const [selectedStates, setSelectedStates] = useState("");
  const setState = (value: string) => {
    setSelectedStates("");
    setStateValue(value);
  };
  const [make, setMake] = useState("all");
  const [makesFilter, setMakesFilter] = useState<string[]>([]);
  const [model, setModel] = useState("all");
  const [maxPrice, setMaxPrice] = useState("any");
  const [minYear, setMinYear] = useState("any");
  const [maxMileage, setMaxMileage] = useState("any");
  const [minMileage, setMinMileage] = useState("any");
  const [damage, setDamage] = useState("all");
  const [body, setBody] = useState("all");
  const [trim, setTrim] = useState("");
  const [fuelType, setFuelType] = useState("all");
  const [transmission, setTransmission] = useState("all");
  const [keys, setKeys] = useState("all");
  const [buyNow, setBuyNow] = useState(false);
  const [availability, setAvailability] = useState("all");
  const [madeInUsa, setMadeInUsa] = useState(false);
  const [drivetrain, setDrivetrain] = useState("all");
  const [sort, setSort] = useState<string>(defaultScanSort(undefined));
  // New: verdict (GO-only), price floor, year ceiling, and an advanced-filters disclosure.
  const [verdict, setVerdict] = useState("all");
  const [category, setCategory] = useState("all"); // browsable one-tap lead category
  const [dealerHostsFilter, setDealerHostsFilter] = useState<string[]>([]);
  const [dealerSourceIdsFilter, setDealerSourceIdsFilter] = useState<string[]>(
    [],
  );
  const [minPrice, setMinPrice] = useState("any");
  const [maxYear, setMaxYear] = useState("any");
  const [showMore, setShowMore] = useState(false);
  const [planPreviewing, setPlanPreviewing] = useState(false);
  const [runImporting, setRunImporting] = useState(false);
  const sourceRunId = useRef(0);
  const sourceRunController = useRef<AbortController | null>(null);
  const planRequests = useRef(createLatestRequest());
  const previewRequests = useRef(createLatestRequest());
  const pageRequests = useRef(createLatestRequest());
  const [livePreviewing, setLivePreviewing] = useState(false);
  const [livePreviewRows, setLivePreviewRows] = useState<any[]>([]);
  const [livePreviewProof, setLivePreviewProof] = useState<PreviewProofItem[]>(
    [],
  );
  const [importRunProof, setImportRunProof] = useState<ImportRunItem[]>([]);
  const [importPlanProof, setImportPlanProof] =
    useState<ScrapePlanResult | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const autoPreviewKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const q = urlParams.get("q");
    const source = urlParams.get("source");
    const sellerTypeParam = urlParams.get("sellerType");
    const title = urlParams.get("titleType");
    const laneParam = urlParams.get("lane");
    const stateParam = urlParams.get("state");
    const statesParam = urlParams.get("states");
    const makeParam = urlParams.get("make");
    const makesParam = urlParams.get("makes");
    const modelParam = urlParams.get("model");
    const sortParam = urlParams.get("sort");
    const maxPriceParam = urlParams.get("maxPrice");
    const verdictParam = urlParams.get("verdict");
    const dealersParam = urlParams.get("dealers");
    const dealerSourceIdsParam = urlParams.get("dealerSourceIds");
    const hasExplicitScanParams = [
      q,
      source,
      sellerTypeParam,
      title,
      laneParam,
      stateParam,
      statesParam,
      makeParam,
      makesParam,
      modelParam,
      maxPriceParam,
      verdictParam,
      dealersParam,
      dealerSourceIdsParam,
      ...[
        "minPrice",
        "minProfit",
        "minYear",
        "maxYear",
        "minMileage",
        "maxMileage",
        "damage",
        "body",
        "trim",
        "fuelType",
        "transmission",
        "keys",
        "buyNow",
        "availability",
        "drivetrain",
        "madeInUsa",
        "category",
        "reset",
      ].map((key) => urlParams.get(key)),
    ].some(Boolean);

    setSearchInput(q || "");
    setSearch(q || "");
    setSourceFilter(source || "all");
    setSellerTypeFilter(sellerTypeParam || "all");
    setTitleType(title || "all");
    setLane(laneParam || "all");
    setState(stateParam?.toUpperCase() || "all");
    setSelectedStates(statesParam || "");
    setMake(makeParam || "all");
    setMakesFilter([]);
    setModel(modelParam || "all");
    setMaxPrice(maxPriceParam ? normalizeMaxPriceFilter(maxPriceParam) : "any");
    setMinPrice(urlParams.get("minPrice") || "any");
    setMinProfit(urlParams.get("minProfit") || "any");
    setMinYear(urlParams.get("minYear") || "any");
    setMaxYear(urlParams.get("maxYear") || "any");
    setMaxMileage(urlParams.get("maxMileage") || "any");
    setMinMileage(urlParams.get("minMileage") || "any");
    setDamage(urlParams.get("damage") || "all");
    setBody(urlParams.get("body") || "all");
    setTrim(urlParams.get("trim") || "");
    setFuelType(urlParams.get("fuelType") || "all");
    setTransmission(urlParams.get("transmission") || "all");
    setKeys(urlParams.get("keys") || "all");
    setBuyNow(urlParams.get("buyNow") === "1");
    setAvailability(urlParams.get("availability") || "all");
    setDrivetrain(urlParams.get("drivetrain") || "all");
    setMadeInUsa(urlParams.get("madeInUsa") === "1");
    setCategory(urlParams.get("category") || "all");
    setVerdict(verdictParam || "all");
    setDealerHostsFilter([]);
    setDealerSourceIdsFilter([]);

    if (q) {
      setSearchInput(q);
      setSearch(q);
    }
    if (source) setSourceFilter(source);
    if (sellerTypeParam) setSellerTypeFilter(sellerTypeParam);
    if (title) setTitleType(title);
    if (laneParam) setLane(laneParam);
    if (stateParam) setState(stateParam.toUpperCase());
    if (makeParam) setMake(makeParam);
    if (makesParam) {
      setMakesFilter(
        makesParam
          .split(",")
          .map((item) =>
            item
              .replace(/[^a-zA-Z0-9\s-]/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 12),
      );
    }
    if (modelParam) setModel(modelParam);
    if (sortParam) setSort(sortParam);
    else setSort(defaultScanSort(savedBuyerIntent?.buyerMode));
    if (maxPriceParam) setMaxPrice(normalizeMaxPriceFilter(maxPriceParam));
    if (verdictParam) setVerdict(verdictParam);
    if (dealersParam) {
      setDealerHostsFilter(
        dealersParam
          .split(",")
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean),
      );
    }
    if (dealerSourceIdsParam) {
      setDealerSourceIdsFilter(
        dealerSourceIdsParam
          .split(",")
          .map((id) =>
            id
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9_-]/g, "")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 25),
      );
    }

    if (hasExplicitScanParams || typeof window === "undefined") return;

    const savedScope = savedBuyerIntent;
    const savedParams = buildBuyerIntentQuery(savedScope);
    const scopedQuery = savedParams.get("q") || "";
    const scopedMakes = savedParams.get("makes");
    const scopedLane = savedParams.get("lane") || "";
    const scopedState = savedParams.get("state") || "";
    const scopedTitleType = savedParams.get("titleType") || "";
    const scopedSellerType = savedParams.get("sellerType") || "";
    const scopedMaxPrice = savedParams.get("maxPrice") || "";
    const scopedMinPrice = savedParams.get("minPrice") || "";
    const scopedDealers = savedParams.get("dealers") || "";
    const scopedDealerSourceIds = savedParams.get("dealerSourceIds") || "";

    if (scopedQuery) {
      setSearchInput(scopedQuery);
      setSearch(scopedQuery);
    }
    if (scopedMakes) {
      setMakesFilter(
        scopedMakes
          .split(",")
          .map((make) => make.trim())
          .filter(Boolean)
          .slice(0, 12),
      );
    }
    if (scopedLane) setLane(scopedLane);
    if (scopedState) setState(scopedState.toUpperCase());
    if (scopedTitleType) setTitleType(scopedTitleType);
    if (scopedSellerType) setSellerTypeFilter(scopedSellerType);
    if (scopedMaxPrice) setMaxPrice(normalizeMaxPriceFilter(scopedMaxPrice));
    if (scopedMinPrice) setMinPrice(scopedMinPrice);
    if (scopedDealerSourceIds) {
      setDealerSourceIdsFilter(
        scopedDealerSourceIds
          .split(",")
          .map((id) =>
            id
              .toLowerCase()
              .replace(/\s+/g, "-")
              .replace(/[^a-z0-9_-]/g, "")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 25),
      );
    }
    if (scopedDealers) {
      setDealerHostsFilter(
        scopedDealers
          .split(",")
          .map((host) =>
            host
              .toLowerCase()
              .replace(/^https?:\/\//, "")
              .replace(/^www\./, "")
              .split("/")[0]
              .replace(/[^a-z0-9.-]/g, "")
              .trim(),
          )
          .filter(Boolean)
          .slice(0, 25),
      );
    }
  }, [urlParams, savedBuyerIntent]);

  // How many advanced filters are active (shown on the "More filters" button).
  const advancedCount = useMemo(() => {
    let c = 0;
    if (verdict !== "all") c++;
    if (dealerHostsFilter.length) c++;
    if (dealerSourceIdsFilter.length) c++;
    if (sourceFilter !== "all") c++;
    if (sellerTypeFilter !== "all") c++;
    if (minPrice !== "any") c++;
    if (minProfit !== "any") c++;
    if (minYear !== "any") c++;
    if (maxYear !== "any") c++;
    if (maxMileage !== "any") c++;
    if (titleType !== "all") c++;
    if (availability !== "all") c++;
    if (madeInUsa) c++;
    if (drivetrain !== "all") c++;
    if (minMileage !== "any") c++;
    if (damage !== "all") c++;
    if (body !== "all") c++;
    if (trim) c++;
    if (fuelType !== "all") c++;
    if (transmission !== "all") c++;
    if (keys !== "all") c++;
    if (buyNow) c++;
    return c;
  }, [
    verdict,
    dealerHostsFilter.length,
    dealerSourceIdsFilter.length,
    sourceFilter,
    sellerTypeFilter,
    minPrice,
    minProfit,
    minYear,
    maxYear,
    maxMileage,
    titleType,
    availability,
    madeInUsa,
    drivetrain,
    minMileage,
    damage,
    body,
    trim,
    fuelType,
    transmission,
    keys,
    buyNow,
  ]);

  const resetFilters = useCallback(() => {
    setSearch("");
    setSearchInput("");
    setState("all");
    setMake("all");
    setModel("all");
    setMaxPrice("any");
    setCategory("all");
    setVerdict("all");
    setDealerHostsFilter([]);
    setDealerSourceIdsFilter([]);
    setSourceFilter("all");
    setSellerTypeFilter("all");
    setMakesFilter([]);
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
    setMinMileage("any");
    setDamage("all");
    setBody("all");
    setTrim("");
    setFuelType("all");
    setTransmission("all");
    setKeys("all");
    setBuyNow(false);
    window.history.replaceState(null, "", "/scan?reset=1");
  }, []);

  const appliedFilters = [
    {
      label: "Search",
      value: search,
      clear: () => {
        setSearch("");
        setSearchInput("");
      },
    },
    { label: "State", value: state, clear: () => setState("all") },
    {
      label: "Make",
      value: make,
      clear: () => {
        setMake("all");
        setModel("all");
      },
    },
    {
      label: "Makes",
      value: makesFilter.join(", "),
      clear: () => setMakesFilter([]),
    },
    { label: "Model", value: model, clear: () => setModel("all") },
    { label: "Shown tag", value: category, clear: () => setCategory("all") },
    { label: "Min price", value: minPrice, clear: () => setMinPrice("any") },
    { label: "Max price", value: maxPrice, clear: () => setMaxPrice("any") },
    { label: "Year from", value: minYear, clear: () => setMinYear("any") },
    { label: "Year to", value: maxYear, clear: () => setMaxYear("any") },
    {
      label: "Min miles",
      value: minMileage,
      clear: () => setMinMileage("any"),
    },
    {
      label: "Max miles",
      value: maxMileage,
      clear: () => setMaxMileage("any"),
    },
    { label: "Lane", value: lane, clear: () => setLane("all") },
    {
      label: "Source",
      value: sourceFilter,
      clear: () => setSourceFilter("all"),
    },
    {
      label: "Seller",
      value: sellerTypeFilter,
      clear: () => setSellerTypeFilter("all"),
    },
    { label: "Title", value: titleType, clear: () => setTitleType("all") },
    {
      label: "Availability",
      value: availability,
      clear: () => setAvailability("all"),
    },
    {
      label: "Drivetrain",
      value: drivetrain,
      clear: () => setDrivetrain("all"),
    },
    { label: "Damage", value: damage, clear: () => setDamage("all") },
    { label: "Body", value: body, clear: () => setBody("all") },
    { label: "Trim", value: trim, clear: () => setTrim("") },
    { label: "Fuel", value: fuelType, clear: () => setFuelType("all") },
    { label: "Keys", value: keys, clear: () => setKeys("all") },
    {
      label: "Buying",
      value: buyNow ? "Buy now" : "",
      clear: () => setBuyNow(false),
    },
    {
      label: "Transmission",
      value: transmission,
      clear: () => setTransmission("all"),
    },
    {
      label: "Assembly",
      value: madeInUsa ? "USA" : "",
      clear: () => setMadeInUsa(false),
    },
    {
      label: "Dealers",
      value: dealerHostsFilter.join(", "),
      clear: () => setDealerHostsFilter([]),
    },
    {
      label: "Dealer sources",
      value: dealerSourceIdsFilter.join(", "),
      clear: () => setDealerSourceIdsFilter([]),
    },
    ...(flipDesk
      ? [
          { label: "Verdict", value: verdict, clear: () => setVerdict("all") },
          {
            label: "Min profit",
            value: minProfit,
            clear: () => setMinProfit("any"),
          },
        ]
      : []),
  ].filter((filter) => filter.value && !["all", "any"].includes(filter.value));

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
      verdict === "go"
        ? "BUY only"
        : verdict === "watch"
          ? "watch candidates"
          : null,
      laneLabel[lane] || lane,
      selectedStates || (state !== "all" ? state : "nationwide"),
      titleType !== "all" ? `${titleType} title` : null,
      make !== "all" ? make : null,
      make === "all" && makesFilter.length
        ? `makes: ${makesFilter.slice(0, 3).join(", ")}${
            makesFilter.length > 3 ? ` +${makesFilter.length - 3}` : ""
          }`
        : null,
      model !== "all" ? model : null,
      dealerHostsFilter.length
        ? `watched dealers: ${dealerHostsFilter.slice(0, 2).join(", ")}${
            dealerHostsFilter.length > 2
              ? ` +${dealerHostsFilter.length - 2}`
              : ""
          }`
        : null,
      dealerSourceIdsFilter.length
        ? `dealer sources: ${dealerSourceIdsFilter.slice(0, 2).join(", ")}${
            dealerSourceIdsFilter.length > 2
              ? ` +${dealerSourceIdsFilter.length - 2}`
              : ""
          }`
        : null,
      sellerTypeFilter !== "all" ? `${sellerTypeFilter} sellers` : null,
      maxPrice !== "any" ? `under ${formatMaxPriceFilter(maxPrice)}` : null,
    ].filter(Boolean);
    return `Searching ${parts.join(" · ")} · sorted by ${sort}`;
  }, [
    search,
    verdict,
    lane,
    state,
    selectedStates,
    titleType,
    make,
    makesFilter,
    model,
    dealerHostsFilter,
    dealerSourceIdsFilter,
    sellerTypeFilter,
    maxPrice,
    sort,
  ]);

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
        states: selectedStates || undefined,
        make: make !== "all" ? make : undefined,
        makes: make === "all" && makesFilter.length ? makesFilter : undefined,
        model: model !== "all" ? model : undefined,
        titleType: titleType !== "all" ? titleType : undefined,
        sellerType: sellerTypeFilter !== "all" ? sellerTypeFilter : undefined,
        maxPrice:
          maxPrice !== "any"
            ? Number(normalizeMaxPriceFilter(maxPrice))
            : undefined,
        minPrice:
          minPrice !== "any" ? Number(minPrice.replace("k", "000")) : undefined,
        minYear: minYear !== "any" ? Number(minYear) : undefined,
        maxMileage:
          maxMileage !== "any"
            ? Number(maxMileage.replace("k", "000"))
            : undefined,
        dealerHosts: dealerHostsFilter,
        dealerSourceIds: dealerSourceIdsFilter,
      }),
    [
      search,
      lane,
      state,
      selectedStates,
      make,
      makesFilter,
      model,
      titleType,
      maxPrice,
      minPrice,
      minYear,
      maxMileage,
      dealerHostsFilter,
      dealerSourceIdsFilter,
      sellerTypeFilter,
    ],
  );

  const previewSourcePlan = useCallback(async () => {
    const request = planRequests.current.start();
    setPlanPreviewing(true);
    setPlanMessage(null);
    setImportPlanProof(null);
    try {
      const res = await fetch("/api/scrape/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: smartPlan.scope,
          sourceIds:
            sourceFilter !== "all" ? [sourceFilter] : smartPlan.sourceIds,
        }),
        signal: request.signal,
      });
      const data = await res.json();
      if (!request.isCurrent()) return;
      if (!res.ok)
        throw new Error(
          "We couldn't prepare this source search. Please try again.",
        );
      setImportPlanProof(data as ScrapePlanResult);
      const runnable = Number(data?.summary?.runnable || 0);
      const heldBack = Number(data?.summary?.heldBack || 0);
      setPlanMessage(
        `Search plan: ${runnable} sources available; ${heldBack} unavailable for this search. Vehicle counts are known only after sources are checked.`,
      );
    } catch (error) {
      if (!request.isCurrent()) return;
      setPlanMessage(
        userFacingErrorMessage(
          error,
          "We couldn't prepare this source search. Please try again.",
        ),
      );
    } finally {
      if (request.isCurrent()) setPlanPreviewing(false);
      request.finish();
    }
  }, [smartPlan.scope, smartPlan.sourceIds, sourceFilter]);

  const fetchLivePreview = useCallback(async () => {
    const request = previewRequests.current.start();
    setLivePreviewing(true);
    setPlanMessage(null);
    try {
      const params = new URLSearchParams();
      if (smartPlan.scope.q) params.set("q", smartPlan.scope.q);
      if (smartPlan.scope.states?.length)
        params.set("states", smartPlan.scope.states.join(","));
      if (smartPlan.scope.lane)
        params.set("lane", String(smartPlan.scope.lane));
      if (smartPlan.scope.state) params.set("state", smartPlan.scope.state);
      if (smartPlan.scope.makes?.length)
        params.set("makes", smartPlan.scope.makes.join(","));
      if (smartPlan.scope.make) params.set("make", smartPlan.scope.make);
      if (smartPlan.scope.model) params.set("model", smartPlan.scope.model);
      if (smartPlan.scope.titleType)
        params.set("titleType", String(smartPlan.scope.titleType));
      if (smartPlan.scope.maxPrice)
        params.set("maxPrice", String(smartPlan.scope.maxPrice));
      if (smartPlan.scope.minYear)
        params.set("minYear", String(smartPlan.scope.minYear));
      if (maxYear !== "any") params.set("maxYear", maxYear);
      if (minMileage !== "any")
        params.set("minMileage", minMileage.replace("k", "000"));
      if (smartPlan.scope.maxMileage)
        params.set("maxMileage", String(smartPlan.scope.maxMileage));
      if (minPrice !== "any")
        params.set("minPrice", minPrice.replace("k", "000"));
      if (sourceFilter !== "all") params.set("source", sourceFilter);
      if (sellerTypeFilter !== "all")
        params.set("sellerType", sellerTypeFilter);
      if (dealerHostsFilter.length)
        params.set("dealers", dealerHostsFilter.join(","));
      if (dealerSourceIdsFilter.length)
        params.set("dealerSourceIds", dealerSourceIdsFilter.join(","));
      for (const [key, value] of Object.entries({
        damage,
        body,
        trim,
        fuelType,
        transmission,
        keys,
        availability,
        drivetrain,
        verdict,
        category,
        minProfit,
      })) {
        if (value !== "all" && value !== "any") params.set(key, value);
      }
      if (madeInUsa) params.set("madeInUsa", "1");
      if (buyNow) params.set("buyNow", "1");
      if (unsupportedPreviewFilters(params).length) {
        setPlanMessage(previewFilterMessage);
        return;
      }
      const res = await fetch(`/api/scan/live-preview?${params.toString()}`, {
        cache: "no-store",
        signal: request.signal,
      });
      const data = await res.json();
      if (!request.isCurrent()) return;
      if (!res.ok)
        throw new Error(
          "We couldn't preview matching vehicles. Please try again.",
        );
      setLivePreviewRows(data.vehicles || []);
      setLivePreviewProof(data.proof || []);
      setPlanMessage(data.message || "Live public preview loaded.");
    } catch (error) {
      if (!request.isCurrent()) return;
      setPlanMessage(
        userFacingErrorMessage(
          error,
          "We couldn't preview matching vehicles. Please try again.",
        ),
      );
    } finally {
      if (request.isCurrent()) setLivePreviewing(false);
      request.finish();
    }
  }, [
    smartPlan.scope,
    sourceFilter,
    sellerTypeFilter,
    minPrice,
    maxYear,
    minMileage,
    damage,
    body,
    trim,
    fuelType,
    transmission,
    keys,
    availability,
    drivetrain,
    verdict,
    category,
    minProfit,
    madeInUsa,
    buyNow,
    dealerHostsFilter,
    dealerSourceIdsFilter,
  ]);

  // Dynamic facets — only offer makes that have live inventory (in the selected state).
  const facetKey = useMemo(() => {
    const params = new URLSearchParams();
    if (state !== "all") params.set("state", state);
    if (selectedStates) params.set("states", selectedStates);
    if (lane !== "all") params.set("lane", lane);
    if (maxPrice !== "any")
      params.set("maxPrice", normalizeMaxPriceFilter(maxPrice));
    if (minPrice !== "any")
      params.set("minPrice", minPrice.replace("k", "000"));
    for (const [key, value] of Object.entries({
      q: search,
      source: sourceFilter,
      sellerType: sellerTypeFilter,
      titleType,
      availability,
      drivetrain,
      damage,
      body,
      trim,
      fuelType,
      transmission,
      keys,
      minYear,
      maxYear,
      minMileage,
      maxMileage,
    })) {
      if (value && value !== "all" && value !== "any")
        params.set(
          key,
          key === "minMileage" || key === "maxMileage"
            ? value.replace("k", "000")
            : value,
        );
    }
    if (madeInUsa) params.set("madeInUsa", "1");
    if (buyNow) params.set("buyNow", "1");
    if (dealerHostsFilter.length)
      params.set("dealers", dealerHostsFilter.join(","));
    if (dealerSourceIdsFilter.length)
      params.set("dealerSourceIds", dealerSourceIdsFilter.join(","));
    if (flipDesk && verdict !== "all") params.set("verdict", verdict);
    if (flipDesk && minProfit !== "any")
      params.set("minProfit", minProfit.replace("k", "000"));
    return `/api/scan/facets${params.toString() ? `?${params.toString()}` : ""}`;
  }, [
    state,
    selectedStates,
    lane,
    maxPrice,
    minPrice,
    search,
    sourceFilter,
    sellerTypeFilter,
    titleType,
    availability,
    drivetrain,
    damage,
    body,
    trim,
    fuelType,
    transmission,
    keys,
    buyNow,
    minYear,
    maxYear,
    minMileage,
    maxMileage,
    madeInUsa,
    dealerHostsFilter,
    dealerSourceIdsFilter,
    flipDesk,
    verdict,
    minProfit,
  ]);
  const { data: facets } = useSWR(facetKey, fetcher, {
    revalidateOnFocus: false,
  });
  const makeOptions = useMemo(() => {
    const opts = [{ value: "all", label: "Make: All" }];
    for (const m of facets?.makes ?? [])
      opts.push({ value: m.make, label: `${m.make} (${m.count})` });
    if (make !== "all" && !opts.some((option) => option.value === make))
      opts.push({ value: make, label: make });
    return opts;
  }, [facets, make]);

  // CASCADE: once a make is chosen, load its full model list (Copart-style make → model).
  const { data: modelFacets } = useSWR(
    make !== "all"
      ? `${facetKey}${facetKey.includes("?") ? "&" : "?"}make=${encodeURIComponent(make)}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const modelOptions = useMemo(() => {
    const opts = [{ value: "all", label: "Model: All" }];
    for (const m of modelFacets?.models ?? [])
      opts.push({ value: m.model, label: `${m.model} (${m.count})` });
    if (model !== "all" && !opts.some((option) => option.value === model))
      opts.push({ value: model, label: model });
    return opts;
  }, [modelFacets, model]);
  const sellerTypeOptions = useMemo(() => {
    const live = Array.isArray(facets?.sellerTypes)
      ? facets.sellerTypes
          .filter((item: any) => item?.value)
          .map((item: any) => ({
            value: String(item.value),
            label: `${item.label || item.value} (${Number(item.count || 0)})`,
          }))
      : [];
    return live.length
      ? [{ value: "all", label: "Seller: All live" }, ...live]
      : [
          { value: "all", label: "Seller: All" },
          { value: "dealer", label: "Dealers" },
          { value: "auction", label: "Auctions" },
          { value: "private", label: "Private sellers" },
        ];
  }, [facets?.sellerTypes]);
  const titleTypeOptions = useMemo(() => {
    const live = Array.isArray(facets?.titleTypes)
      ? facets.titleTypes
          .filter((item: any) => item?.value)
          .map((item: any) => ({
            value: String(item.value),
            label: `${item.label || item.value} (${Number(item.count || 0)})`,
          }))
      : [];
    return live.length
      ? [{ value: "all", label: "Title: All live" }, ...live]
      : [
          { value: "all", label: "Title: All" },
          { value: "clean", label: "Clean Title" },
          { value: "salvage", label: "Salvage Title" },
          { value: "rebuilt", label: "Rebuilt Title" },
        ];
  }, [facets?.titleTypes]);
  // Build SWR key from filters
  const swrKey = useMemo(() => {
    const params = new URLSearchParams({ sort });
    if (search) params.set("q", search);
    if (sourceFilter !== "all") params.set("source", sourceFilter);
    if (sellerTypeFilter !== "all") params.set("sellerType", sellerTypeFilter);
    if (titleType !== "all") params.set("titleType", titleType);
    if (lane !== "all") params.set("lane", lane);
    if (state !== "all") params.set("state", state);
    if (selectedStates) params.set("states", selectedStates);
    if (make !== "all") params.set("make", make);
    if (make === "all" && makesFilter.length)
      params.set("makes", makesFilter.join(","));
    if (model !== "all") params.set("model", model);
    if (category !== "all") params.set("category", category);
    if (minProfit !== "any")
      params.set("minProfit", minProfit.replace("k", "000"));
    if (maxPrice !== "any")
      params.set("maxPrice", normalizeMaxPriceFilter(maxPrice));
    if (minPrice !== "any")
      params.set("minPrice", minPrice.replace("k", "000"));
    if (minYear !== "any") params.set("minYear", minYear);
    if (maxYear !== "any") params.set("maxYear", maxYear);
    if (maxMileage !== "any")
      params.set("maxMileage", maxMileage.replace("k", "000"));
    if (minMileage !== "any")
      params.set("minMileage", minMileage.replace("k", "000"));
    for (const [key, value] of Object.entries({
      damage,
      body,
      trim,
      fuelType,
      transmission,
      keys,
    })) {
      if (value && value !== "all") params.set(key, value);
    }
    if (availability !== "all") params.set("availability", availability);
    if (verdict !== "all") params.set("verdict", verdict);
    if (dealerHostsFilter.length)
      params.set("dealers", dealerHostsFilter.join(","));
    if (dealerSourceIdsFilter.length)
      params.set("dealerSourceIds", dealerSourceIdsFilter.join(","));
    if (madeInUsa) params.set("madeInUsa", "1");
    if (buyNow) params.set("buyNow", "1");
    if (drivetrain !== "all") params.set("drivetrain", drivetrain);
    return `/api/scan?${params.toString()}`;
  }, [
    search,
    sourceFilter,
    sellerTypeFilter,
    titleType,
    lane,
    state,
    selectedStates,
    make,
    makesFilter,
    model,
    minProfit,
    maxPrice,
    minPrice,
    minYear,
    maxYear,
    maxMileage,
    availability,
    verdict,
    dealerHostsFilter,
    dealerSourceIdsFilter,
    madeInUsa,
    drivetrain,
    sort,
    category,
    minMileage,
    damage,
    body,
    trim,
    fuelType,
    transmission,
    keys,
    buyNow,
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
  const scrapeHealthKey = useMemo(() => {
    const params = new URLSearchParams();
    if (smartPlan.scope.lane) params.set("lane", String(smartPlan.scope.lane));
    if (smartPlan.scope.state) params.set("state", smartPlan.scope.state);
    if (smartPlan.scope.states?.length)
      params.set("states", smartPlan.scope.states.join(","));
    if (smartPlan.scope.q) params.set("q", smartPlan.scope.q);
    if (smartPlan.scope.makes?.length)
      params.set("makes", smartPlan.scope.makes.join(","));
    if (smartPlan.scope.make) params.set("make", smartPlan.scope.make);
    if (smartPlan.scope.model) params.set("model", smartPlan.scope.model);
    if (smartPlan.scope.sellerType)
      params.set("sellerType", String(smartPlan.scope.sellerType));
    if (smartPlan.scope.titleType)
      params.set("titleType", String(smartPlan.scope.titleType));
    if (smartPlan.scope.maxPrice)
      params.set("maxPrice", String(smartPlan.scope.maxPrice));
    if (minPrice !== "any")
      params.set("minPrice", minPrice.replace("k", "000"));
    if (dealerHostsFilter.length)
      params.set("dealers", dealerHostsFilter.join(","));
    if (dealerSourceIdsFilter.length)
      params.set("dealerSourceIds", dealerSourceIdsFilter.join(","));
    return `/api/scrape/health${params.toString() ? `?${params.toString()}` : ""}`;
  }, [
    smartPlan.scope.lane,
    smartPlan.scope.state,
    smartPlan.scope.states,
    smartPlan.scope.q,
    smartPlan.scope.makes,
    smartPlan.scope.make,
    smartPlan.scope.model,
    smartPlan.scope.sellerType,
    smartPlan.scope.titleType,
    smartPlan.scope.maxPrice,
    minPrice,
    dealerHostsFilter,
    dealerSourceIdsFilter,
  ]);
  const { data: scrapeHealth, mutate: mutateScrapeHealth } = useSWR(
    scrapeHealthKey,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    },
  );
  const sourceHealthById = useMemo(() => {
    return new Map(
      ((scrapeHealth?.sources || []) as SourceHealthItem[]).map((source) => [
        source.id,
        source,
      ]),
    );
  }, [scrapeHealth?.sources]);
  const resolveSourceHealth = useCallback(
    (vehicle: { source?: string; sourceUrl?: string }) => {
      const source = String(vehicle.source || "");
      const url = String(vehicle.sourceUrl || "").toLowerCase();
      if (sourceHealthById.has(source)) return sourceHealthById.get(source);
      if (source === "gov_auction") {
        if (url.includes("govdeals.com"))
          return sourceHealthById.get("govdeals");
        if (url.includes("publicsurplus"))
          return sourceHealthById.get("publicsurplus");
        if (url.includes("municibid")) return sourceHealthById.get("municibid");
        if (url.includes("gsa")) return sourceHealthById.get("gsa_auctions");
      }
      if (source === "independent_dealer") {
        const dealerSourceId = dealerSourceIdFromUrl(
          url,
          Array.from(sourceHealthById.keys()),
        );
        if (dealerSourceId) return sourceHealthById.get(dealerSourceId);
        return sourceHealthById.get("curated_dealers");
      }
      return undefined;
    },
    [sourceHealthById],
  );
  const selectedSourceIds = useMemo(
    () => (sourceFilter !== "all" ? [sourceFilter] : smartPlan.sourceIds),
    [sourceFilter, smartPlan.sourceIds],
  );
  const effectiveSmartPlan = useMemo(
    () => ({ ...smartPlan, sourceIds: selectedSourceIds }),
    [smartPlan, selectedSourceIds],
  );

  const sourceSearchKey = JSON.stringify({
    scope: smartPlan.scope,
    sourceIds: selectedSourceIds,
  });
  useEffect(() => {
    const runId = sourceRunId;
    const runController = sourceRunController;
    runId.current++;
    runController.current?.abort();
    setRunImporting(false);
    setPlanMessage(null);
    setImportRunProof([]);
    return () => {
      runId.current++;
      runController.current?.abort();
    };
  }, [sourceSearchKey]);

  const runMatchingSources = useCallback(async () => {
    const runId = ++sourceRunId.current;
    sourceRunController.current?.abort();
    const controller = new AbortController();
    sourceRunController.current = controller;
    setRunImporting(true);
    setPlanMessage(null);
    setImportRunProof([]);
    try {
      const res = await fetch("/api/scrape/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: smartPlan.scope,
          sourceIds: selectedSourceIds,
          concurrency: Math.min(2, Math.max(1, selectedSourceIds.length)),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (runId !== sourceRunId.current) return;
      if (!res.ok) {
        if (res.status === 424 && data?.code === "IMPORTS_LOCKED") {
          setImportPlanProof((current) => ({
            ...(current || {
              canImport: false,
              scraperControlReady: false,
              sources: Array.isArray(data.sources) ? data.sources : [],
              summary: {
                total: Number(data.summary?.total) || selectedSourceIds.length,
                runnable: Number(data.summary?.runnable) || 0,
                heldBack:
                  Number(data.summary?.heldBack) || selectedSourceIds.length,
                estimatedDealsPerRun:
                  Number(data.summary?.estimatedDealsPerRun) || 0,
              },
            }),
            canImport: false,
            scraperControlReady: false,
            dealerSourceIds: Array.isArray(data.dealerSourceIds)
              ? data.dealerSourceIds
              : current?.dealerSourceIds,
            sources: Array.isArray(data.sources)
              ? data.sources
              : current?.sources || [],
            summary: {
              total: Number(data.summary?.total) || selectedSourceIds.length,
              runnable: Number(data.summary?.runnable) || 0,
              heldBack:
                Number(data.summary?.heldBack) || selectedSourceIds.length,
              estimatedDealsPerRun:
                Number(data.summary?.estimatedDealsPerRun) || 0,
              firstBlocker:
                data.gates?.find?.(
                  (gate: ScrapePlanGate) => gate.status !== "ready",
                )?.nextStep ||
                current?.summary?.firstBlocker ||
                null,
            },
            gates: Array.isArray(data.gates) ? data.gates : [],
            message:
              data.message ||
              "Source searches are planned, but production connections are not ready yet.",
          }));
          throw new Error(
            data.message ||
              "Source searches are planned, but production connections are not ready yet.",
          );
        }
        if (res.status === 422 && data?.code === "NO_MATCHING_SOURCES") {
          setImportPlanProof({
            canImport: false,
            scraperControlReady: false,
            sourceIds: Array.isArray(data.sourceIds) ? data.sourceIds : [],
            requestedSourceIds: Array.isArray(data.requestedSourceIds)
              ? data.requestedSourceIds
              : selectedSourceIds,
            mismatchedSourceIds: Array.isArray(data.mismatchedSourceIds)
              ? data.mismatchedSourceIds
              : selectedSourceIds,
            dealerSourceIds: Array.isArray(data.dealerSourceIds)
              ? data.dealerSourceIds
              : undefined,
            sources: Array.isArray(data.sources) ? data.sources : [],
            gates: [],
            summary: {
              total: Number(data.summary?.total) || selectedSourceIds.length,
              runnable: Number(data.summary?.runnable) || 0,
              heldBack:
                Number(data.summary?.heldBack) || selectedSourceIds.length,
              estimatedDealsPerRun:
                Number(data.summary?.estimatedDealsPerRun) || 0,
              firstBlocker:
                data.message || "No selected source matches this buyer lane.",
            },
            message:
              data.message ||
              "No selected source matches this search. Try a different source or broaden your filters.",
          });
          throw new Error(
            data.message ||
              "No selected source matches this search. Try a different source or broaden your filters.",
          );
        }
        if (res.status === 401) {
          throw new Error(
            "This source refresh needs account access. Sign in and try again.",
          );
        }
        if (res.status === 503) {
          throw new Error(
            "This source refresh is not available right now. Existing matches remain available; try again later.",
          );
        }
        throw new Error(
          "We couldn't start this source search. Your existing matches remain available; try again later.",
        );
      }
      let completedData = data;
      if (data.queued && data.job?.id) {
        setPlanMessage(
          data.deduplicated
            ? "Your source search is already in progress. We'll show new matches when it finishes."
            : "Your source search is underway. We'll show new matches when it finishes.",
        );
        const job = await pollScopedScrapeJob(
          data.job.id,
          controller.signal,
          (message) => {
            if (runId === sourceRunId.current) setPlanMessage(message);
          },
        );
        if (runId !== sourceRunId.current || controller.signal.aborted) return;
        if (!job) {
          setPlanMessage(
            "We stopped waiting for this search, but it may still be running. Existing matches remain available; refresh results to check for new vehicles.",
          );
          return;
        }
        if (!job.result) {
          setPlanMessage(
            "The search ended, but its source results could not be verified. Refreshing available matches without claiming new inventory.",
          );
          mutate();
          mutateScrapeHealth();
          return;
        }
        completedData = job.result;
      }
      if (runId !== sourceRunId.current) return;
      const runResults = Array.isArray(completedData.results)
        ? completedData.results
        : [];
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
        `Source search finished: ${completedData.successful || 0} of ${completedData.total || 0} sources checked successfully; ${completedData.totalDeals || 0} listings found.`,
      );
      mutate();
      mutateScrapeHealth();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (runId !== sourceRunId.current) return;
      setPlanMessage(
        error instanceof TypeError || error instanceof SyntaxError
          ? "We couldn't connect to check this search. It may still be running; existing matches remain available."
          : error instanceof Error
            ? error.message
            : "Could not run matching sources.",
      );
    } finally {
      if (runId === sourceRunId.current) setRunImporting(false);
    }
  }, [smartPlan.scope, selectedSourceIds, mutate, mutateScrapeHealth]);

  // Client-driven infinite scroll: SWR fetches page 0; "load more" APPENDS further pages so the grid
  // surfaces ALL matching inventory, not just the first screen. `extra` resets when the filter key changes.
  const [extra, setExtra] = useState<any[]>([]);
  const [morePage, setMorePage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  useEffect(() => {
    const plans = planRequests.current;
    const previews = previewRequests.current;
    const pages = pageRequests.current;
    plans.cancel();
    previews.cancel();
    pages.cancel();
    setPlanPreviewing(false);
    setLivePreviewing(false);
    setLoadingMore(false);
    setLoadMoreError(null);
    setPlanMessage(null);
    setExtra([]);
    setMorePage(0);
    setLivePreviewRows([]);
    setLivePreviewProof([]);
    setImportRunProof([]);
    setImportPlanProof(null);
    autoPreviewKeyRef.current = null;
    return () => {
      plans.cancel();
      previews.cancel();
      pages.cancel();
    };
  }, [swrKey, sourceSearchKey]);

  // Derive state from SWR + the appended pages.
  const results = useMemo(
    () =>
      [...(swrData?.vehicles || []), ...livePreviewRows, ...extra].map(
        mapDealToResult,
      ),
    [swrData, livePreviewRows, extra],
  );
  const total = (swrData?.total || 0) + livePreviewRows.length;
  // /api/scan strips profit / max bid unless the caller's SAVED desk is reseller/dealer. A flip
  // intent from ?mode= or a guest cookie can disagree; then the rows carry no economics, so show
  // the price-first result view instead of "$0 net" / "no positive spread" on every row.
  const flipEconomics = flipDesk && swrData?.deskAccess !== "personal";
  // Treat "no response yet" as loading too: on the SSR pass and the first client tick SWR reports
  // isLoading=false with no data, which painted the empty state and "0 · never" for seconds.
  const loading = swrLoading || (swrData === undefined && !swrError);
  const scanConfigured =
    swrData?.configured === false ? false : isSupabaseConfigured();
  const swrPreviewRows =
    swrData?.configured === false &&
    swrData?.isLivePreview &&
    (swrData?.vehicles?.length || 0) > 0;
  const displayProof =
    livePreviewProof.length > 0
      ? livePreviewProof
      : Array.isArray(swrData?.previewProof)
        ? swrData.previewProof
        : [];
  const displayMessage = planMessage || swrData?.message || null;

  useEffect(() => {
    if (
      scanConfigured ||
      swrLoading ||
      swrPreviewRows ||
      livePreviewing ||
      livePreviewRows.length
    )
      return;
    const publicPreviewSourceIds = new Set([
      "copart",
      "govdeals",
      "publicsurplus",
      "municibid",
    ]);
    const canPublicPreview =
      sourceFilter !== "all"
        ? publicPreviewSourceIds.has(sourceFilter)
        : smartPlan.sourceIds.some((sourceId) =>
            publicPreviewSourceIds.has(sourceId),
          );
    if (!canPublicPreview) return;
    const key = JSON.stringify({ scope: smartPlan.scope, sourceFilter });
    if (autoPreviewKeyRef.current === key) return;
    autoPreviewKeyRef.current = key;
    fetchLivePreview();
  }, [
    scanConfigured,
    swrLoading,
    swrPreviewRows,
    livePreviewing,
    livePreviewRows.length,
    smartPlan.sourceIds,
    smartPlan.scope,
    sourceFilter,
    fetchLivePreview,
  ]);
  const hasMore = !loading && !!swrKey && results.length < total;
  const loadMore = useCallback(async () => {
    if (!swrKey || loadingMore || !hasMore) return;
    const request = pageRequests.current.start();
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = morePage + 1;
      const response = await fetch(`${swrKey}&page=${next}`, {
        signal: request.signal,
      });
      const res = await response.json();
      if (!request.isCurrent()) return;
      if (!response.ok || !Array.isArray(res?.vehicles))
        throw new Error("Could not load more vehicles");
      const v = res.vehicles;
      if (v.length) {
        setExtra((prev) => [...prev, ...v]);
        setMorePage(next);
      } else {
        setLoadMoreError(
          "No more vehicles were returned. The available inventory may have changed; refresh your search to check.",
        );
      }
    } catch {
      if (request.isCurrent())
        setLoadMoreError(
          "We couldn't load more vehicles. Your current results are still available. Try again.",
        );
    } finally {
      if (request.isCurrent()) setLoadingMore(false);
      request.finish();
    }
  }, [swrKey, loadingMore, hasMore, morePage]);

  // Auto-load the next page when the sentinel scrolls into view (top-app infinite scroll).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || loadMoreError) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, loadMoreError]);
  const error = swrError?.message || swrData?.error || null;
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

  const saveCurrentScanAsAlert = useCallback(() => {
    const nameParts = [
      search || null,
      make !== "all"
        ? make
        : makesFilter.length
          ? makesFilter.slice(0, 2).join("/")
          : null,
      model !== "all" ? model : null,
      lane !== "all" ? lane.replace(/-/g, " ") : null,
      state !== "all" ? state : null,
      minPrice !== "any"
        ? `over $${Number(minPrice.replace("k", "000")).toLocaleString()}`
        : null,
      maxPrice !== "any" ? `under ${formatMaxPriceFilter(maxPrice)}` : null,
    ].filter(Boolean);
    const saved = saveLocalSavedSearch({
      name: nameParts.length ? nameParts.join(" · ") : "Scan alert",
      scan_params: swrKey.split("?")[1],
      q: search || null,
      make: make !== "all" ? make : null,
      makes: make === "all" && makesFilter.length ? makesFilter : null,
      model: model !== "all" ? model : null,
      state: state !== "all" ? state : null,
      lane: lane !== "all" ? lane : null,
      seller_type: sellerTypeFilter !== "all" ? sellerTypeFilter : null,
      title_type: titleType !== "all" ? titleType : null,
      dealer_hosts: dealerHostsFilter.length ? dealerHostsFilter : null,
      dealer_source_ids: dealerSourceIdsFilter.length
        ? dealerSourceIdsFilter
        : null,
      min_year: minYear !== "any" ? Number(minYear) : null,
      max_year: maxYear !== "any" ? Number(maxYear) : null,
      min_price:
        minPrice !== "any" ? Number(minPrice.replace("k", "000")) : null,
      max_price:
        maxPrice !== "any" ? Number(normalizeMaxPriceFilter(maxPrice)) : null,
      target_profit:
        minProfit !== "any" ? Number(minProfit.replace("k", "000")) : null,
      require_go: verdict === "go",
      notify_email: false,
      notify_sms: false,
      is_active: true,
    });
    addToast(`Saved alert scope: ${saved.name}`, "success");
  }, [
    search,
    make,
    makesFilter,
    model,
    lane,
    state,
    minPrice,
    maxPrice,
    sellerTypeFilter,
    titleType,
    minYear,
    maxYear,
    minProfit,
    verdict,
    dealerHostsFilter,
    dealerSourceIdsFilter,
    addToast,
    swrKey,
  ]);

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

  // Live pill: count fresh arrivals since the user last looked; tapping refreshes.
  const [newCount, setNewCount] = useState(0);
  const clearNew = useCallback(() => {
    setNewCount(0);
    mutate();
  }, [mutate]);

  // Realtime subscription (active rows only — dead/inactive writes never reach the UI)
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const supabase = createClientComponentClient();
    const channel = supabase
      .channel("scan-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "deals",
          filter: "active=eq.true",
        },
        (payload) => {
          const d = payload.new;
          if (
            isAuctionChannel(d.source) &&
            !wantsAuctionInventory({
              lane,
              sellerType: sellerTypeFilter,
              sources: [sourceFilter],
            })
          )
            return;
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
          setNewCount((n) => n + 1);
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
  }, [state, sourceFilter, sellerTypeFilter, lane, sort, addToast, mutate]);

  // Client-side filtering + sorting with useMemo (instant, no re-fetch).
  // The API ignores `sort`, so the sort control is honored here.
  const filteredResults = useMemo(() => {
    let list = results;
    if (search) {
      list = list.filter((r: ScanResult) => matchesVehicleQuery(r, search));
    }
    if (category !== "all") {
      list = list.filter((r: ScanResult) =>
        carCategories(r as CarLike).includes(category),
      );
    }
    const sorted = [...list];
    if (sort === "score") {
      sorted.sort(
        (a, b) =>
          (b.trustExplanation?.score ?? b.profitScore ?? 0) -
          (a.trustExplanation?.score ?? a.profitScore ?? 0),
      );
    } else if (sort === "price") {
      sorted.sort((a, b) => (a.askPrice ?? 0) - (b.askPrice ?? 0));
    } else {
      // default: profit (descending)
      sorted.sort((a, b) => (b.profitEstimate ?? 0) - (a.profitEstimate ?? 0));
    }
    return sorted;
  }, [results, search, sort, category]);

  const tableSourceHealthById = useMemo(() => {
    const map = new Map(sourceHealthById);
    for (const row of filteredResults as ScanResult[]) {
      const health = resolveSourceHealth(row);
      if (health) map.set(row.source, health);
    }
    return map;
  }, [sourceHealthById, filteredResults, resolveSourceHealth]);

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
    const liveSources = Array.isArray(facets?.sources) ? facets.sources : [];
    liveSources.forEach((s: any) =>
      opts.push({
        value: String(s.value),
        label: `${s.label || s.value} (${Number(s.count || 0)})`,
      }),
    );
    const seen = new Set(opts.map((option) => option.value));
    ALL_VEHICLE_SOURCES.slice(0, 20).forEach((s) => {
      if (seen.has(s.id)) return;
      opts.push({ value: s.id, label: s.name });
      seen.add(s.id);
    });
    return opts;
  }, [facets?.sources]);

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
      <div className="flex flex-wrap items-center gap-2 md:sticky md:top-4 md:z-20">
        {newCount > 0 && (
          <button
            onClick={clearNew}
            className="w-full shrink-0 rounded-full px-4 py-2 text-sm font-semibold animate-pulse sm:w-auto"
            style={{ background: "var(--amber)", color: "#111" }}
            aria-live="polite"
          >
            {newCount} new — tap to refresh
          </button>
        )}
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
          aria-label={
            loading ? "Updating saved inventory" : "Search saved inventory"
          }
          title="Search saved inventory"
          className="flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-lg px-3 font-bold text-white transition-all disabled:opacity-50 border-none sm:px-5"
          style={{ background: "var(--grad)" }}
        >
          {loading ? (
            <>
              <span
                className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                style={{ animation: "spin 700ms linear infinite" }}
              />
              <span className="hidden sm:inline">
                Updating saved inventory…
              </span>
            </>
          ) : (
            <>
              <Ico name="scan" size={16} />
              <span className="hidden sm:inline">Search saved inventory</span>
            </>
          )}
        </button>
        {flipDesk && (
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
        )}
      </div>

      {/* ── Status strip ── */}
      <StatusStrip
        loading={loading}
        error={error}
        total={total}
        results={results}
        lastScan={lastScan}
        hasData={swrData !== undefined}
      />

      <div className="text-xs leading-relaxed text-[var(--t3)]">
        {searchSummary}
      </div>

      {isAdmin && isFreshImportReview && (
        <div className="rounded-[var(--r3)] border border-[var(--gbd)] bg-[var(--glo)] px-4 py-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--green)]">
            Fresh search review
          </div>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--t2)]">
            Showing proof-ranked matches from your selected buyer scope first.
            Open each card&apos;s trust proof before bidding: VIN, mileage,
            auction timing, seller path, source freshness, and buyer math.
          </p>
        </div>
      )}

      {isAdmin ? (
        <details className="border-b border-[var(--b1)] pb-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--t3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
            Source operations
          </summary>
          <SmartDataPlanCard
            configured={scanConfigured}
            total={total}
            plan={effectiveSmartPlan}
            onPreview={previewSourcePlan}
            onRun={runMatchingSources}
            onLivePreview={fetchLivePreview}
            previewing={planPreviewing}
            running={runImporting}
            livePreviewing={livePreviewing}
            showingPreview={
              !scanConfigured && (livePreviewRows.length > 0 || swrPreviewRows)
            }
            proof={displayProof}
            importRun={importRunProof}
            importPlan={importPlanProof}
            readinessItems={systemStatus?.readiness?.items || []}
            sourceHealth={scrapeHealth?.sources || []}
            scopeStatus={scrapeHealth?.scopeStatus || null}
            message={displayMessage}
          />
          <ScopeQualityPanel
            results={filteredResults}
            sourceHealthById={tableSourceHealthById}
          />
        </details>
      ) : (
        <button
          type="button"
          onClick={runMatchingSources}
          disabled={runImporting}
          className="inline-flex w-fit items-center gap-2 rounded-[var(--r2)] border border-[var(--b1)] px-4 py-2 text-sm font-semibold text-[var(--t2)]"
        >
          <Ico name="refresh" size={16} />
          {runImporting ? "Looking for new matches..." : "Find new matches"}
        </button>
      )}

      {!isAdmin && displayMessage && (
        <p role="status" className="text-sm text-[var(--t3)]">
          {runImporting
            ? "Checking your selected sources for matching vehicles."
            : "Search update finished. Review the matches below, or try again if a source could not be reached."}
        </p>
      )}

      {/* ── Filter bar: primary row + grouped advanced panel ── */}
      <details className="glass-panel px-4 py-3 space-y-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--t2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
          Filters &amp; view
          {appliedFilters.length ? ` (${appliedFilters.length} applied)` : ""}
        </summary>
        {appliedFilters.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="Applied filters"
          >
            {appliedFilters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={filter.clear}
                aria-label={`Remove ${filter.label} filter`}
                className="flex min-h-11 max-w-full items-center gap-2 rounded-[var(--r2)] border border-[var(--b2)] px-3 text-xs text-[var(--t2)]"
              >
                <span className="break-words">
                  {filter.label}: {filter.value}
                </span>
                <X className="h-3 w-3 shrink-0" aria-hidden="true" />
              </button>
            ))}
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-11 px-3 text-xs font-bold text-[var(--t2)]"
            >
              Clear all
            </button>
          </div>
        )}
        {/* PRIMARY: the dealer's most-used controls, always visible */}
        <div className="flex flex-wrap items-center gap-2">
          {/* GO-only — the #1 filter */}
          {flipDesk && (
            <>
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
              <button
                type="button"
                onClick={() =>
                  setVerdict((v) => (v === "watch" ? "all" : "watch"))
                }
                className="px-3 py-1.5 rounded-[var(--r2)] text-xs font-bold border transition-colors shrink-0"
                style={{
                  background:
                    verdict === "watch" ? "var(--amber-lo)" : "var(--s0)",
                  color: verdict === "watch" ? "var(--amber-d)" : "var(--t3)",
                  borderColor:
                    verdict === "watch" ? "var(--amber-bd)" : "var(--b2)",
                }}
                title="Show serious watch candidates closest to profitable"
              >
                Watch queue
              </button>
            </>
          )}
          <FilterSelect
            label="Make"
            value={make}
            onChange={(value) => {
              setMake(value);
              setModel("all");
              setMakesFilter([]);
            }}
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
          <RangeInput
            label="Max Price"
            value={maxPrice}
            onChange={setMaxPrice}
          />
          <FilterSelect
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              // Profit sort is a flip-desk tool; keep it listed if a URL already picked it.
              ...(flipDesk || sort === "profit"
                ? [{ value: "profit", label: "Sort: Profit ↓" }]
                : []),
              { value: "score", label: "Sort: Score ↓" },
              { value: "price", label: "Sort: Price ↑" },
              { value: "price-desc", label: "Sort: Price ↓" },
              { value: "newest", label: "Sort: Newly listed" },
              { value: "year", label: "Sort: Newest year" },
              { value: "mileage", label: "Sort: Lowest mileage" },
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
          {flipDesk && (
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
          )}
          <button
            type="button"
            onClick={saveCurrentScanAsAlert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r2)] text-xs font-bold border transition-all shrink-0 shadow-sm hover:-translate-y-0.5"
            style={{
              background: "var(--s0)",
              color: "var(--t2)",
              borderColor: "var(--b2)",
            }}
            title="Save this exact Scan scope as a local alert"
          >
            <Ico name="bell" size={12} />
            Save alert
          </button>
          <button
            type="button"
            aria-label="Copy search link"
            title="Copy search link"
            onClick={async () => {
              try {
                const params = new URLSearchParams(swrKey.split("?")[1]);
                params.set("reset", "1");
                await navigator.clipboard.writeText(
                  `${window.location.origin}/scan?${params.toString()}`,
                );
                addToast("Search link copied", "success");
              } catch {
                addToast("Could not copy the search link", "error");
              }
            }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--r2)] border border-[var(--b2)] text-[var(--t2)]"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Results count + density */}
          {!loading && (
            <div className="ml-auto flex items-center gap-3 shrink-0">
              <span className="text-xs text-[var(--t3)] font-mono">
                {filteredResults.length} shown / {total.toLocaleString()}{" "}
                matching
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
                label="Seller Type"
                value={sellerTypeFilter}
                onChange={setSellerTypeFilter}
                options={sellerTypeOptions}
              />
              <FilterSelect
                label="Source"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={sourceOptions}
              />
            </FilterGroup>

            <FilterGroup label={flipDesk ? "Price & profit" : "Price"}>
              <RangeInput
                label="Min Price"
                value={minPrice}
                onChange={setMinPrice}
              />
              {flipDesk && (
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
              )}
            </FilterGroup>

            <FilterGroup label="Year">
              <RangeInput
                label="Year from"
                value={minYear}
                onChange={setMinYear}
              />
              <RangeInput
                label="Year to"
                value={maxYear}
                onChange={setMaxYear}
              />
            </FilterGroup>

            <FilterGroup label="Condition">
              <RangeInput
                label="Min Miles"
                value={minMileage}
                onChange={setMinMileage}
              />
              <RangeInput
                label="Max Miles"
                value={maxMileage}
                onChange={setMaxMileage}
              />
              <FilterSelect
                label="Title Type"
                value={titleType}
                onChange={setTitleType}
                options={titleTypeOptions}
              />
              <FilterSelect
                label="Damage"
                value={damage}
                onChange={setDamage}
                options={[
                  { value: "all", label: "Damage: All" },
                  ...[
                    "Front",
                    "Rear",
                    "Side",
                    "Hail",
                    "Flood",
                    "Fire",
                    "Mechanical",
                  ].map((value) => ({
                    value: value.toLowerCase(),
                    label: value,
                  })),
                ]}
              />
              <FilterSelect
                label="Body style"
                value={body}
                onChange={setBody}
                options={[
                  { value: "all", label: "Body: All" },
                  ...[
                    "SUV",
                    "Sedan",
                    "Pickup",
                    "Coupe",
                    "Convertible",
                    "Van",
                    "Wagon",
                  ].map((value) => ({ value, label: value })),
                ]}
              />
              <FilterSelect
                label="Fuel"
                value={fuelType}
                onChange={setFuelType}
                options={[
                  { value: "all", label: "Fuel: All" },
                  ...["Gas", "Diesel", "Hybrid", "Electric"].map((value) => ({
                    value,
                    label: value,
                  })),
                ]}
              />
              <FilterSelect
                label="Transmission"
                value={transmission}
                onChange={setTransmission}
                options={[
                  { value: "all", label: "Transmission: All" },
                  ...["Automatic", "Manual"].map((value) => ({
                    value,
                    label: value,
                  })),
                ]}
              />
              <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--t3)]">
                Trim
                <input
                  aria-label="Trim"
                  value={trim}
                  onChange={(event) => setTrim(event.target.value)}
                  maxLength={60}
                  className="min-h-11 w-36 max-w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 text-sm text-[var(--t1)]"
                />
              </label>
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
                label="Keys"
                value={keys}
                onChange={setKeys}
                options={[
                  { value: "all", label: "Keys: All" },
                  { value: "yes", label: "Keys reported present" },
                  { value: "no", label: "Keys reported absent" },
                  { value: "unknown", label: "Keys not reported" },
                ]}
              />
              <label className="flex min-h-11 items-center gap-2 px-2 text-xs font-semibold text-[var(--t2)]">
                <input
                  type="checkbox"
                  checked={buyNow}
                  onChange={(event) => setBuyNow(event.target.checked)}
                />{" "}
                Buy now available
              </label>
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
      </details>

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

      {isAdmin && !loading && !error && filteredResults.length > 0 && (
        <details className="border-b border-[var(--b1)] pb-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--t3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
            Inventory diagnostics
          </summary>
          <ScanReviewStrip
            results={filteredResults as ScanResult[]}
            sourceHealthById={tableSourceHealthById}
            href={scanPageHrefFromApiKey(swrKey, `/scan?sort=${sort}`)}
            flipDesk={flipEconomics}
          />
        </details>
      )}

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
        <EmptyState
          onRetry={() => mutate()}
          sourceHealth={scrapeHealth?.sources || []}
          broadHref={`/scan?${new URLSearchParams({
            ...(lane && lane !== "all" ? { lane } : {}),
            sort: "profit",
          }).toString()}`}
        />
      )}

      {!loading && !error && filteredResults.length > 0 && view === "table" && (
        <DealTable
          rows={filteredResults as any}
          sourceHealthById={tableSourceHealthById}
          flipDesk={flipEconomics}
        />
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
                flipDesk={flipEconomics}
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
                titleType={car.titleType}
                dealVerdict={car.dealVerdict}
                recommendedMaxBid={car.recommendedMaxBid}
                sellEstimate={car.sellEstimate}
                sellBasis={car.sellBasis}
                valuation={car.valuation}
                soldAnchored={car.soldAnchored}
                repairEstimate={car.repairEstimate}
                transportEstimate={car.transportEstimate}
                warnings={car.warnings}
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
                sellerPhone={car.sellerPhone}
                sellerEmail={car.sellerEmail}
                sellerContactUrl={car.sellerContactUrl}
                dataQuality={car.dataQuality}
                trustExplanation={car.trustExplanation}
                sourceHealth={resolveSourceHealth(car)}
                isSaved={localSaved.has(car.id)}
                onSave={async () => {
                  if (localSaved.has(car.id)) {
                    localSaved.remove(car.id);
                    addToast("Vehicle removed from local watchlist", "info");
                    return;
                  }
                  let cloudSynced = false;
                  let alreadyCloudSaved = false;
                  try {
                    const res = await fetch("/api/saved-cars", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        dealId: car.id,
                        snapshot: {
                          dataQuality: car.dataQuality,
                          trustExplanation: car.trustExplanation,
                        },
                      }),
                    });
                    cloudSynced = res.ok;
                    alreadyCloudSaved = res.status === 409;
                  } catch {
                    cloudSynced = false;
                  }
                  localSaved.save({
                    id: car.id,
                    title:
                      `${car.year || ""} ${car.make || ""} ${car.model || ""}`.trim() ||
                      "Saved vehicle",
                    year: car.year,
                    make: car.make,
                    model: car.model,
                    vin: car.vin,
                    mileage: car.mileage,
                    askPrice: car.askPrice,
                    estimatedProfit: car.profitEstimate,
                    sellEstimate: car.sellEstimate,
                    recommendedMaxBid: car.recommendedMaxBid,
                    repairEstimate: car.repairEstimate,
                    transportEstimate: car.transportEstimate,
                    source: car.source,
                    sourceUrl: car.sourceUrl,
                    seller: car.seller,
                    sellerType: car.sellerType,
                    sellerPhone: car.sellerPhone,
                    sellerEmail: car.sellerEmail,
                    sellerContactUrl: car.sellerContactUrl,
                    image: car.imageUrl,
                    locationCity: car.locationCity,
                    locationState: car.locationState,
                    dataQuality: car.dataQuality,
                    trustExplanation: car.trustExplanation,
                    firstSeenAt:
                      typeof car.firstSeenAt === "string"
                        ? car.firstSeenAt
                        : car.firstSeenAt?.toISOString(),
                    lastSeenAt:
                      typeof car.lastSeenAt === "string"
                        ? car.lastSeenAt
                        : car.lastSeenAt?.toISOString(),
                    savedAt: new Date().toISOString(),
                  });
                  addToast(
                    cloudSynced
                      ? "Watching with cloud alerts and a local backup."
                      : alreadyCloudSaved
                        ? "Already watching in cloud; local backup refreshed."
                        : "Watching locally. Sign in when Google OAuth is ready to sync alerts.",
                    "success",
                  );
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Infinite scroll — auto-append more inventory as you near the bottom (grid + table views). */}
      {!loading && !error && hasMore && (
        <div
          ref={sentinelRef}
          className="flex flex-col items-center gap-3 py-8"
        >
          {loadMoreError && (
            <p
              role="status"
              className="max-w-lg text-center text-sm text-[var(--t2)]"
            >
              {loadMoreError}
            </p>
          )}
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-5 py-2.5 rounded-full text-sm font-bold border border-[var(--b2)] text-[var(--t2)] hover:border-[var(--b3)] transition-colors disabled:opacity-50"
          >
            {loadingMore
              ? "Loading…"
              : loadMoreError
                ? "Try loading more again"
                : `Load more — ${(total - results.length).toLocaleString()} more`}
          </button>
        </div>
      )}

      {/* Toasts */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <LaneModeHUD
        isOpen={flipDesk && isLaneModeOpen}
        onClose={() => setIsLaneModeOpen(false)}
      />

      {flipDesk && isSimulatorOpen && (
        <ProfitSimulatorDrawer
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
        />
      )}
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
