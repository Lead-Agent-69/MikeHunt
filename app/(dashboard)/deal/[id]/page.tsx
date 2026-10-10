"use client";

import React, { useEffect } from "react";
import { recordRecent } from "@/hooks/useRecentlyViewed";
import { useLocalSavedVehicles } from "@/hooks/useLocalSavedVehicles";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowUpRight,
  BadgeDollarSign,
  FileText,
  Gauge,
  RotateCcw,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useDealStore } from "@/lib/store/dealStore";
import { usePreferences } from "@/hooks/usePreferences";
import { effectiveHome } from "@/lib/preferences/locations";
import { readLocalBuyerIntent } from "@/hooks/useBuyerIntent";
import { userTypeFromSavedBuyerMode } from "@/lib/buyer/saved-buyer-mode";
import { buyTerm, isAuctionSource } from "@/lib/deal-terms";
import { SourceBadge } from "@/components/shared/SourceBadge";
import {
  isSourceLandingPage,
  sourceLinkLabel,
} from "@/lib/sources/listing-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  DealFetchError,
  classifyDealLoadError,
  dealLoadErrorCopy,
} from "@/lib/deals/deal-load-error";
import { Button } from "@/components/ui/button";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";
import { useDealerId } from "@/hooks/useDealerId";
import { SimilarInterestPrompt } from "@/components/reco/SimilarInterestPrompt";
import { useDealDwellSignal } from "@/hooks/useDealDwellSignal";
import { Skeleton } from "@/components/shared/Skeleton";
import { MaxBidWidget } from "@/components/deal/MaxBidWidget";
import { ValuationBreakdown } from "@/components/deal/ValuationBreakdown";
import { ForecastPanel } from "@/components/deal/ForecastPanel";
import { ScoreBreakdown } from "@/components/deal/ScoreBreakdown";
import { PriceSparkline } from "@/components/deal/PriceSparkline";
import { SimilarDeals } from "@/components/deal/SimilarDeals";
import { FindSimilarModal } from "@/components/saved/FindSimilarModal";
import { MarketTiming } from "@/components/deal/MarketTiming";
import { AIBrief } from "@/components/deal/AIBrief";
import { DealIQCard } from "@/components/deal/DealIQCard";
import { LogOutcome } from "@/components/deal/LogOutcome";
import { DealEconomics } from "@/components/deal/DealEconomics";
import { RecentlySold } from "@/components/deal/RecentlySold";
import { VinHistory } from "@/components/deal/VinHistory";
import { ContactSeller } from "@/components/deal/ContactSeller";
import { DealNotes } from "@/components/deal/DealNotes";
import { ImageGallery } from "@/components/shared/ImageGallery";
import { PriceMilesScatter } from "@/components/deal/PriceMilesScatter";
import { BestTimeToBuy } from "@/components/deal/BestTimeToBuy";
import { MarketContext } from "@/components/deal/MarketContext";
import { PriceTimeline } from "@/components/deal/PriceTimeline";
import { VehicleSpecs } from "@/components/deal/VehicleSpecs";
import { VehicleSummary } from "@/components/deal/VehicleSummary";
import useDealerDefaults from "@/hooks/useDealerDefaults";
import { estimateTeardownValue } from "@/lib/intelligence/teardown";
import {
  SortableWidgetGrid,
  type WidgetItem,
} from "@/components/deal/SortableWidgetGrid";
import { VisionDamageInspector } from "@/components/deal/VisionDamageInspector";
import { AutonomousSellerNegotiator } from "@/components/deal/AutonomousSellerNegotiator";
import { FreightAndTaxCalculator } from "@/components/deal/FreightAndTaxCalculator";
import { TitleWashDetector } from "@/components/deal/TitleWashDetector";
import { MaxBidCalculator } from "@/components/shared/MaxBidCalculator";
import { FloorPlanCalculator } from "@/components/deal/FloorPlanCalculator";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";
import { CashOfferLetterModal } from "@/components/deal/CashOfferLetterModal";
import { fieldLabel, gradeDataQuality } from "@/lib/data-quality";
import { dealCardCopy } from "@/lib/deals/deal-card-copy";
import {
  detailValuationConfidence,
  listingChecklistFields,
  sourceReadinessFallback,
} from "@/lib/deals/detail-readiness";
import { listingFreshnessLabel } from "@/lib/deals/listing-freshness";

type SourceHealthItem = {
  id: string;
  readiness?: string;
  userStatus?: string;
  activeRows?: number;
  rowsWithPhotos?: number;
  photoCoveragePct?: number;
  averageQuality?: number;
  qualityLabel?: string | null;
  freshnessHours?: number | null;
  lastSeenAt?: string | null;
  nextAction?: string | null;
};

