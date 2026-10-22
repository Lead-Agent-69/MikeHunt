"use client";

import React, { useEffect } from "react";
import { recordRecent } from "@/hooks/useRecentlyViewed";
import { useLocalSavedVehicles } from "@/hooks/useLocalSavedVehicles";
import { useAccountSavedVehicles } from "@/hooks/useAccountSavedVehicles";
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
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useDealStore } from "@/lib/store/dealStore";
import { usePreferences } from "@/hooks/usePreferences";
import { readLocalBuyerIntent } from "@/hooks/useBuyerIntent";
import { userTypeFromSavedBuyerMode } from "@/lib/buyer/saved-buyer-mode";
import { isAuctionSource } from "@/lib/deal-terms";
import { SourceBadge } from "@/components/shared/SourceBadge";
import {
  dealerSourceIdFromUrl,
  sourceFromUrl,
} from "@/lib/sources/source-meta";
import {
  isSourceLandingPage,
  sourceLinkLabel,
} from "@/lib/sources/listing-link";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  DealFetchError,
  classifyDealLoadError,
  dealLoadErrorCopy,
} from "@/lib/deals/deal-load-error";
import { Button } from "@/components/ui/button";
import { Ico } from "@/components/shared/Ico";
import { useDealerId } from "@/hooks/useDealerId";
import { SimilarInterestPrompt } from "@/components/reco/SimilarInterestPrompt";
import { useDealDwellSignal } from "@/hooks/useDealDwellSignal";
import { Skeleton } from "@/components/shared/Skeleton";
import { MaxBidWidget } from "@/components/deal/MaxBidWidget";
import { ValuationBreakdown } from "@/components/deal/ValuationBreakdown";
import { ReportListing } from "@/components/deal/ReportListing";
import { ForecastPanel } from "@/components/deal/ForecastPanel";
import { SimilarDeals } from "@/components/deal/SimilarDeals";
import { FindSimilarModal } from "@/components/saved/FindSimilarModal";
import { MarketTiming } from "@/components/deal/MarketTiming";
import { LogOutcome } from "@/components/deal/LogOutcome";
import { DealEconomics } from "@/components/deal/DealEconomics";
import { RecentlySold } from "@/components/deal/RecentlySold";
import { VinHistory } from "@/components/deal/VinHistory";
import { ContactSeller } from "@/components/deal/ContactSeller";
import { DealNotes } from "@/components/deal/DealNotes";
import { VehicleSourceAction } from "@/components/deal/VehicleSourceAction";
import { ImageGallery } from "@/components/shared/ImageGallery";
import {
  ListingVerification,
  type VerificationSection,
} from "@/components/deal/ListingVerification";
import { DetailDisclosure } from "@/components/deal/DetailDisclosure";
import { PriceMilesScatter } from "@/components/deal/PriceMilesScatter";
import { BestTimeToBuy } from "@/components/deal/BestTimeToBuy";
import { MarketContext } from "@/components/deal/MarketContext";
import { PriceTimeline } from "@/components/deal/PriceTimeline";
import { DealResearchWorkspace } from "@/components/deal/DealResearchWorkspace";
import { VehicleFacts, VehicleSummary } from "@/components/deal/VehicleSummary";
import useDealerDefaults from "@/hooks/useDealerDefaults";
import { VisionDamageInspector } from "@/components/deal/VisionDamageInspector";
import { TitleWashDetector } from "@/components/deal/TitleWashDetector";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";
import { CashOfferLetterModal } from "@/components/deal/CashOfferLetterModal";
import { fieldLabel, gradeDataQuality } from "@/lib/data-quality";
import { listingFreshnessLabel } from "@/lib/deals/listing-freshness";
import { TitleBadge } from "@/components/shared/TitleBadge";

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
    const govSource = sourceFromUrl(url);
    if (govSource && ids.has(govSource)) return govSource;
  }
  if (source === "independent_dealer") {
    // Hostname match (exact or dot-suffix) against the curated dealer domains.
    const dealerSourceId = dealerSourceIdFromUrl(url);
    if (dealerSourceId && ids.has(dealerSourceId)) return dealerSourceId;
    if (ids.has("curated_dealers")) return "curated_dealers";
  }
  return "";
}