function hostFromUrl(value?: string | null) {
  if (!value) return "";
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function sourceHealthIdForDeal(deal: any, sources: SourceHealthItem[]) {
  const source = String(deal?.source || "");
  const url = String(deal?.sourceUrl || "").toLowerCase();
  const ids = new Set(sources.map((item) => item.id));
  if (ids.has(source)) return source;
  if (source === "gov_auction") {
    if (url.includes("govdeals.com") && ids.has("govdeals")) return "govdeals";
    if (url.includes("publicsurplus") && ids.has("publicsurplus"))
      return "publicsurplus";
    if (url.includes("municibid") && ids.has("municibid")) return "municibid";
    if (url.includes("gsa") && ids.has("gsa_auctions")) return "gsa_auctions";
  }
  if (source === "independent_dealer") {
    if (url.includes("aeofmiami.com") && ids.has("ae-of-miami"))
      return "ae-of-miami";
    if (
      (url.includes("stjamesauto.com") ||
        url.includes("stjamesautoparts.com")) &&
      ids.has("stjames-auto")
    )
      return "stjames-auto";
    if (url.includes("dgautollc.com") && ids.has("dg-auto")) return "dg-auto";
    if (url.includes("recar.com") && ids.has("recar")) return "recar";
    if (url.includes("damage.com") && ids.has("damage-com"))
      return "damage-com";
    if (url.includes("casmiami.com") && ids.has("cas-miami"))
      return "cas-miami";
    if (url.includes("salvagezone.com") && ids.has("salvagezone"))
      return "salvagezone";
    if (url.includes("rebuiltauto.com") && ids.has("rebuilt-auto"))
      return "rebuilt-auto";
    if (url.includes("alpineautogallery.com") && ids.has("alpine-auto"))
      return "alpine-auto";
    if (url.includes("replicaauto.com") && ids.has("replica-auto"))
      return "replica-auto";
    if (ids.has("curated_dealers")) return "curated_dealers";
  }
  return "";
}

function relativeFreshness(value?: string | Date | null) {
  if (!value) return "freshness unknown";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "freshness unknown";
  const hours = Math.max(0, Math.round(ms / 3_600_000));
  if (hours < 1) return "seen just now";
  if (hours < 24) return `seen ${hours}h ago`;
  return `seen ${Math.round(hours / 24)}d ago`;
}

function money(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function PersonalListingLead({ deal }: { deal: any }) {
  const lastSeen = deal?.lastSeenAt || deal?.last_seen_at;
  const seenLabel = listingFreshnessLabel({
    firstSeenAt: deal?.firstSeenAt || deal?.first_seen_at,
    lastSeenAt: lastSeen,
  });
  const checks = [
    "VIN matches the listing",
    "Mileage and title status",
    "Condition and damage photos",
    "Seller contact and the all-in price",
  ];
  return (
    <section className="glass-panel p-4 md:p-5" aria-label="Listing to check">
      <h2 className="mt-1 text-xl font-black text-[var(--t1)]">
        Checks before purchase
      </h2>
      <div className="mt-3 rounded-[var(--r1)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2 text-sm text-[var(--t2)]">
        <span className="font-black">All-in cost is not confirmed.</span>{" "}
        Repair, transport, taxes, and registration still need to be checked.
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
        What to verify
      </p>
      <ul className="mt-2 space-y-1 text-sm text-[var(--t3)]">
        {checks.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {deal?.sourceUrl ? (
        <div className="mt-4">
          <a
            href={deal.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-black text-[var(--amber)]"
          >
            {sourceLinkLabel(deal.sourceUrl)}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          <p className="mt-1 text-xs text-[var(--t5)]">
            {lastSeen
              ? `Listing ${seenLabel.charAt(0).toLowerCase()}${seenLabel.slice(1)}. Open the source to confirm it is still available.`
              : "Open the source to confirm this listing is still available."}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--t4)]">
          Original listing link is not on this row yet.
        </p>
      )}
    </section>
  );
}

function DecisionCommandPanel({
  deal,
  engineVerdict,
  engineNetProfit,
  engineScore,
  engineRoi,
  detailQualityScore,
  detailMathConfidence,
  sourceHealth,
  proofLinks,
  onCashOffer,
  onWatchPrice,
}: {
  deal: any;
  engineVerdict: "GO" | "HOLD" | "PASS";
  engineNetProfit: number;
  engineScore: number;
  engineRoi: number;
  detailQualityScore?: number;
  detailMathConfidence: string;
  sourceHealth?: SourceHealthItem;
  proofLinks: { scan: string; sources: string };
  onCashOffer: () => void;
  onWatchPrice: () => void;
}) {
  const verdictTone =
    engineVerdict === "GO"
      ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
      : engineVerdict === "HOLD"
        ? "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]"
        : "border-[var(--rbd)] bg-[var(--rlo)] text-[var(--red)]";
  const title = [deal?.year, deal?.make, deal?.model].filter(Boolean).join(" ");
  const maxBid = Number(deal?.recommendedMaxBid || deal?.askPrice || 0);
  const sourceReady = sourceHealth?.readiness === "ready";

  return (
    <section className="glass-panel motion-enter overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
                Decision command
              </p>
              <h2 className="mt-1 text-xl font-black text-[var(--t1)]">
                {engineVerdict === "GO"
                  ? "Bid only if the proof checks out"
                  : engineVerdict === "HOLD"
                    ? "Watch this one until the math improves"
                    : "Pass unless the seller moves hard"}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
                {title || "This vehicle"} is scored with the current source
                proof, listing completeness, cost model, and resale estimate.
                Verify the original listing before any money moves.
              </p>
            </div>
            <span
              className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] ${verdictTone}`}
            >
              {engineVerdict}
            </span>
          </div>

          <div className="stagger-children mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Max bid",
                value: money(maxBid),
                detail: "do not exceed",
                Icon: BadgeDollarSign,
              },
              {
                label: "Net profit",
                value: money(engineNetProfit),
                detail: `${Number(engineRoi || 0).toFixed(1)}% ROI`,
                Icon: TrendingUp,
              },
              {
                label: "Deal score",
                value: `${Math.round(engineScore || 0)}`,
                detail: "engine rank",
                Icon: Gauge,
              },
              {
                label: "Proof",
                value: `${detailQualityScore || 0}/100`,
                detail: `${detailMathConfidence} confidence`,
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

          <div className="mt-4 flex flex-wrap gap-2">
            {engineVerdict === "PASS" ? (
              <button
                onClick={onWatchPrice}
                className="interactive-surface premium-focus inline-flex items-center gap-2 rounded-[var(--r2)] bg-[var(--s0)] px-4 py-2.5 text-xs font-black text-[var(--t2)]"
              >
                Watch price instead
              </button>
            ) : (
              <AcquireToPipelineButton
                deal={{
                  id: deal.id,
                  vin: deal.vin,
                  year: deal.year,
                  make: deal.make,
                  model: deal.model,
                  trim: deal.trim,
                  condition:
                    deal.titleType ||
                    deal.title_type ||
                    deal.condition ||
                    "unknown",
                  askPrice: deal.askPrice,
                  trueNetProfit: deal.true_net_profit ?? deal.trueNetProfit,
                  sellEstimate: deal.sellEstimate,
                  locationCity: deal.locationCity,
                  locationState: deal.locationState,
                }}
              />
            )}
            <button
              onClick={onCashOffer}
              className="interactive-surface premium-focus inline-flex items-center gap-2 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-xs font-black text-[var(--t2)]"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Cash offer LOI
            </button>
            {deal.sourceUrl && (
              <a
                href={deal.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="interactive-surface premium-focus inline-flex items-center gap-2 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-xs font-black text-[var(--t2)]"
              >
                {sourceLinkLabel(deal.sourceUrl)}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>

        <div className="border-t border-[var(--b1)] bg-[var(--s1)] p-4 md:p-5 lg:border-l lg:border-t-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Proof before action
          </p>
          <div className="mt-3 space-y-2">
            {[
              [
                "Why this verdict?",
                sourceReady
                  ? `${Number(sourceHealth?.activeRows || 0).toLocaleString()} current rows and ${Number(sourceHealth?.rowsWithPhotos || 0).toLocaleString()} photos support this source read.`
                  : sourceHealth?.nextAction ||
                    "The source proof is still loading, so this recommendation is provisional.",
              ],
              [
                "What would make this a buy?",
                engineVerdict === "GO"
                  ? "A clean inspection and verified listing details at or below the maximum purchase price."
                  : "A lower acquisition price or stronger verified resale and repair evidence.",
              ],
              [
                "What still needs checking?",
                "Confirm VIN, mileage, title, damage, seller contact, and auction timing before money moves.",
              ],
            ].map(([label, detail]) => (
              <div
                key={label}
                className="rounded-[var(--r2)] bg-[var(--s0)] p-2.5"
              >
                <div className="text-xs font-black text-[var(--t1)]">
                  {label}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--t4)]">
                  {detail}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Link
              href={proofLinks.scan}
              className="interactive-surface premium-focus rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-center text-xs font-black text-[var(--t2)]"
            >
              Matching Scan
            </Link>
            <Link
              href={proofLinks.sources}
              className="interactive-surface premium-focus rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-center text-xs font-black text-[var(--t2)]"
            >
              Source proof
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Keeps the first detail viewport focused on the decision. Expensive children do
 * not mount until someone explicitly asks to examine that part of the vehicle.
 */
function DetailDisclosure({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <details
      className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)]"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="interactive-surface flex cursor-pointer list-none items-center justify-between gap-4 p-4 marker:hidden md:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-base font-black text-[var(--t1)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--t4)]">{summary}</p>
        </div>
        <span className="shrink-0 text-xs font-black text-[var(--blue)]">
          {expanded ? "Hide" : "Examine"}
        </span>
      </summary>
      {expanded ? (
        <div className="border-t border-[var(--b1)] p-4 md:p-5">{children}</div>
      ) : null}
    </details>
  );
}

// Fetcher function for SWR
const fetcher = async (url: string) => {
  const res = await fetch(url);
  // 402 = free-plan daily limit reached. Return the payload (locked:true) so the page can show an
  // upgrade prompt instead of a generic error.
  if (res.status === 402) return res.json();
  if (!res.ok) throw new DealFetchError(res.status);
  return res.json();
};

export default function DealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const store = useDealStore();
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const buyerModeSynced = React.useRef(false);
  React.useEffect(() => {
    if (buyerModeSynced.current || prefsLoading) return;
    const saved =
      readLocalBuyerIntent()?.buyerMode || prefs.buyerScope?.buyerMode;
    store.setUserType(userTypeFromSavedBuyerMode(saved));
    buyerModeSynced.current = true;
  }, [prefs.buyerScope, prefsLoading, store]);
  const { dealerId, loading: dealerLoading } = useDealerId();
  const { targetProfit: savedTargetProfit } = useDealerDefaults();
  // The dealer's learned calibration (null until they've logged enough outcomes).
  const { data: calData } = useSWR(
    store.userType === "dealer" ? "/api/calibration" : null,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const calibration = calData?.calibration ?? null;
  const { id } = React.use(params);
  const router = useRouter();
  const [watching, setWatching] = React.useState(false);
  const [showCashOfferModal, setShowCashOfferModal] = React.useState(false);
  const [findSimilarOpen, setFindSimilarOpen] = React.useState(false);
  const loadedDealIdRef = React.useRef<string | null>(null);
  const localSaved = useLocalSavedVehicles();
  const isLocallyWatched = localSaved.has(id);

  // Use SWR for data fetching
  const {
    data: dealData,
    error,
    isLoading,
  } = useSWR(
    dealerId && !dealerLoading && id
      ? `/api/deals/${id}?dealerId=${dealerId}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    },
  );

  // Reco: one best-effort dwell signal per view, signed-in viewers of a loaded deal only.
  useDealDwellSignal(id, Boolean(dealerId && dealData?.deal));

  const loading = isLoading || dealerLoading;
  const authError =
    !dealerLoading && !dealerId ? "Please sign in to view deal details." : null;

  const handleWatchPrice = async () => {
    if (watching) return;
    const syncSavedCar = async () => {
      try {
        const savedRes = await fetch("/api/saved-cars", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dealId: id }),
        });
        const result = await savedRes.json();
        if (
          (savedRes.ok || savedRes.status === 409) &&
          typeof result.id === "string" &&
          !result.demo
        )
          return true;
        return false;
      } catch {
        return false;
      }
    };

    setWatching(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_id: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 403) {
          if (!saveDealLocally()) {
            toast.error(
              "Device storage is unavailable. The vehicle was not saved.",
            );
            return;
          }
          toast.success("Saved locally", {
            description:
              "Saved on this device only. Cloud alerts are not enabled.",
            action: {
              label: "View Saved",
              onClick: () => router.push("/saved"),
            },
          });
          return;
        }
        if (res.status === 409 && data.id && data.deal_id === id) {
          const saved = await syncSavedCar();
          saveDealLocally();
          toast.success(
            saved
              ? "Already in your account watchlist and Saved"
              : "Already in your account watchlist; Saved sync is unavailable",
            {
              action: {
                label: "View Saved",
                onClick: () => router.push("/saved"),
              },
            },
          );
          return;
        }
        throw new Error(data.error || "Failed to add to watchlist");
      }
      const watch = await res.json();
      if (!watch.id || watch.deal_id !== id || watch.user_id !== dealerId)
        throw new Error("Watchlist save was not confirmed");
      const saved = await syncSavedCar();
      const local = saveDealLocally();
      toast.success("Added to your account watchlist", {
        description: !saved
          ? "The Saved list sync is unavailable. Retry to sync it."
          : !local
            ? "Device backup is unavailable."
            : "Saved to your account with a device backup.",
        action: { label: "View Saved", onClick: () => router.push("/saved") },
      });
    } catch {
      if (!saveDealLocally()) {
        toast.error(
          "Device storage is unavailable. The vehicle was not saved.",
        );
        return;
      }
      toast.success("Saved locally", {
        description:
          "Saved on this device only. Cloud alerts were not confirmed enabled.",
        action: { label: "View Saved", onClick: () => router.push("/saved") },
      });
    } finally {
      setWatching(false);
    }
  };

  // Update store when data loads — guard with ref to prevent infinite loop
  useEffect(() => {
    if (dealData?.deal && loadedDealIdRef.current !== id) {
      loadedDealIdRef.current = id;
      store.addDealToCache(id, dealData.deal);
      store.loadDeal(dealData.deal);
    } else if (error && loadedDealIdRef.current !== id) {
      loadedDealIdRef.current = id;
      // Try to load from cache on error
      const cached = store.cachedDeals?.[id];
      if (cached) {
        store.loadDeal(cached);
      }
    }
  }, [dealData, error, id]);

  const formatMoney = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  // Authoritative numbers come from the SERVER decision engine (comps + full cost model).
  // Fall back to the client store only when the engine hasn't produced a verdict.
  const serverDeal = dealData?.deal;

  // Record for "Recently viewed".
  useEffect(() => {
    const title = [store.year, store.make, store.model]
      .filter(Boolean)
      .join(" ");
    if (!id || !title) return;
    const ask = serverDeal?.askPrice ?? serverDeal?.ask_price;
    recordRecent({
      id,
      kind: "car",
      title,
      sub: ask ? `$${Math.round(Number(ask)).toLocaleString()}` : undefined,
      image: serverDeal?.images?.[0],
      href: `/deal/${id}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, store.year, store.make, store.model, serverDeal]);
  const hasEngine = !!serverDeal?.dealVerdict;
  const engineVerdict = (
    hasEngine ? String(serverDeal.dealVerdict).toUpperCase() : store.verdict
  ) as "GO" | "HOLD" | "PASS";
  const engineNetProfit =
    hasEngine && serverDeal.true_net_profit != null
      ? Number(serverDeal.true_net_profit)
      : store.netProfit;
  const engineScore =
    hasEngine && serverDeal.profitScore != null
      ? Number(serverDeal.profitScore)
      : store.profitScore;
  const engineRoi =
    hasEngine && serverDeal?.dealAnalysis?.roi != null
      ? Number(serverDeal.dealAnalysis.roi)
      : store.roi;
  // The client store recompute is reframed as a "what-if" adjusted estimate (see ledger).

  const sourceHealthKey = React.useMemo(() => {
    if (!serverDeal) return null;
    const params = new URLSearchParams();
    const host = hostFromUrl(serverDeal.sourceUrl);
    if (serverDeal.source === "independent_dealer" && host) {
      params.set("dealers", host);
    }
    return `/api/scrape/health${params.toString() ? `?${params.toString()}` : ""}`;
  }, [serverDeal]);
  const {
    data: sourceHealthData,
    error: sourceHealthError,
    isLoading: sourceHealthLoading,
    mutate: retrySourceHealth,
  } = useSWR(sourceHealthKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const sourceHealth: SourceHealthItem | undefined = React.useMemo(() => {
    const sources = (sourceHealthData?.sources || []) as SourceHealthItem[];
    const healthId = sourceHealthIdForDeal(serverDeal, sources);
    return sources.find((source) => source.id === healthId);
  }, [serverDeal, sourceHealthData?.sources]);
  const sourceFallback = sourceReadinessFallback(
    Boolean(sourceHealthLoading),
    Boolean(sourceHealthError),
  );
  const detailCopy = dealCardCopy(store.userType === "dealer");
  const proofLinks = React.useMemo(() => {
    if (!serverDeal) return { scan: "/scan", sources: "/scan" };
    const params = new URLSearchParams();
    if (serverDeal.make || serverDeal.model) {
      params.set(
        "q",
        [serverDeal.make, serverDeal.model].filter(Boolean).join(" ").trim(),
      );
    }
    if (serverDeal.locationState) params.set("state", serverDeal.locationState);
    const host = hostFromUrl(serverDeal.sourceUrl);
    if (serverDeal.source === "independent_dealer" && host) {
      params.set("sellerType", "dealer");
      params.set("dealers", host);
    } else if (serverDeal.source === "gov_auction") {
      params.set("sellerType", "auction");
      params.set("lane", "government");
    } else if (isAuctionSource(serverDeal.source)) {
      params.set("sellerType", "auction");
      params.set("lane", "auction");
    }
    if (sourceHealth?.id) params.set("source", sourceHealth.id);
    params.set("sort", store.userType === "dealer" ? "profit" : "score");
    const query = params.toString();
    return {
      scan: `/scan${query ? `?${query}` : ""}`,
      sources: `/scan${query ? `?${query}` : ""}`,
    };
  }, [serverDeal, sourceHealth?.id, store.userType]);
  const detailQuality = React.useMemo(() => {
    if (!serverDeal) return null;
    return gradeDataQuality({
      images: serverDeal.images,
      imageUrl: serverDeal.images?.[0],
      vin: serverDeal.vin,
      titleType:
        serverDeal.titleType ||
        serverDeal.title_type ||
        serverDeal.titleStatus ||
        serverDeal.title_status ||
        serverDeal.condition,
      condition: serverDeal.condition,
      damageType: serverDeal.damageType || serverDeal.damage_type,
      mileage: serverDeal.mileage,
      locationCity: serverDeal.locationCity,
      locationState: serverDeal.locationState,
      askPrice: serverDeal.askPrice,
      seller: serverDeal.seller,
      sellerType: serverDeal.sellerType,
      sellerPhone: serverDeal.contact?.phone,
      sellerEmail: serverDeal.contact?.email,
      auctionEndAt: serverDeal.auctionEndAt,
      sourceUrl: serverDeal.sourceUrl,
    });
  }, [serverDeal]);
  const resaleBasis = Number(
    serverDeal?.sellEstimate || serverDeal?.mmrValue || 0,
  );
  const detailCosts = serverDeal?.dealAnalysis?.costs;
  const detailMathConfidence = detailValuationConfidence(
    serverDeal?.dealAnalysis?.valuation,
  );
  const detailMathGaps = [
    !resaleBasis ? "market value" : null,
    detailCosts?.repair == null ? "repair estimate" : null,
    detailCosts?.transport == null ? "transport" : null,
    ...(detailQuality?.missing.slice(0, 2).map(fieldLabel) || []),
  ].filter(Boolean);

  const saveDealLocally = React.useCallback(() => {
    const title =
      serverDeal?.title ||
      `${serverDeal?.year ?? store.year ?? ""} ${serverDeal?.make ?? store.make ?? ""} ${serverDeal?.model ?? store.model ?? ""}`.trim() ||
      "Saved vehicle";

    return localSaved.save({
      id,
      title,
      year: serverDeal?.year ?? store.year,
      make: serverDeal?.make ?? store.make,
      model: serverDeal?.model ?? store.model,
      vin: serverDeal?.vin ?? store.vin,
      mileage: serverDeal?.mileage ?? store.miles,
      askPrice: Number(
        serverDeal?.ask_price ?? serverDeal?.askPrice ?? store.askPrice ?? 0,
      ),
      estimatedProfit: Number(
        serverDeal?.true_net_profit ??
          serverDeal?.trueNetProfit ??
          store.netProfit ??
          0,
      ),
      source: serverDeal?.source ?? dealData?.deal?.source ?? "unknown",
      sourceUrl: serverDeal?.sourceUrl,
      image: serverDeal?.images?.[0],
      locationCity: serverDeal?.locationCity,
      locationState: serverDeal?.locationState,
      dataQuality: detailQuality
        ? {
            score: detailQuality.score,
            label: detailQuality.label,
            missing: detailQuality.missing.map(fieldLabel),
          }
        : undefined,
      savedAt: new Date().toISOString(),
    });
  }, [
    dealData?.deal?.source,
    detailQuality,
    id,
    localSaved,
    serverDeal,
    store.askPrice,
    store.make,
    store.miles,
    store.model,
    store.netProfit,
    store.vin,
    store.year,
  ]);

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto mt-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-44 lg:col-span-2" />
          <Skeleton className="h-44" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  if (authError || error) {
    const copy = authError
      ? dealLoadErrorCopy("auth")
      : dealLoadErrorCopy(classifyDealLoadError(error));
    return (
      <div className="max-w-5xl mx-auto mt-12">
        <ErrorState
          title={copy.title}
          message={authError || copy.message}
          icon={copy.action === "discover" ? "car" : "alert-triangle"}
          retryLabel={copy.actionLabel}
          onRetry={() => {
            if (copy.action === "discover") window.location.assign("/discover");
            else if (copy.action === "login")
              window.location.assign(
                `/login?next=${encodeURIComponent(window.location.pathname)}`,
              );
            else window.location.reload();
          }}
        />
      </div>
    );
  }

  // Free-plan daily limit reached (gating). Show an upgrade CTA instead of the deal.
  if (dealData?.locked) {
    return (
      <div className="max-w-md mx-auto mt-16">
        <div
          className="glass-panel p-8 text-center relative overflow-hidden"
          style={{
            background: "rgba(20,10,20,0.6)",
            boxShadow: "var(--shadow)",
          }}
        >
          <div
            className="h-1 w-full absolute top-0 left-0"
            style={{ background: "var(--grad)" }}
          />
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white"
            style={{ background: "var(--grad)" }}
          >
            <Ico name="trending-up" size={26} />
          </div>
          <h2 className="text-xl font-black text-[var(--t1)] mb-2">
            You’ve hit today’s free limit
          </h2>
          <p className="text-sm text-[var(--t3)] mb-6">
            Free includes{" "}
            <strong className="text-[var(--t1)]">
              {dealData?.meter?.limit ?? 10} deal analyses/day
            </strong>
            . Upgrade to Pro for unlimited deal intelligence, alerts, and
            calibrated pricing tuned to your shop.
          </p>
          <a
            href="/upgrade"
            className="inline-flex items-center gap-2 text-sm font-bold text-white rounded-xl px-6 py-3 border-none"
            style={{ background: "var(--grad)" }}
          >
            <Ico name="trending-up" size={16} />
            Upgrade to Pro
          </a>
          <p className="text-[11px] text-[var(--t5)] mt-4">
            Your limit resets at midnight.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-40 md:pb-24">
      {/* Reco: "Interested in similar?" after enough dwell, signed-in only */}
      <SimilarInterestPrompt
        dealId={id}
        enabled={Boolean(dealerId && serverDeal)}
      />
      {/* Listing identity, reports and primary research action. */}
      <div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <SourceBadge
              source={dealData?.deal?.source}
              sourceUrl={dealData?.deal?.sourceUrl}
              size="lg"
              showChannel
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFindSimilarOpen(true)}
              className="ml-auto border-[var(--b2)] text-[var(--t2)] font-bold text-xs min-h-11 rounded-lg flex items-center gap-1.5"
              data-testid="find-similar-cta"
            >
              <Search className="w-3.5 h-3.5" />
              Find similar
            </Button>
          </div>
          <VehicleSummary
            deal={{
              ...serverDeal,
              askPrice: serverDeal?.askPrice ?? serverDeal?.ask_price,
              titleType: serverDeal?.titleType ?? serverDeal?.title_type,
              damageType: serverDeal?.damageType ?? serverDeal?.damage_type,
            }}
          />
          {dealData?.deal?.sourceUrl && (
            <a
              href={dealData.deal.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-[var(--blue)] hover:underline"
            >
              {sourceLinkLabel(dealData.deal.sourceUrl)}
              <span aria-hidden>↗</span>
            </a>
          )}
        </div>
      </div>

      {/* Keep the actual vehicle visible before secondary checklists and analysis. */}
      {serverDeal?.images?.length ? (
        <section aria-label="Listing photos">
          <ImageGallery
            images={serverDeal.images}
            title={[serverDeal.year, serverDeal.make, serverDeal.model]
              .filter(Boolean)
              .join(" ")}
            sourceUrl={serverDeal.sourceUrl}
          />
          <p className="mt-2 text-xs text-[var(--t5)]">
            {serverDeal.images.length} listing photos. Photos are
            source-provided and are not a mechanic inspection.
          </p>
        </section>
      ) : (
        <p
          role="status"
          className="border-y border-[var(--b1)] py-4 text-sm text-[var(--t3)]"
        >
          No listing photos reported. Check the original listing for condition
          evidence.
        </p>
      )}
      {serverDeal?.decisionEvidence?.acquisitionReady === false && (
        <section
          className="rounded-lg border border-[var(--amber-bd)] bg-[var(--amber-lo)] p-4"
          aria-label="Vehicle evidence status"
        >
          <h2 className="text-lg font-bold text-[var(--t1)]">
            {serverDeal.decisionEvidence.label}: research before purchase
          </h2>
          <p className="mt-2 text-sm text-[var(--t2)]">
            {serverDeal.decisionEvidence.summary}
          </p>
          <p className="mt-2 text-sm text-[var(--t3)]">
            {serverDeal.decisionEvidence.nextCheck}
          </p>
        </section>
      )}
      {serverDeal &&
        serverDeal?.decisionEvidence?.state !== "auction_watch" &&
        (store.userType === "dealer" ? (
          serverDeal?.decisionEvidence?.acquisitionReady === true && (
            <DecisionCommandPanel
              deal={{
                ...serverDeal,
                id,
                askPrice:
                  serverDeal?.ask_price ||
                  serverDeal?.askPrice ||
                  store.askPrice,
                vin: serverDeal?.vin || store.vin,
                trueNetProfit: serverDeal?.true_net_profit || store.netProfit,
              }}
              engineVerdict={engineVerdict}
              engineNetProfit={engineNetProfit}
              engineScore={engineScore}
              engineRoi={engineRoi}
              detailQualityScore={detailQuality?.score}
              detailMathConfidence={detailMathConfidence}
              sourceHealth={sourceHealth}
              proofLinks={proofLinks}
              onCashOffer={() => setShowCashOfferModal(true)}
              onWatchPrice={handleWatchPrice}
            />
          )
        ) : (
          <PersonalListingLead
            deal={{
              ...serverDeal,
              askPrice:
                serverDeal?.ask_price || serverDeal?.askPrice || store.askPrice,
              sourceUrl: serverDeal?.sourceUrl || serverDeal?.source_url,
            }}
          />
        ))}

      {serverDeal && detailQuality && (
        <section
          aria-label="Decision readiness"
          className="border-y border-[var(--b1)] py-4"
        >
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base font-black text-[var(--t1)]">
                  Decision readiness
                </CardTitle>
                <p className="mt-1 text-xs text-[var(--t4)]">
                  Reported listing details, source freshness and estimated
                  costs.
                </p>
              </div>
              <Badge
                className="w-fit border-none uppercase tracking-wider"
                style={{
                  background:
                    detailMathConfidence === "High"
                      ? "var(--glo)"
                      : detailMathConfidence === "Medium"
                        ? "var(--amber-lo)"
                        : "rgba(239,68,68,0.12)",
                  color:
                    detailMathConfidence === "High"
                      ? "var(--green)"
                      : detailMathConfidence === "Medium"
                        ? "var(--amber-d)"
                        : "var(--red)",
                }}
              >
                {detailMathConfidence} valuation confidence
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Listing completeness
                </span>
                <span className="text-xs font-black text-[var(--t1)]">
                  {detailQuality.score}
                </span>
              </div>
              <p className="mt-1 text-xs font-bold text-[var(--t3)]">
                {detailQuality.label} field coverage
              </p>
              {detailQuality.missing.length > 0 && (
                <p className="mt-3 text-[11px] leading-relaxed text-[var(--t5)]">
                  Missing{" "}
                  {detailQuality.missing.slice(0, 4).map(fieldLabel).join(", ")}
                  {detailQuality.missing.length > 4
                    ? `, +${detailQuality.missing.length - 4}`
                    : ""}
                </p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {listingChecklistFields(detailQuality).map((field) => {
                  const present = detailQuality.present.includes(field);
                  return (
                    <span
                      key={field}
                      className="flex items-center justify-between gap-2 rounded-[var(--r1)] border px-2 py-1 text-[10px] font-black uppercase"
                      style={{
                        borderColor: present ? "var(--gbd)" : "var(--amber-bd)",
                        background: present ? "var(--glo)" : "var(--amber-lo)",
                        color: present ? "var(--green)" : "var(--amber-d)",
                      }}
                    >
                      <span>
                        {field === "damage"
                          ? "Condition / damage"
                          : fieldLabel(field)}
                      </span>
                      <span>
                        {present
                          ? field === "damage"
                            ? "condition reported"
                            : "provided"
                          : "check"}
                      </span>
                    </span>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--t4)]">
                This counts source-provided fields, not inspection findings.
                Missing VIN, mileage, seller contact, or auction timing means
                verify from the original listing before money moves.
              </p>
            </div>

            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Source status
                </span>
                <span
                  className="text-[10px] font-black uppercase"
                  style={{
                    color:
                      sourceHealth?.readiness === "ready"
                        ? "var(--green)"
                        : sourceHealth?.readiness === "blocked" ||
                            sourceHealth?.readiness === "needs_login"
                          ? "var(--red)"
                          : "var(--amber-d)",
                  }}
                >
                  {sourceHealth?.userStatus ||
                    sourceHealth?.readiness?.replace(/_/g, " ") ||
                    sourceFallback.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--t3)]">
                {sourceHealth
                  ? `Source inventory: ${Number(sourceHealth.activeRows || 0).toLocaleString()} active rows · ${Number(
                      sourceHealth.rowsWithPhotos || 0,
                    ).toLocaleString()} rows with photos`
                  : sourceFallback.summary}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--t4)]">
                {sourceHealth
                  ? `Latest source listing: ${
                      typeof sourceHealth.freshnessHours === "number"
                        ? sourceHealth.freshnessHours < 24
                          ? `${sourceHealth.freshnessHours}h ago`
                          : `${Math.round(sourceHealth.freshnessHours / 24)}d ago`
                        : relativeFreshness(sourceHealth.lastSeenAt)
                    } · ${Number(sourceHealth.photoCoveragePct || 0)}% of source rows include photos.`
                  : sourceFallback.detail}
              </p>
              {sourceHealthError && (
                <button
                  type="button"
                  onClick={() => void retrySourceHealth()}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--blue)]"
                >
                  <RotateCcw size={16} />
                  Retry source check
                </button>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--t5)]">
                {sourceHealth?.nextAction ||
                  (serverDeal.sourceUrl
                    ? isSourceLandingPage(serverDeal.sourceUrl)
                      ? "Only the seller website is saved. Confirm the exact vehicle with the seller."
                      : "Listing link is available for verification."
                    : "No direct source link was saved for this listing.")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={proofLinks.scan}
                  className="rounded-[var(--r1)] border border-[var(--b2)] bg-[var(--s0)] px-2.5 py-1.5 text-[11px] font-black text-[var(--t2)] hover:text-[var(--t1)]"
                >
                  Related listings
                </Link>
                {proofLinks.sources !== proofLinks.scan && (
                  <Link
                    href={proofLinks.sources}
                    className="rounded-[var(--r1)] border border-[var(--b2)] bg-[var(--s0)] px-2.5 py-1.5 text-[11px] font-black text-[var(--t2)] hover:text-[var(--t1)]"
                  >
                    Source proof
                  </Link>
                )}
                {serverDeal.sourceUrl && (
                  <a
                    href={serverDeal.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-[var(--r1)] bg-[var(--t1)] px-2.5 py-1.5 text-[11px] font-black text-[var(--s0)]"
                  >
                    {sourceLinkLabel(serverDeal.sourceUrl)}
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Buyer math
                </span>
                <span className="text-[10px] font-black uppercase text-[var(--t3)]">
                  {serverDeal.dealVerdict || "review"}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-[var(--t4)]">
                  {serverDeal.decisionEvidence?.state === "auction_watch"
                    ? "Auction amount"
                    : "Ask"}
                </span>
                <Mono className="text-right font-bold text-[var(--t2)]">
                  {formatMoney(Number(serverDeal.askPrice || 0))}
                </Mono>
                <span className="text-[var(--t4)]">
                  {detailCopy.basisRowLabel}
                </span>
                <Mono className="text-right font-bold text-[var(--t2)]">
                  {serverDeal.decisionEvidence?.acquisitionReady !== true
                    ? "Needs verified comparisons"
                    : resaleBasis
                      ? formatMoney(resaleBasis)
                      : "Unknown"}
                </Mono>
                <span className="text-[var(--t4)]">Repair</span>
                <Mono className="text-right font-bold text-[var(--t2)]">
                  {serverDeal.decisionEvidence?.acquisitionReady !== true
                    ? "Inspection and quote needed"
                    : detailCosts?.repair != null
                      ? formatMoney(detailCosts.repair)
                      : "Needed"}
                </Mono>
                <span className="text-[var(--t4)]">Transport</span>
                <Mono className="text-right font-bold text-[var(--t2)]">
                  {serverDeal.decisionEvidence?.acquisitionReady !== true
                    ? "Quote needed"
                    : detailCosts?.transport != null
                      ? formatMoney(detailCosts.transport)
                      : "Needed"}
                </Mono>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--t5)]">
                {detailMathGaps.length
                  ? `${detailCopy.checksPrefix} ${detailMathGaps.slice(0, 4).join(", ")}.`
                  : "Review all costs and evidence before making an offer."}
              </p>
            </div>
          </CardContent>
        </section>
      )}

      {/* ENGINE DECISION — flip desk only. Personal, DIY, and parts buyers do not get net profit,
          ROI, or a max bid. The API also redacts these fields for non-flip saved modes. */}
      {store.userType === "dealer" &&
        dealData?.deal?.dealVerdict &&
        serverDeal?.decisionEvidence?.acquisitionReady === true &&
        (() => {
          const d = dealData.deal;
          const a = d.dealAnalysis || {};
          const verdict = String(d.dealVerdict).toUpperCase();
          const vColor =
            verdict === "GO"
              ? "var(--green)"
              : verdict === "HOLD"
                ? "var(--amber)"
                : "var(--red)";
          const basisLabel =
            a.sellBasis === "comps"
              ? "real retail comps"
              : a.sellBasis === "market"
                ? "market value"
                : "estimated markup";
          return (
            <Card
              className="border-none overflow-hidden"
              style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
            >
              <div className="h-1 w-full" style={{ background: vColor }} />
              <CardContent className="p-6 md:p-7">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-4">
                  The Decision
                </p>
                <div className="flex flex-wrap items-center justify-between gap-5">
                  <div className="flex items-center gap-4 md:gap-5">
                    <div
                      className="px-5 py-3 rounded-[var(--r3)] text-white font-black text-2xl tracking-wide leading-none"
                      style={{ background: vColor }}
                    >
                      {verdict === "GO" ? "BUY" : verdict}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-1">
                        {`Recommended ${buyTerm(d.source ?? serverDeal?.source).label.toLowerCase()}`}
                      </p>
                      <Mono className="text-3xl md:text-4xl font-black text-[var(--t1)] leading-none">
                        {d.recommendedMaxBid != null
                          ? formatMoney(d.recommendedMaxBid)
                          : "—"}
                      </Mono>
                      <p className="text-xs text-[var(--t3)] font-semibold mt-1.5">
                        Net profit {formatMoney(d.true_net_profit ?? 0)}
                        {a.roi != null ? ` · ${a.roi}% ROI` : ""} · score{" "}
                        {d.profitScore ?? "—"}/130
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
                      Est. resale
                    </p>
                    <Mono className="text-xl font-black text-[var(--t1)]">
                      {d.sellEstimate != null
                        ? formatMoney(d.sellEstimate)
                        : "—"}
                    </Mono>
                    <p className="text-[10px] text-[var(--t4)]">
                      via {basisLabel}
                    </p>
                    {(() => {
                      // Honest confidence from the valuation basis: real comps (sold-anchored) = high;
                      // comps = good; market aggregate = fair; offline baseline = estimate only.
                      const conf =
                        a.sellBasis === "comps" && a.soldAnchored
                          ? { label: "High", c: "var(--green)" }
                          : a.sellBasis === "comps"
                            ? { label: "Good", c: "var(--green)" }
                            : a.sellBasis === "market"
                              ? { label: "Fair", c: "var(--amber-d)" }
                              : { label: "Estimate", c: "var(--t4)" };
                      return (
                        <span
                          className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                          style={{ background: `${conf.c}1f`, color: conf.c }}
                          title="Confidence = how much real market data backs this number"
                        >
                          {conf.label} confidence
                        </span>
                      );
                    })()}
                    {a.conditionTag && a.conditionTag !== "clean" && (
                      <p className="text-[10px] font-bold text-[var(--amber-d)] mt-0.5">
                        {a.conditionTag} pricing
                        {a.soldAnchored ? " · real-sold anchored" : ""}
                      </p>
                    )}
                    {a.wholesaleEstimate > 0 && (
                      <p className="text-[10px] text-[var(--t4)] mt-1.5">
                        Wholesale ~
                        <span className="font-bold text-[var(--t2)]">
                          {formatMoney(a.wholesaleEstimate)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                {(a.warnings?.length > 0 || a.recommendations?.length > 0) && (
                  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[var(--b1)]">
                    {(a.warnings || []).map((w: string, i: number) => (
                      <span
                        key={`w${i}`}
                        className="text-xs font-semibold text-white px-2.5 py-1 rounded-md"
                        style={{ background: "var(--red)" }}
                      >
                        ⚠ {w}
                      </span>
                    ))}
                    {(a.recommendations || []).map((r: string, i: number) => (
                      <span
                        key={`r${i}`}
                        className="text-xs font-semibold text-[var(--t2)] px-2.5 py-1 rounded-md bg-[var(--s1)]"
                      >
                        ✓ {r}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

      <section aria-label="Current alternatives">
        <SimilarDeals dealId={id} />
      </section>

      <DetailDisclosure
        eyebrow="Vehicle examination"
        title="Check condition, title, and history"
        summary="VIN signals, listing claims, and recent verified sales."
      >
        <div className="space-y-4">
          {serverDeal && (
            <VinHistory
              vin={serverDeal.vin ?? store.vin}
              title={serverDeal.title}
              condition={serverDeal.condition ?? store.titleType}
              damageType={serverDeal.damageType ?? serverDeal.damage_type}
            />
          )}
          {serverDeal && (
            <RecentlySold
              make={serverDeal.make ?? store.make}
              model={serverDeal.model ?? store.model}
              year={serverDeal.year ?? store.year}
            />
          )}
          {serverDeal?.images && serverDeal.images.length > 0 && (
            <VisionDamageInspector
              imageUrl={serverDeal.images[0]}
              images={serverDeal.images}
              sourceUrl={serverDeal.sourceUrl}
              vin={serverDeal.vin ?? store.vin}
            />
          )}
          {(serverDeal?.vin || store.vin) && (
            <TitleWashDetector
              vin={serverDeal?.vin ?? store.vin ?? ""}
              state={serverDeal?.locationState}
            />
          )}
        </div>
      </DetailDisclosure>

      <DetailDisclosure
        eyebrow="Market evidence"
        title="Compare price and timing"
        summary="Price history, comparable position, and local market timing."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PriceMilesScatter
              dealId={id}
              mileage={serverDeal?.mileage}
              askPrice={serverDeal?.askPrice}
            />
            {serverDeal && (
              <BestTimeToBuy make={serverDeal.make} model={serverDeal.model} />
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {store.userType === "dealer" && (
              <div className="lg:col-span-2">
                <MaxBidWidget
                  sellEstimate={dealData?.deal?.sellEstimate}
                  source={dealData?.deal?.source}
                  askPrice={dealData?.deal?.askPrice ?? store.askPrice}
                  costs={dealData?.deal?.dealAnalysis?.costs}
                  defaultTargetProfit={savedTargetProfit}
                  calibration={calibration}
                />
              </div>
            )}
            <PriceSparkline dealId={id} />
          </div>
          {store.userType === "dealer" &&
            dealData?.deal?.dealAnalysis?.valuation &&
            dealData?.deal?.sellEstimate != null && (
              <ValuationBreakdown
                v={dealData.deal.dealAnalysis.valuation}
                sellEstimate={Number(dealData.deal.sellEstimate)}
              />
            )}
          <MarketTiming
            make={dealData?.deal?.make ?? store.make}
            model={dealData?.deal?.model ?? store.model}
          />
        </div>
      </DetailDisclosure>

      <DetailDisclosure
        eyebrow="Plan and record"
        title="Costs, seller, and private notes"
        summary="Build an all-in plan, contact the seller, and keep your research together."
      >
        <div className="space-y-4">
          {store.userType === "dealer" &&
            serverDeal?.decisionEvidence?.acquisitionReady === true &&
            serverDeal?.dealVerdict &&
            serverDeal.dealAnalysis?.costs && (
              <DealEconomics
                buy={
                  serverDeal.dealAnalysis.costs.acquisition ??
                  serverDeal.askPrice ??
                  store.askPrice ??
                  0
                }
                transport={serverDeal.dealAnalysis.costs.transport ?? 0}
                recon={serverDeal.dealAnalysis.costs.repair ?? 0}
                fees={
                  (serverDeal.dealAnalysis.costs.holding ?? 0) +
                  (serverDeal.dealAnalysis.costs.selling ?? 0)
                }
                sell={serverDeal.sellEstimate ?? 0}
                profit={serverDeal.true_net_profit ?? engineNetProfit ?? 0}
                verdict={String(serverDeal.dealVerdict).toUpperCase()}
              />
            )}
          {store.userType === "dealer" &&
            serverDeal?.decisionEvidence?.acquisitionReady === true &&
            serverDeal?.dealAnalysis?.prediction && (
              <ForecastPanel prediction={serverDeal.dealAnalysis.prediction} />
            )}
          {store.userType === "dealer" && serverDeal && (
            <ContactSeller
              contact={serverDeal.contact}
              sourceUrl={serverDeal.sourceUrl}
            />
          )}
          <DealNotes dealId={id} />
          {store.userType === "dealer" && serverDeal && (
            <LogOutcome
              dealId={id}
              year={serverDeal.year ?? store.year}
              make={serverDeal.make ?? store.make}
              model={serverDeal.model ?? store.model}
              defaultPurchase={
                serverDeal.recommendedMaxBid ??
                serverDeal.askPrice ??
                store.askPrice
              }
              predictedProfit={engineNetProfit}
              predictedSell={serverDeal.sellEstimate}
              predictedTransport={serverDeal.dealAnalysis?.costs?.transport}
              predictedRecon={serverDeal.dealAnalysis?.costs?.repair}
            />
          )}
        </div>
      </DetailDisclosure>

      <DetailDisclosure
        eyebrow="Advanced workspace"
        title="Refine assumptions and specialist tools"
        summary="Optional calculators, negotiation, transport, and deeper vehicle intelligence."
      >
        {/* TOP READOUT (The 60-Second Decision) — flip desk only. Net profit, ROI, and the deal
          score are flip economics; personal / DIY / parts stay on verify-list + ask. */}
        {store.userType === "dealer" && (
          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0 },
            }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-4"
          >
            <Card
              className="col-span-1 lg:col-span-2 border-none bg-[var(--s0)]"
              style={{ boxShadow: "var(--shadow2)" }}
            >
              <CardContent className="p-6 flex flex-col justify-center h-full">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm font-bold text-[var(--t4)] uppercase tracking-widest mb-1">
                      Net Profit
                    </p>
                    <div className="text-5xl font-bold text-[var(--t1)] flex items-center gap-3 serif">
                      {formatMoney(engineNetProfit)}
                      <Badge
                        className="text-white border-none px-2 py-1 text-sm"
                        style={{ background: "var(--green)" }}
                      >
                        {engineRoi}% ROI
                      </Badge>
                    </div>
                    {/* The interactive ledger below is a what-if sandbox; show its result only as
                    a secondary "adjusted" figure so it never competes with the engine verdict. */}
                    {store.netProfit !== engineNetProfit && (
                      <p className="text-[11px] text-[var(--t4)] mt-1.5">
                        Your adjusted estimate:{" "}
                        <span className="font-bold text-[var(--t3)]">
                          {formatMoney(store.netProfit)}
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[var(--t4)] uppercase tracking-widest mb-1">
                      Verdict
                    </p>
                    <div
                      className={`text-4xl font-bold ${engineVerdict === "GO" ? "text-[var(--green)]" : engineVerdict === "HOLD" ? "text-[var(--amber)]" : "text-[var(--red)]"}`}
                    >
                      {engineVerdict === "GO" ? "BUY" : engineVerdict}
                    </div>
                  </div>
                </div>

                {/* The EDGE Features Row */}
                <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-[var(--b1)]">
                  {/* Carrying Cost Clock */}
                  {store.userType === "dealer" && (
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--t2)] bg-[var(--s1)] px-3 py-1.5 rounded-md">
                      <Ico
                        name="clock"
                        size={14}
                        className="text-[var(--t4)]"
                      />
                      Break-even: Day{" "}
                      {Math.floor(store.netProfit / store.floorRate)} of{" "}
                      {store.estimatedDaysToSell}-day target
                    </div>
                  )}
                  {/* Geo-Arbitrage */}
                  {store.transportCost < 1000 &&
                    store.netProfit > 2500 &&
                    store.userType === "dealer" && (
                      <div className="flex items-center gap-2 text-xs font-bold text-white bg-[var(--purple)] px-3 py-1.5 rounded-md shadow-sm">
                        <Ico name="trending-up" size={14} />
                        {dealData?.deal?.locationState
                          ? `Geo-Arbitrage: low transport from ${dealData.deal.locationState}`
                          : "Geo-Arbitrage: low transport opportunity"}
                      </div>
                    )}
                  {/* Recalls */}
                  {store.openRecalls > 0 ? (
                    <div className="flex items-center gap-2 text-xs font-bold text-white bg-[var(--red)] px-3 py-1.5 rounded-md shadow-sm">
                      <Ico name="alert-triangle" size={14} />
                      {store.openRecalls} Open NHTSA Recalls
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-bold text-[var(--t2)] bg-[var(--s1)] px-3 py-1.5 rounded-md">
                      <Ico
                        name="check-circle"
                        size={14}
                        className="text-[var(--green)]"
                      />
                      0 Open Recalls
                    </div>
                  )}

                  {/* Salvage Teardown */}
                  {store.titleType === "salvage" &&
                    store.marketValue > 0 &&
                    store.userType === "dealer" && (
                      <div className="flex items-center gap-2 text-xs font-bold text-white bg-[var(--amber)] px-3 py-1.5 rounded-md shadow-sm">
                        <Ico name="wrench" size={14} />
                        Est. Parts Value: $
                        {estimateTeardownValue(
                          store.marketValue,
                          store.make,
                          store.model,
                        ).total.toLocaleString()}
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>

            {/* The Algorithm Score */}
            <Card className="col-span-1 border-[var(--b2)] bg-[var(--s0)] shadow-sm flex flex-col justify-center items-center p-6 text-center">
              <p className="text-sm font-bold text-[var(--t3)] uppercase tracking-widest mb-2">
                Deal Score
              </p>
              <div className="relative inline-flex items-center justify-center w-32 h-32 mb-2">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="var(--s2)"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke={
                      engineScore >= 80
                        ? "var(--green)"
                        : engineScore >= 60
                          ? "var(--amber)"
                          : "var(--red)"
                    }
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray="351.8"
                    strokeDashoffset={
                      351.8 -
                      (351.8 * Math.max(0, Math.min(100, engineScore))) / 100
                    }
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-[var(--t1)]">
                  {engineScore}
                </div>
              </div>
              <ScoreBreakdown
                netProfit={engineNetProfit}
                roi={engineRoi}
                breakdown={serverDeal?.dealAnalysis?.scoreBreakdown}
              />
            </Card>
          </motion.div>
        )}

        {/* MIDDLE SECTION (The Interactive Ledger — secondary) */}
        <div className="pt-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--t4)] px-1 mb-1">
            Adjust assumptions
          </p>
          <p className="text-xs text-[var(--t4)] px-1 mb-3">
            Fine-tune costs and market value to see how the numbers move. The
            decision above uses the engine&apos;s estimates.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Value & Ask */}
          <Card className="border-[var(--b2)] shadow-sm">
            <CardHeader className="bg-[var(--s1)] border-b border-[var(--b1)] py-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest">
                Market & Acquisition
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-[var(--t2)] flex-1">
                  {
                    buyTerm(dealData?.deal?.source ?? serverDeal?.source)
                      .priceLabel
                  }
                </label>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t3)] font-bold">
                    $
                  </span>
                  <Input
                    type="number"
                    value={store.askPrice || ""}
                    onChange={(e) =>
                      store.updateField("askPrice", Number(e.target.value))
                    }
                    className="pl-7 font-[var(--fm)] font-bold bg-[var(--s0)] text-right"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--b1)] pt-4">
                <div className="flex-1">
                  <label className="text-sm font-bold text-[var(--t2)]">
                    {store.userType === "parts"
                      ? "Est. Parts Value"
                      : "MMR Market Value"}
                  </label>
                  <p className="text-[10px] text-[var(--t4)]">
                    Editable estimate
                  </p>
                </div>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t3)] font-bold">
                    $
                  </span>
                  <Input
                    type="number"
                    value={store.marketValue || ""}
                    onChange={(e) =>
                      store.updateField("marketValue", Number(e.target.value))
                    }
                    className="pl-7 font-[var(--fm)] font-bold bg-[var(--s1)] text-right border-dashed"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right: The Costs */}
          <Card className="border-[var(--b2)] shadow-sm">
            <CardHeader className="bg-[var(--s1)] border-b border-[var(--b1)] py-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest">
                Cost Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-[var(--b1)]">
                {store.userType !== "private" &&
                  isAuctionSource(
                    dealData?.deal?.source ?? serverDeal?.source,
                  ) && (
                    <CostRow
                      label="Auction Fee"
                      value={store.auctionFee}
                      onChange={(val) => store.updateField("auctionFee", val)}
                    />
                  )}
                <CostRow
                  label="Transport"
                  value={store.transportCost}
                  onChange={(val) => store.updateField("transportCost", val)}
                />
                {store.userType !== "parts" && (
                  <CostRow
                    label="Repair Est"
                    value={store.repairCost}
                    onChange={(val) => store.updateField("repairCost", val)}
                  />
                )}
                {store.userType === "dealer" && (
                  <CostRow
                    label="Recon / Detail"
                    value={store.reconCost}
                    onChange={(val) => store.updateField("reconCost", val)}
                  />
                )}
                {store.userType !== "parts" && (
                  <CostRow
                    label="Title / Doc"
                    value={store.titleFee}
                    onChange={(val) => store.updateField("titleFee", val)}
                  />
                )}
                {store.userType === "dealer" && (
                  <CostRow
                    label={`Holding (${store.estimatedDaysToSell} days @ $${store.floorRate})`}
                    value={store.floorRate * store.estimatedDaysToSell}
                    readOnly
                  />
                )}
                {store.userType === "private" && (
                  <>
                    <CostRow
                      label="Est. Insurance (1 YR)"
                      value={store.annualInsurance}
                      onChange={(val) =>
                        store.updateField("annualInsurance", val)
                      }
                    />
                    <CostRow
                      label="Est. Maintenance (1 YR)"
                      value={store.annualMaintenance}
                      onChange={(val) =>
                        store.updateField("annualMaintenance", val)
                      }
                    />
                  </>
                )}
              </div>
              <div className="p-4 bg-[var(--s1)] border-t border-[var(--b1)] flex justify-between items-center rounded-b-[var(--r2)]">
                <span className="font-bold text-[var(--t2)] uppercase tracking-wider text-sm">
                  Total Cost Basis
                </span>
                <Mono className="text-lg font-black text-[var(--t1)]">
                  {formatMoney(store.totalCost)}
                </Mono>
              </div>
            </CardContent>
          </Card>
        </div>
        {/* Buyer proof module: cash-offer draft and letter workflow */}
        {serverDeal && (
          <AutonomousSellerNegotiator
            dealId={id}
            vin={serverDeal?.vin ?? store.vin}
            locationCity={serverDeal?.locationCity}
            locationState={serverDeal?.locationState}
            vehicleTitle={`${serverDeal.year ?? store.year} ${serverDeal.make ?? store.make} ${serverDeal.model ?? store.model}`.trim()}
            askingPrice={serverDeal.askPrice ?? store.askPrice ?? 0}
            targetOffer={
              serverDeal.recommendedMaxBid ??
              Math.round((serverDeal.askPrice ?? store.askPrice ?? 0) * 0.9)
            }
            sellerPhone={serverDeal.contact?.phone}
          />
        )}

        {/* Transport: a road-routed quote when the API has one, otherwise no numbers */}
        {serverDeal && (
          <FreightAndTaxCalculator
            buyState={serverDeal.locationState}
            homeState={effectiveHome(prefs)?.state}
          />
        )}

        {/* AI PHASE 5: FLOOR PLAN FINANCING & CARRY COST CALCULATOR — flip desk only */}
        {store.userType === "dealer" && serverDeal && (
          <FloorPlanCalculator
            purchasePrice={serverDeal.askPrice ?? store.askPrice ?? 0}
            expectedProfit={serverDeal.trueNetProfit ?? store.netProfit ?? 0}
          />
        )}

        {/* DRAGGABLE WIDGET GRID */}
        <SortableWidgetGrid
          storageKey="deal-dashboard-layout-v1"
          widgets={[
            { id: "deal-iq", content: <DealIQCard dealId={id} /> },
            { id: "market-context", content: <MarketContext dealId={id} /> },
            {
              id: "vehicle-specs",
              content: <VehicleSpecs vin={store.vin} make={store.make} />,
            },
            { id: "price-timeline", content: <PriceTimeline dealId={id} /> },
            { id: "ai-brief", content: <AIBrief dealId={id} /> },
            // Max-bid math and outcome logging are flip-desk tools.
            ...(store.userType === "dealer"
              ? [
                  {
                    id: "max-bid-calc",
                    content: (
                      <MaxBidCalculator
                        deal={{
                          year: serverDeal?.year ?? store.year,
                          make: serverDeal?.make ?? store.make,
                          model: serverDeal?.model ?? store.model,
                          askPrice: serverDeal?.askPrice ?? store.askPrice ?? 0,
                          sellEstimate:
                            serverDeal?.sellEstimate ?? store.marketValue,
                          recommendedMaxBid: serverDeal?.recommendedMaxBid,
                          repairEstimate: store.repairCost,
                          transportEstimate: store.transportCost,
                        }}
                      />
                    ),
                  },
                  {
                    id: "log-outcome",
                    content: (
                      <LogOutcome
                        dealId={id}
                        year={serverDeal?.year ?? store.year}
                        make={serverDeal?.make ?? store.make}
                        model={serverDeal?.model ?? store.model}
                        defaultPurchase={
                          serverDeal?.recommendedMaxBid ??
                          serverDeal?.askPrice ??
                          store.askPrice
                        }
                        predictedProfit={
                          serverDeal?.trueNetProfit ?? store.netProfit
                        }
                        predictedSell={
                          serverDeal?.sellEstimate ?? store.marketValue
                        }
                        predictedTransport={store.transportCost}
                        predictedRecon={store.reconCost}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </DetailDisclosure>

      {/* FIXED BOTTOM ACTION BAR — sits ABOVE the mobile BottomNav (which is itself bottom-0), so
          the two fixed bars don't overlap on phones; flush to the bottom on desktop (no BottomNav). */}
      <section
        aria-label="Vehicle actions"
        className="fixed left-0 right-0 p-3 md:p-4 z-50 bottom-[calc(58px+env(safe-area-inset-bottom))] md:bottom-0"
        style={{
          background: "var(--s0)",
          borderTop: "1px solid var(--b1)",
          boxShadow: "var(--shadow2)",
        }}
      >
        <div className="max-w-5xl mx-auto flex flex-wrap justify-end gap-2 md:gap-3">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="outline"
              onClick={handleWatchPrice}
              disabled={watching}
              className="border-[var(--b2)] text-[var(--t3)] font-semibold text-xs md:text-sm min-h-11 rounded-lg"
            >
              {watching
                ? "Adding…"
                : isLocallyWatched
                  ? "Saved"
                  : "Save vehicle"}
            </Button>
          </motion.div>

          <Link
            href="/fleet"
            className="inline-flex min-h-11 items-center rounded-lg border border-[var(--b2)] px-3 text-sm font-semibold text-[var(--t2)]"
          >
            {store.userType === "dealer" ? "Pipeline" : "Purchase plan"}
          </Link>

          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={() => {
                const fromState = dealData?.deal?.locationState;
                const params = new URLSearchParams({ dealId: id });
                if (fromState) params.set("from", fromState);
                router.push(`/move?${params.toString()}`);
              }}
              className="text-white font-semibold text-xs md:text-sm min-h-11 rounded-lg"
              style={{ background: "var(--t1)" }}
            >
              Get Transport
            </Button>
          </motion.div>

          {store.userType === "dealer" && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <AcquireToPipelineButton
                label="Record purchase"
                deal={{
                  id,
                  vin: serverDeal?.vin || "",
                  year: serverDeal?.year,
                  make: serverDeal?.make,
                  model: serverDeal?.model,
                  condition:
                    serverDeal?.titleType || serverDeal?.condition || "unknown",
                  trueNetProfit: serverDeal?.trueNetProfit,
                  sellEstimate: serverDeal?.sellEstimate,
                  locationCity: serverDeal?.locationCity,
                  locationState: serverDeal?.locationState,
                }}
              />
            </motion.div>
          )}
        </div>
      </section>

      <FindSimilarModal
        flipDesk={store.userType === "dealer"}
        isOpen={findSimilarOpen}
        onClose={() => setFindSimilarOpen(false)}
        snapshot={{
          vin: serverDeal?.vin || store.vin || "",
          year: Number(serverDeal?.year ?? store.year) || 0,
          make: String(serverDeal?.make ?? store.make ?? ""),
          model: String(serverDeal?.model ?? store.model ?? ""),
          trim: serverDeal?.trim,
          odometer:
            serverDeal?.mileage ??
            serverDeal?.odometer ??
            store.miles ??
            undefined,
          askingPrice:
            serverDeal?.askPrice ??
            serverDeal?.ask_price ??
            store.askPrice ??
            undefined,
          marketValue:
            serverDeal?.sellEstimate ?? store.marketValue ?? undefined,
          ...(store.userType === "dealer"
            ? {
                estimatedProfit:
                  serverDeal?.trueNetProfit ??
                  serverDeal?.true_net_profit ??
                  store.netProfit ??
                  undefined,
              }
            : {}),
        }}
      />

      <CashOfferLetterModal
        isOpen={showCashOfferModal}
        onClose={() => setShowCashOfferModal(false)}
        deal={{
          id,
          vin: serverDeal?.vin || store.vin,
          year: serverDeal?.year || store.year,
          make: serverDeal?.make || store.make,
          model: serverDeal?.model || store.model,
          trim: serverDeal?.trim,
          askPrice:
            serverDeal?.ask_price || serverDeal?.askPrice || store.askPrice,
          recommendedMaxBid: serverDeal?.recommendedMaxBid,
          targetOffer:
            serverDeal?.recommendedMaxBid ??
            Math.round(
              (serverDeal?.ask_price ||
                serverDeal?.askPrice ||
                store.askPrice ||
                0) * 0.9,
            ),
          locationCity: serverDeal?.locationCity,
          locationState: serverDeal?.locationState,
          sellerPhone: serverDeal?.contact?.phone,
        }}
      />
    </div>
  );
}

// Subcomponent for ledger rows
function CostRow({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: number;
  onChange?: (val: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 px-5 hover:bg-[var(--s1)] transition-colors">
      <span className="text-sm font-semibold text-[var(--t2)]">{label}</span>
      <div className="relative w-28">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-bold text-sm">
          $
        </span>
        {readOnly ? (
          <div className="pl-7 py-2 pr-3 text-right font-[var(--fm)] font-bold text-[var(--t3)]">
            {value}
          </div>
        ) : (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => onChange?.(Number(e.target.value))}
            className="h-8 pl-7 font-[var(--fm)] font-bold bg-transparent border-transparent hover:border-[var(--b2)] focus:border-[var(--amber)] focus:bg-[var(--s0)] text-right text-sm px-2 shadow-none rounded"
          />
        )}
      </div>
    </div>
  );
}