function money(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

// Engine verdict as the page shows it. NOT_ENOUGH_DATA = too few comps and no third-party value
// (lib/scoring/deal-analyzer.ts), so there is no buy/pass call.
type EngineVerdict = "GO" | "HOLD" | "PASS" | "NOT_ENOUGH_DATA";
function verdictWord(v: EngineVerdict): string {
  return v === "NOT_ENOUGH_DATA" ? "NOT ENOUGH DATA" : v;
}

function DecisionCommandPanel({
  deal,
  engineVerdict,
  engineNetProfit,
  engineScore,
  engineRoi,
  detailQualityScore,
  proofLinks,
  onCashOffer,
  onWatchPrice,
}: {
  deal: any;
  engineVerdict: EngineVerdict;
  engineNetProfit: number;
  engineScore: number;
  engineRoi: number;
  detailQualityScore?: number;
  proofLinks: { scan: string; sources: string };
  onCashOffer: () => void;
  onWatchPrice: () => void;
}) {
  const verdictTone =
    engineVerdict === "GO"
      ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
      : engineVerdict === "HOLD"
        ? "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]"
        : engineVerdict === "NOT_ENOUGH_DATA"
          ? "border-[var(--b2)] bg-[var(--s1)] text-[var(--t4)]"
          : "border-[var(--rbd)] bg-[var(--rlo)] text-[var(--red)]";
  const title = [deal?.year, deal?.make, deal?.model].filter(Boolean).join(" ");
  const maxBid = Number(deal?.recommendedMaxBid || deal?.askPrice || 0);

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
                    : engineVerdict === "NOT_ENOUGH_DATA"
                      ? "Not enough market data to call this yet"
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
              {verdictWord(engineVerdict)}
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
                label: "Listing details",
                value: `${detailQualityScore || 0}/100`,
                detail: "Field completeness, not inspection",
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
            {engineVerdict === "PASS" || engineVerdict === "NOT_ENOUGH_DATA" ? (
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
                "This estimate depends on comparable prices, repair assumptions, and total purchase costs. Source inventory counts do not verify this vehicle.",
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
      prefs.buyerScope?.legacyBuyerMode ??
      prefs.buyerScope?.buyerMode ??
      readLocalBuyerIntent()?.buyerMode;
    store.setUserType(userTypeFromSavedBuyerMode(saved));
    buyerModeSynced.current = true;
  }, [prefs.buyerScope, prefsLoading, store]);
  const { dealerId, loading: dealerLoading } = useDealerId();
  const { targetProfit: savedTargetProfit } = useDealerDefaults();
  const { id } = React.use(params);
  const router = useRouter();
  const [watching, setWatching] = React.useState(false);
  const [showCashOfferModal, setShowCashOfferModal] = React.useState(false);
  const [findSimilarOpen, setFindSimilarOpen] = React.useState(false);
  const [sectionRequest, setSectionRequest] = React.useState({
    dealId: id,
    section: "" as VerificationSection | "",
    count: 0,
  });
  const openVerificationSection = (section: VerificationSection) =>
    setSectionRequest((current) => ({
      dealId: id,
      section,
      count: current.count + 1,
    }));
  const loadedDealIdRef = React.useRef<string | null>(null);
  const localSaved = useLocalSavedVehicles();
  const isLocallyWatched = localSaved.has(id);
  const accountSaved = useAccountSavedVehicles(
    dealerLoading ? null : dealerId,
    id,
  );
  const isAccountSaved = accountSaved.has(id);
  const currentSaveOwner = React.useRef(dealerId);
  currentSaveOwner.current = dealerId;

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
    if (watching || dealerLoading) return;
    const syncSavedCar = async () => {
      try {
        if (!dealerId || currentSaveOwner.current !== dealerId) return false;
        const savedRes = await fetch("/api/saved-cars", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Save-Owner": dealerId,
          },
          body: JSON.stringify({ dealId: id }),
        });
        const result = await savedRes.json();
        if (
          (savedRes.ok || savedRes.status === 409) &&
          typeof result.id === "string" &&
          !result.demo &&
          currentSaveOwner.current === dealerId
        ) {
          await accountSaved.confirm(id, result.id);
          return true;
        }
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
      if (currentSaveOwner.current !== dealerId) return;
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
      if (currentSaveOwner.current !== dealerId) return;
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
  const acquisitionPriceMissing = !!serverDeal && !(serverDeal.askPrice > 0);
  const adjustedNetProfit = acquisitionPriceMissing ? 0 : store.netProfit;
  const engineVerdict = (
    hasEngine ? String(serverDeal.dealVerdict).toUpperCase() : store.verdict
  ) as EngineVerdict;
  const engineNetProfit = acquisitionPriceMissing
    ? 0
    : hasEngine && serverDeal.true_net_profit != null
      ? Number(serverDeal.true_net_profit)
      : store.netProfit;
  const engineScore = acquisitionPriceMissing
    ? 0
    : hasEngine && serverDeal.profitScore != null
      ? Number(serverDeal.profitScore)
      : store.profitScore;
  const engineRoi = acquisitionPriceMissing
    ? 0
    : hasEngine && serverDeal?.dealAnalysis?.roi != null
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
  const { data: sourceHealthData } = useSWR(sourceHealthKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  const sourceHealth: SourceHealthItem | undefined = React.useMemo(() => {
    const sources = (sourceHealthData?.sources || []) as SourceHealthItem[];
    const healthId = sourceHealthIdForDeal(serverDeal, sources);
    return sources.find((source) => source.id === healthId);
  }, [serverDeal, sourceHealthData?.sources]);
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
      source: serverDeal.source,
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
      sellerContactUrl: serverDeal.contact?.listingUrl || serverDeal.sourceUrl,
      auctionEndAt: serverDeal.auctionEndAt,
      sourceUrl: serverDeal.sourceUrl,
    });
  }, [serverDeal]);

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
          adjustedNetProfit ??
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
    adjustedNetProfit,
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
    <div className="min-w-0 space-y-4 pb-4 lg:space-y-6">
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
            <TitleBadge
              size="md"
              condition={serverDeal?.condition}
              damageType={serverDeal?.damageType ?? serverDeal?.damage_type}
              titleSource={
                serverDeal?.titleSource ?? serverDeal?.options?.titleSource
              }
              repairableEvidence={
                serverDeal?.decisionEvidence?.state === "repairable" ||
                /repairable/i.test(serverDeal?.decisionEvidence?.label || "")
              }
            />
          </div>
          <VehicleSummary
            showFacts={false}
            deal={{
              ...serverDeal,
              askPrice: serverDeal?.askPrice ?? serverDeal?.ask_price,
              titleType: serverDeal?.titleType ?? serverDeal?.title_type,
              damageType: serverDeal?.damageType ?? serverDeal?.damage_type,
            }}
          />
        </div>
      </div>

      <div
        className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(20rem,1fr)] lg:gap-6"
        data-testid="vehicle-overview"
      >
        {/* Keep the actual vehicle visible before secondary checklists and analysis. */}
        {serverDeal?.images?.length ? (
          <section aria-label="Listing photos" className="min-w-0">
            <ImageGallery
              images={serverDeal.images}
              title={
                serverDeal.title ||
                [serverDeal.year, serverDeal.make, serverDeal.model]
                  .filter(Boolean)
                  .join(" ")
              }
            />
            <p className="mt-2 text-xs text-[var(--t5)]">
              Photos are source-provided and are not a mechanic inspection.
            </p>
          </section>
        ) : (
          <p
            role="status"
            className="border-y border-[var(--b1)] py-4 text-sm text-[var(--t3)]"
          >
            {serverDeal?.photoEvidence?.placeholderCount
              ? "The source supplied a placeholder, not vehicle photos. Check the original listing for updated photos."
              : "No listing photos reported. Check the original listing for condition evidence."}
          </p>
        )}
        <aside
          aria-label="Vehicle details and actions"
          className="min-w-0 space-y-4 rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-3 sm:p-4"
        >
          <section
            aria-label="Vehicle actions"
            className="border-t border-[var(--b1)] py-3 md:py-4"
            style={{
              background: "var(--s0)",
              borderTop: "1px solid var(--b1)",
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Button
                  variant="outline"
                  onClick={handleWatchPrice}
                  disabled={watching || accountSaved.isLoading}
                  title={
                    isAccountSaved
                      ? "Saved to your account"
                      : isLocallyWatched
                        ? "Saved on this device only; click to sync to your account"
                        : accountSaved.error
                          ? "Account saved status is unavailable; saving can be retried"
                          : undefined
                  }
                  className="border-[var(--b2)] text-[var(--t3)] font-semibold text-xs md:text-sm min-h-11 rounded-lg"
                >
                  {watching
                    ? "Adding…"
                    : accountSaved.isLoading
                      ? "Checking saved…"
                      : isAccountSaved
                        ? "Saved"
                        : isLocallyWatched
                          ? "Saved on device"
                          : "Save vehicle"}
                </Button>
              </motion.div>

              <VehicleSourceAction
                sourceUrl={serverDeal?.sourceUrl || dealData?.deal?.sourceUrl}
                auction={
                  serverDeal?.decisionEvidence?.state === "auction_watch" ||
                  isAuctionSource(serverDeal?.source ?? dealData?.deal?.source)
                }
              />

              {store.userType === "dealer" && (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <AcquireToPipelineButton
                    label="Record purchase"
                    deal={{
                      id,
                      vin: serverDeal?.vin || "",
                      year: serverDeal?.year,
                      make: serverDeal?.make,
                      model: serverDeal?.model,
                      condition:
                        serverDeal?.titleType ||
                        serverDeal?.condition ||
                        "unknown",
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

          <VehicleFacts
            compact
            deal={{
              ...serverDeal,
              titleType: serverDeal?.titleType ?? serverDeal?.title_type,
              damageType: serverDeal?.damageType ?? serverDeal?.damage_type,
            }}
          />
          <ReportListing key={id} listingId={id} />
        </aside>
      </div>
      {serverDeal &&
        serverDeal.decisionEvidence?.state !== "auction_watch" &&
        store.userType === "dealer" &&
        serverDeal.decisionEvidence?.acquisitionReady === true && (
          <DecisionCommandPanel
            deal={{
              ...serverDeal,
              id,
              askPrice:
                serverDeal?.ask_price || serverDeal?.askPrice || store.askPrice,
              vin: serverDeal?.vin || store.vin,
              trueNetProfit: serverDeal?.true_net_profit ?? adjustedNetProfit,
            }}
            engineVerdict={engineVerdict}
            engineNetProfit={engineNetProfit}
            engineScore={engineScore}
            engineRoi={engineRoi}
            detailQualityScore={detailQuality?.score}
            proofLinks={proofLinks}
            onCashOffer={() => setShowCashOfferModal(true)}
            onWatchPrice={handleWatchPrice}
          />
        )}

      {serverDeal && detailQuality && (
        <ListingVerification
          present={detailQuality.present}
          missing={detailQuality.missing}
          evidence={serverDeal.decisionEvidence}
          priceKind={serverDeal.priceEvidence?.kind}
          source={serverDeal.source}
          sourceUrl={serverDeal.sourceUrl}
          observationLabel={listingFreshnessLabel({
            firstSeenAt: serverDeal.firstSeenAt,
            lastSeenAt: serverDeal.lastSeenAt,
          })}
          dealerMode={store.userType === "dealer"}
          onOpenSection={openVerificationSection}
        />
      )}
      {serverDeal?.sourceUrl && isSourceLandingPage(serverDeal.sourceUrl) && (
        <p role="status" className="text-sm text-[var(--t3)]">
          Only the seller website is saved. Confirm the exact vehicle with the
          seller.
        </p>
      )}

      <section aria-label="Current alternatives">
        <button
          type="button"
          onClick={() => setFindSimilarOpen(true)}
          className="min-h-11 inline-flex items-center gap-1.5 text-sm font-bold hover:underline"
          data-testid="find-similar-cta-rail"
          aria-label="Find similar vehicles in collected inventory"
        >
          <Search className="w-3.5 h-3.5" />
          Find similar
        </button>
        <SimilarDeals dealId={id} />
      </section>

      <DetailDisclosure
        request={
          sectionRequest.dealId === id && sectionRequest.section === "condition"
            ? sectionRequest.count
            : 0
        }
        key={`${id}:condition`}
        eyebrow="Vehicle examination"
        title="Check condition, title, and history"
        summary="VIN signals, title history, and condition reported in the listing."
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

      <SimilarInterestPrompt
        dealId={id}
        enabled={Boolean(dealerId && serverDeal)}
      />

      <DetailDisclosure
        request={
          sectionRequest.dealId === id && sectionRequest.section === "market"
            ? sectionRequest.count
            : 0
        }
        key={`${id}:market`}
        eyebrow="Market evidence"
        title="Compare price and timing"
        summary="Source-reported sale records, asking-price history, and local market timing."
      >
        <div className="space-y-4">
          {serverDeal && (
            <RecentlySold
              make={serverDeal.make ?? store.make}
              model={serverDeal.model ?? store.model}
              year={serverDeal.year ?? store.year}
            />
          )}
          <MarketContext dealId={id} />
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
          <PriceTimeline dealId={id} />
          {store.userType === "dealer" &&
            dealData?.deal?.dealAnalysis?.valuation &&
            dealData?.deal?.sellEstimate != null && (
              <ValuationBreakdown
                v={dealData.deal.dealAnalysis.valuation}
                sellEstimate={Number(dealData.deal.sellEstimate)}
                mileage={dealData.deal.mileage}
              />
            )}
          <MarketTiming
            make={dealData?.deal?.make ?? store.make}
            model={dealData?.deal?.model ?? store.model}
          />
        </div>
      </DetailDisclosure>

      <DetailDisclosure
        request={
          sectionRequest.dealId === id && sectionRequest.section === "plan"
            ? sectionRequest.count
            : 0
        }
        key={`${id}:plan`}
        eyebrow="Plan and record"
        title="Costs, seller, and private notes"
        summary="Build an all-in plan, contact the seller, and keep your research together."
      >
        <div className="space-y-4">
          {store.userType === "dealer" && serverDeal && (
            <MaxBidWidget
              key={`${dealerId}:${id}`}
              dealId={id}
              ownerId={dealerId}
              sellEstimate={serverDeal.sellEstimate}
              valuation={serverDeal.dealAnalysis?.valuation}
              source={serverDeal.source}
              sourceUrl={serverDeal.sourceUrl}
              lastSeenAt={serverDeal.lastSeenAt}
              askPrice={serverDeal.askPrice}
              buyNowPrice={serverDeal.buyNowPrice}
              priceEvidence={serverDeal.priceEvidence}
              defaultTargetProfit={savedTargetProfit}
            />
          )}
          <Button
            variant="outline"
            onClick={() => {
              const params = new URLSearchParams({ dealId: id });
              if (serverDeal?.locationState)
                params.set("from", serverDeal.locationState);
              router.push(`/move?${params.toString()}`);
            }}
            className="min-h-11 gap-2"
          >
            <Ico name="truck" size={16} />
            Plan transport
          </Button>
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
          {serverDeal && (
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
            />
          )}
        </div>
      </DetailDisclosure>

      <DetailDisclosure
        key={`${id}:research`}
        eyebrow="Research tools"
        title="Open one focused tool"
        summary="Deal IQ, an on-demand AI brief, and vehicle data—without stacking duplicate calculators."
      >
        <DealResearchWorkspace
          dealId={id}
          vin={serverDeal?.vin ?? store.vin}
          make={serverDeal?.make ?? store.make}
          dealerMode={store.userType === "dealer"}
        />
      </DetailDisclosure>

      <FindSimilarModal
        flipDesk={store.userType === "dealer"}
        isOpen={findSimilarOpen}
        onClose={() => setFindSimilarOpen(false)}
        snapshot={{
          id,
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
                  adjustedNetProfit ??
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
