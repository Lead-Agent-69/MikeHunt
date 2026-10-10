"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { Mono } from "./Mono";
import { cn } from "@/lib/utils";
import { proxiedImage } from "@/lib/image-url";
import { daysOnMarket, domTier } from "@/lib/intelligence/days-on-market";
import { type DealCardProps } from "./deal-card/types";
import { AdvisorSummary } from "@/components/intelligence/AdvisorSummary";
import { VERDICT_STYLES, formatCondition } from "./deal-card/utils";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { dealCardCopy } from "@/lib/deals/deal-card-copy";
import { qualityFieldLabel } from "@/lib/data-quality";
import {
  evidenceConfidence,
  hasRecentSoldEvidence,
} from "@/lib/valuation/evidence-confidence";
import { isSourceLandingPage } from "@/lib/sources/listing-link";
import { listingFreshnessLabel } from "@/lib/deals/listing-freshness";
import { sellerTypeLabel } from "@/lib/sources/source-meta";

function relativeFreshness(value?: string | Date | null) {
  if (!value) return "Freshness unknown";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "Freshness unknown";
  const hours = Math.max(0, Math.round(ms / 3_600_000));
  if (hours < 1) return "Seen just now";
  if (hours < 24) return `Seen ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `Seen ${days}d ago`;
}

function fieldState(label: string, present: boolean) {
  return { label, present };
}

function weakSourceDetails(
  completeness?: NonNullable<DealCardProps["sourceHealth"]>["completeness"],
) {
  if (!completeness) return [];
  return [
    { label: "VIN", value: completeness.vinPct },
    { label: "title", value: completeness.titlePct },
    { label: "mileage", value: completeness.mileagePct },
    { label: "condition", value: completeness.damagePct },
    { label: "price", value: completeness.pricePct },
    { label: "seller", value: completeness.sellerPct },
    { label: "contact", value: completeness.sellerContactPct },
    { label: "link", value: completeness.sourceLinkPct },
  ]
    .filter(
      (item): item is { label: string; value: number } =>
        typeof item.value === "number",
    )
    .filter((item) => item.value < 70)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3);
}

function qualityMissingText(missing: string[], limit: number) {
  return missing.slice(0, limit).map(qualityFieldLabel).join(", ");
}

export const DealCard = memo(function DealCard({
  id,
  source,
  year,
  make,
  model,
  trim,
  bodyClass,
  recallsCount,
  askPrice,
  mmrValue,
  profitEstimate,
  profitScore,
  locationCity,
  locationState,
  mileage,
  condition,
  damageType,
  titleType,
  dealVerdict,
  recommendedMaxBid,
  sellEstimate,
  sellBasis,
  valuation,
  soldAnchored,
  needsComps = false,
  repairEstimate,
  transportEstimate,
  warnings = [],
  priceDropAmount,
  priceDropDays,
  auctionEndAt,
  bidCount,
  firstSeenAt,
  lastSeenAt,
  imageUrl,
  vin,
  sourceUrl,
  seller,
  sellerType,
  sellerPhone,
  sellerEmail,
  sellerContactUrl,
  dataQuality,
  trustExplanation,
  sourceHealth,
  onClick,
  isSaved,
  onSave,
  flipDesk = true,
}: DealCardProps) {
  const dom = daysOnMarket(firstSeenAt);
  const tier = dom != null ? domTier(dom) : null;
  // /api/scan strips profit/max bid for non-flip desks; never render "$NaN" if the client
  // desk (e.g. ?mode=dealer) disagrees with the server's redaction.
  // Live-preview rows ("live-*") are unanalyzed public listings with a placeholder profit of 0;
  // a "+$0 net profit" / "no positive spread" readout would be fake precision.
  const showFlipEconomics =
    flipDesk &&
    !id.startsWith("live-") &&
    typeof profitEstimate === "number" &&
    Number.isFinite(profitEstimate);
  const isPositive = profitEstimate >= 0;
  const location = [locationCity, locationState].filter(Boolean).join(", ");
  const verdict =
    showFlipEconomics && dealVerdict ? VERDICT_STYLES[dealVerdict] : null;
  const isLivePreview = id.startsWith("live-");
  const primaryHref = isLivePreview && sourceUrl ? sourceUrl : `/deal/${id}`;
  const primaryTarget = isLivePreview && sourceUrl ? "_blank" : undefined;
  const primaryRel = isLivePreview && sourceUrl ? "noreferrer" : undefined;
  const lastSeenText = lastSeenAt
    ? new Date(lastSeenAt).toLocaleDateString()
    : null;
  // Age from first_seen, re-check from last_seen — never call an old re-scraped listing new.
  const freshnessText = listingFreshnessLabel({ firstSeenAt, lastSeenAt });
  const auctionEndText = auctionEndAt
    ? new Date(auctionEndAt).toLocaleDateString()
    : null;
  const actionDetails = [
    auctionEndText ? `Ends ${auctionEndText}` : null,
    bidCount != null ? `${bidCount} bid${bidCount === 1 ? "" : "s"}` : null,
    seller ? seller : sellerType ? sellerTypeLabel(sellerType) : null,
  ].filter(Boolean);
  const resaleBasis = sellEstimate || mmrValue || 0;
  // Wording follows the flipDesk prop: reseller/dealer keep resale/bid copy, everyone else gets buyer copy.
  const copy = dealCardCopy(flipDesk);
  // Flip economics (net profit, max bid, resale spread) are reseller/dealer
  // only. Non-flip buyers see the ask against the market estimate instead.
  const belowMarket =
    resaleBasis > 0 && askPrice > 0 ? resaleBasis - askPrice : 0;
  const whyShown = showFlipEconomics
    ? [
        profitEstimate > 0 ? `+$${profitEstimate.toLocaleString()} net` : null,
        recommendedMaxBid != null
          ? `$${recommendedMaxBid.toLocaleString()} max bid`
          : null,
        sellEstimate != null
          ? `$${sellEstimate.toLocaleString()} resale`
          : null,
      ].filter(Boolean)
    : [
        belowMarket > 0
          ? `$${belowMarket.toLocaleString()} under market est.`
          : null,
        resaleBasis > 0 ? `$${resaleBasis.toLocaleString()} market est.` : null,
      ].filter(Boolean);
  const valuationBasis =
    valuation?.basis || sellBasis || (mmrValue ? "market" : "baseline");
  const valuationSource =
    valuation?.source ||
    (valuationBasis === "comps"
      ? "comparables"
      : valuationBasis === "market"
        ? mmrValue
          ? "third_party"
          : "historical_estimate"
        : "baseline");
  const valuationLabels = {
    comparables: "Comp-backed",
    third_party: "Third-party",
    historical_estimate: "History estimate",
    asking_price: "Ask anchor",
    baseline: "Model estimate",
  } as const;
  const valuationBasisLabel =
    valuationLabels[valuationSource] || "Model estimate";
  const valuationConfidence =
    valuation?.confidence || valuation?.compConfidence || "none";
  const recentSoldEvidence = hasRecentSoldEvidence({
    soldCount: valuation?.soldCount,
    soldAnchored: soldAnchored === true,
    soldAt: valuation?.soldAt,
  });
  const resaleBasisLabel = copy.basisLabel(
    recentSoldEvidence,
    resaleBasis > 0,
    valuationSource,
  );
  const resaleBasisTitle = copy.basisTitle(valuationSource);
  const valuationCompCount = Number(valuation?.compCount || 0);
  const valuationSoldCount = Number(valuation?.soldCount || 0);
  const valuationSampleCount = Number(valuation?.sampleCount || 0);
  const soldOn =
    recentSoldEvidence && valuation?.soldAt
      ? new Date(valuation.soldAt).toLocaleDateString("en-US", {
          timeZone: "America/Chicago",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
  const soldLine = recentSoldEvidence
    ? `${valuationSoldCount} ${
        valuation?.soldLane === "salvage"
          ? "salvage"
          : valuation?.soldLane === "clean"
            ? "clean"
            : "title unspecified"
      } sold${soldOn ? ` · ${soldOn}` : ""}`
    : null;
  const valuationProof = [
    valuationCompCount > 0
      ? `${valuationCompCount} comparable${valuationCompCount === 1 ? "" : "s"}`
      : null,
    soldLine,
    valuationSource === "historical_estimate" && valuationSampleCount > 0
      ? `${valuationSampleCount} historical listing${valuationSampleCount === 1 ? "" : "s"}`
      : valuationSource === "third_party"
        ? "external benchmark"
        : valuationSource === "asking_price"
          ? "seller asking price"
          : null,
    valuation?.titleTag ? valuation.titleTag : null,
  ].filter(Boolean);
  const costStack = [
    askPrice > 0 ? { label: copy.priceLabel(source), value: askPrice } : null,
    repairEstimate && repairEstimate > 0
      ? { label: "Repair (est.)", value: repairEstimate }
      : null,
    transportEstimate && transportEstimate > 0
      ? { label: "Transport (est.)", value: transportEstimate }
      : null,
  ].filter(Boolean) as { label: string; value: number }[];
  const knownCostTotal = costStack.reduce((sum, item) => sum + item.value, 0);
  const mathConfidence = evidenceConfidence({
    source: valuationSource,
    confidence: valuationConfidence,
    compCount: valuationCompCount,
    soldCount: valuationSoldCount,
    soldAnchored: soldAnchored === true,
    soldAt: valuation?.soldAt,
  });
  const sourceProofScore = sourceHealth
    ? (sourceHealth.readiness === "ready" ||
      sourceHealth.readiness === "needs_run"
        ? 28
        : 8) +
      (Number(sourceHealth.activeRows || 0) > 0 ? 18 : 0) +
      (Number(sourceHealth.photoCoveragePct || 0) >= 70 ? 14 : 0)
    : sourceUrl
      ? 28
      : 8;
  const mathProofScore =
    ((showFlipEconomics ? profitEstimate : belowMarket) > 0 ? 12 : 0) +
    (resaleBasis > 0 ? 12 : 0) +
    (knownCostTotal > 0 ? 8 : 0);
  const computedConfidenceScore = Math.min(
    100,
    Math.round(
      Math.max(0, dataQuality?.score || 0) * 0.45 +
        sourceProofScore +
        mathProofScore,
    ),
  );
  const confidenceScore =
    typeof trustExplanation?.score === "number"
      ? Math.round(trustExplanation.score)
      : computedConfidenceScore;
  const confidenceLabel =
    trustExplanation?.confidence === "high"
      ? "Actable"
      : trustExplanation?.confidence === "medium"
        ? "Reviewable"
        : trustExplanation?.confidence === "low"
          ? "Thin proof"
          : confidenceScore >= 82
            ? "Actable"
            : confidenceScore >= 62
              ? "Reviewable"
              : confidenceScore >= 42
                ? "Thin proof"
                : "Do not act";
  const confidenceTone =
    confidenceScore >= 82
      ? "text-[var(--green)]"
      : confidenceScore >= 62
        ? "text-[var(--amber-d)]"
        : confidenceScore >= 42
          ? "text-[var(--amber-d)]"
          : "text-[var(--red)]";
  const mathGaps = [
    !resaleBasis ? "market value" : null,
    !repairEstimate ? "repair estimate" : null,
    !transportEstimate ? "transport" : null,
    ...(dataQuality?.missing.slice(0, 2).map(qualityFieldLabel) || []),
  ].filter(Boolean);
  const trustSignals = [
    sourceUrl ? "source link" : null,
    imageUrl ? "photo" : null,
    lastSeenAt || firstSeenAt ? "freshness" : null,
    vin ? "VIN" : null,
    mileage ? "mileage" : null,
    sellerPhone || sellerEmail ? "seller contact" : null,
    sellerContactUrl ? "contact link" : null,
    auctionEndAt ? "auction date" : null,
  ].filter(Boolean);
  const fieldProof = [
    fieldState("Photo", Boolean(imageUrl)),
    fieldState("VIN", Boolean(vin)),
    fieldState("Title", Boolean(titleType)),
    fieldState("Mileage", Boolean(mileage)),
    fieldState("Location", Boolean(location)),
    fieldState("Seller", Boolean(seller || sellerType || sourceUrl)),
    fieldState(
      "Contact",
      Boolean(sellerPhone || sellerEmail || sellerContactUrl),
    ),
    fieldState("Auction", Boolean(auctionEndAt)),
    fieldState("Condition", Boolean(condition || damageType)),
    fieldState("Price", askPrice > 0),
  ];
  const sourceHealthTone =
    sourceHealth?.readiness === "ready"
      ? "text-[var(--green)]"
      : sourceHealth?.readiness === "needs_login" ||
          sourceHealth?.readiness === "blocked"
        ? "text-[var(--red)]"
        : sourceHealth?.readiness
          ? "text-[var(--amber-d)]"
          : "text-[var(--t5)]";
  const sourceHealthLabel =
    sourceHealth?.userStatus ||
    (sourceHealth?.readiness
      ? sourceHealth.readiness.replace(/_/g, " ")
      : "Source proof unknown");
  const sourceHealthFreshness =
    typeof sourceHealth?.freshnessHours === "number"
      ? sourceHealth.freshnessHours < 1
        ? "fresh now"
        : sourceHealth.freshnessHours < 24
          ? `${sourceHealth.freshnessHours}h fresh`
          : `${Math.round(sourceHealth.freshnessHours / 24)}d fresh`
      : sourceHealth?.lastSeenAt
        ? relativeFreshness(sourceHealth.lastSeenAt)
        : "freshness pending";
  const sourceWeakDetails = weakSourceDetails(sourceHealth?.completeness);
  const weakAssumption = mathGaps[0] || "source freshness";
  const visibleWarnings = warnings.filter(Boolean).slice(0, 2);
  const decisionLabel =
    showFlipEconomics && dealVerdict === "pass"
      ? "Pass for now"
      : showFlipEconomics && dealVerdict === "hold"
        ? "Watch closely"
        : !showFlipEconomics
          ? // Non-flip: judge the ask against the market estimate, not a resale spread.
            belowMarket > 0 && mathConfidence !== "Low"
            ? "Possible buy"
            : "Needs check"
          : profitEstimate > 1500 && mathConfidence !== "Low"
            ? "Possible buy"
            : profitEstimate > 0
              ? "Needs check"
              : "Pass for now";
  const decisionTone =
    decisionLabel === "Possible buy"
      ? "text-[var(--green)]"
      : decisionLabel === "Watch closely" || decisionLabel === "Needs check"
        ? "text-[var(--amber-d)]"
        : "text-[var(--red)]";
  const decisionReasons = [
    showFlipEconomics
      ? profitEstimate > 0
        ? `$${profitEstimate.toLocaleString()} estimated spread`
        : "no positive spread yet"
      : belowMarket > 0
        ? `asking $${belowMarket.toLocaleString()} under market est.`
        : resaleBasis > 0
          ? "asking at or above market est."
          : "market value not on file yet",
    mathConfidence === "Low"
      ? `low confidence until ${weakAssumption} is known`
      : `${mathConfidence.toLowerCase()} valuation confidence`,
    trustSignals.length >= 4
      ? "listing fields are present; verify with the seller"
      : "listing details are incomplete",
  ];
  const explainedWhyShown = trustExplanation?.reasons?.length
    ? trustExplanation.reasons
    : whyShown;
  const explanationNextChecks =
    trustExplanation?.nextChecks?.filter(Boolean) || [];
  const explainedConfidenceSummary =
    trustExplanation?.summary ||
    (confidenceScore >= 82
      ? "Ready for a closer buyer review."
      : confidenceScore >= 62
        ? copy.confidenceReview
        : copy.confidenceThin);
  const proxiedUrl = proxiedImage(imageUrl) || imageUrl;

  return (
    <motion.div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
      className={cn(
        "glass-panel flex flex-col overflow-hidden group select-none",
        onClick &&
          "cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--amber)] focus-visible:outline-none",
      )}
      whileHover={onClick ? { y: -3, scale: 1.01 } : undefined}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {/* Image Header */}
      <div className="relative w-full h-40 bg-[var(--s2)] overflow-hidden shrink-0">
        <img
          src={proxiedUrl || "/images/car-placeholder.jpg"}
          alt={`${year} ${make} ${model}`}
          className="h-full w-full object-cover opacity-100 transition-transform duration-300 group-hover:scale-[1.02]"
          onError={(e) => {
            e.currentTarget.src = "/images/car-placeholder.jpg";
          }}
        />
        {/* Gradient overlay for premium feel */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--s1)] via-transparent to-transparent opacity-35" />
        <div
          data-testid="dealcard-photo-price"
          className="absolute bottom-3 left-3 max-w-[calc(100%-24px)] rounded-md bg-black/80 px-3 py-2 text-white"
        >
          <p className="text-[10px] font-semibold">{copy.priceLabel(source)}</p>
          <p className="font-mono text-xl font-extrabold">
            {askPrice > 0 ? `$${askPrice.toLocaleString()}` : "Not reported"}
          </p>
        </div>
      </div>

      {/* Top strip: source badge + score ring */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--b1)", background: "var(--s1)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <SourceBadge
            source={source}
            sourceUrl={sourceUrl}
            size="md"
            showChannel
            className="shrink-0"
          />
          {verdict && (
            <span
              className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-[var(--r1)] shrink-0"
              style={{ background: verdict.bg, color: verdict.text }}
              title="Engine verdict"
            >
              {verdict.label}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4 flex-1">
        {/* Title */}
        <h3
          className="font-bold text-[var(--t1)] text-base leading-tight"
          style={{ transition: "color 170ms cubic-bezier(.16,1,.3,1)" }}
        >
          <span className="group-hover:text-[var(--amber)] transition-colors">
            {year} {make} {model}
          </span>
        </h3>
        <div
          data-testid="dealcard-price"
          className="grid grid-cols-2 gap-3 border-b border-[var(--b1)] pb-3"
        >
          <div>
            <p className="text-[10px] uppercase text-[var(--t4)] font-semibold mb-1">
              {copy.priceLabel(source)}
            </p>
            <Mono className="text-xl font-extrabold text-[var(--t1)]">
              {askPrice > 0 ? `$${askPrice.toLocaleString()}` : "Not reported"}
            </Mono>
          </div>
          <div>
            <p className="text-[10px] uppercase text-[var(--t4)] font-semibold mb-1">
              {resaleBasisLabel}
            </p>
            <Mono
              className="text-sm font-bold text-[var(--t3)]"
              title={resaleBasisTitle}
            >
              {resaleBasis ? `$${resaleBasis.toLocaleString()}` : "Unknown"}
            </Mono>
            {sellEstimate && !mmrValue && (
              <p className="text-[10px] text-[var(--t4)]">Needs comps</p>
            )}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-[var(--t3)]">
          {freshnessText}
          {!recentSoldEvidence ? " · Sold comparisons not verified" : ""}
        </p>

        {/* Trim + body type + recall badge — NHTSA-decoded, when known */}
        {(trim ||
          bodyClass ||
          (recallsCount ?? 0) > 0 ||
          (priceDropAmount ?? 0) > 0 ||
          (dom ?? 0) > 0) && (
          <div className="flex items-center gap-2 flex-wrap -mt-0.5">
            {(trim || bodyClass) && (
              <span className="text-[11px] text-[var(--t4)] truncate">
                {[trim, bodyClass].filter(Boolean).join(" · ")}
              </span>
            )}
            {(recallsCount ?? 0) > 0 && (
              <span
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{
                  background: "var(--amber-lo)",
                  color: "var(--amber-d)",
                }}
                title={`${recallsCount} open NHTSA recall(s) — negotiation leverage`}
              >
                ⚠ {recallsCount}
              </span>
            )}

            {/* Price Drop Badge */}
            {priceDropAmount && priceDropAmount > 0 && (
              <span
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{ background: "var(--glo)", color: "var(--green)" }}
              >
                📉 -${priceDropAmount.toLocaleString()}{" "}
                {priceDropDays && priceDropDays <= 3 ? "recently" : ""}
              </span>
            )}

            {/* DOM Badge */}
            {dom != null && dom > 0 && tier && (
              <span
                className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                style={{
                  color: tier.color,
                  border: `1px solid ${tier.color}40`,
                }}
              >
                ⏳ {dom} days ({tier.label})
              </span>
            )}
          </div>
        )}

        {/* Location + mileage */}
        <div className="flex items-center gap-2 text-xs text-[var(--t3)] flex-wrap">
          {location && (
            <span className="flex items-center gap-1">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 21C12 21 5 13.5 5 9a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              {location}
            </span>
          )}
          {location && mileage ? <span className="opacity-30">·</span> : null}
          {mileage ? (
            <Mono className="text-[var(--t2)] text-[11px]">
              {mileage.toLocaleString()} mi
            </Mono>
          ) : null}
        </div>

        {dataQuality && dataQuality.missing.length > 0 && (
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                Completeness
              </span>
              <span className="text-[10px] font-bold text-[var(--t3)]">
                {dataQuality.label}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
              Missing {qualityMissingText(dataQuality.missing, 3)}
              {dataQuality.missing.length > 3
                ? `, +${dataQuality.missing.length - 3}`
                : ""}
            </p>
          </div>
        )}

        <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
              Decision
            </span>
            <span
              className={cn("text-[10px] font-black uppercase", decisionTone)}
            >
              {decisionLabel}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
            {decisionReasons.join(" · ")}.
          </p>
          {(explanationNextChecks.length > 0 || mathGaps.length > 0) && (
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--t5)]">
              {copy.checksPrefix}{" "}
              {(explanationNextChecks.length ? explanationNextChecks : mathGaps)
                .slice(0, 3)
                .join(", ")}
              {(explanationNextChecks.length
                ? explanationNextChecks.length
                : mathGaps.length) > 3
                ? `, +${
                    (explanationNextChecks.length
                      ? explanationNextChecks.length
                      : mathGaps.length) - 3
                  }`
                : ""}
              .
            </p>
          )}
        </div>

        {visibleWarnings.length > 0 && (
          <p className="text-xs leading-relaxed text-[var(--amber-d)]">
            {visibleWarnings.join(" ")}
          </p>
        )}
        <details className="group/details border-t border-[var(--b1)] py-2">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-[var(--t3)] [&::-webkit-details-marker]:hidden">
            <span>Costs & evidence</span>
            <span aria-hidden="true">+</span>
          </summary>
          <div className="mt-3 space-y-3">
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Cost estimates
                </span>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase",
                    mathConfidence === "High"
                      ? "text-[var(--green)]"
                      : mathConfidence === "Medium"
                        ? "text-[var(--amber-d)]"
                        : "text-[var(--red)]",
                  )}
                >
                  {mathConfidence} confidence
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <span className="text-[var(--t4)]">{copy.basisRowLabel}</span>
                <Mono className="text-right font-bold text-[var(--t2)]">
                  {resaleBasis ? `$${resaleBasis.toLocaleString()}` : "Unknown"}
                </Mono>
                <span className="text-[var(--t4)]">Cost scenario (est.)</span>
                <Mono className="text-right font-bold text-[var(--t2)]">
                  {knownCostTotal
                    ? `$${knownCostTotal.toLocaleString()}`
                    : "Thin"}
                </Mono>
              </div>
              {costStack.length > 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--t4)]">
                  {costStack
                    .map(
                      (item) =>
                        `${item.label}: $${item.value.toLocaleString()}`,
                    )
                    .join(" · ")}
                </p>
              )}
              {mathGaps.length > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--t5)]">
                  Needs {mathGaps.slice(0, 3).join(", ")}
                  {mathGaps.length > 3 ? `, +${mathGaps.length - 3}` : ""}.
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-2.5 py-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Proof
                </p>
                <p className="mt-0.5 text-xs font-black text-[var(--t2)]">
                  {fieldProof.filter((item) => item.present).length}/
                  {fieldProof.length}
                </p>
              </div>
              <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-2.5 py-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Source
                </p>
                <p
                  className={cn(
                    "mt-0.5 truncate text-xs font-black",
                    sourceHealthTone,
                  )}
                >
                  {sourceHealthLabel}
                </p>
              </div>
              <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-2.5 py-2">
                <p className="text-[9px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Confidence
                </p>
                <p className={cn("mt-0.5 text-xs font-black", confidenceTone)}>
                  {confidenceScore}/100
                </p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Field proof
                </span>
                <span className="text-[10px] font-black uppercase text-[var(--t3)]">
                  {fieldProof.filter((item) => item.present).length}/
                  {fieldProof.length}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {fieldProof.map((item) => (
                  <span
                    key={item.label}
                    className={cn(
                      "rounded-[var(--r1)] border px-1.5 py-1 text-center text-[9px] font-black uppercase leading-none",
                      item.present
                        ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                        : "border-[var(--b1)] bg-[var(--s0)] text-[var(--t5)]",
                    )}
                    title={
                      item.present
                        ? `${item.label} is present`
                        : `${item.label} is missing or unknown`
                    }
                  >
                    {item.present ? "✓ " : "– "}
                    {item.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-[var(--r1)] bg-[var(--s0)] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Trust
                </span>
                <span className="text-[10px] font-black uppercase text-[var(--t3)]">
                  {freshnessText}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                {sourceUrl
                  ? isSourceLandingPage(sourceUrl)
                    ? "Seller website"
                    : "Listing link"
                  : "No source link"}{" "}
                ·{" "}
                {trustSignals.length
                  ? `${trustSignals.length}/6 key signals present`
                  : "No key signals present"}
                {dataQuality?.missing.length
                  ? ` · missing ${qualityMissingText(dataQuality.missing, 2)}`
                  : ""}
              </p>
            </div>

            <div className="rounded-[var(--r1)] bg-[var(--s0)] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Source
                </span>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase",
                    sourceHealthTone,
                  )}
                >
                  {sourceHealthLabel}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                {sourceHealth?.proofSummary
                  ? sourceHealth.proofSummary
                  : sourceHealth
                    ? `${Number(sourceHealth.activeRows || 0).toLocaleString()} scoped rows · ${Number(
                        sourceHealth.rowsWithPhotos || 0,
                      ).toLocaleString()} photos · ${Number(
                        sourceHealth.photoCoveragePct || 0,
                      )}% photo coverage · ${sourceHealthFreshness}`
                    : "No scoped source health was returned for this result yet."}
              </p>
              {sourceHealth?.proofBadges?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {sourceHealth.proofBadges.slice(0, 5).map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-[var(--b1)] bg-[var(--s1)] px-2 py-0.5 text-[10px] font-black text-[var(--t4)]"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
              {sourceWeakDetails.length > 0 && (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--t5)]">
                  Source is thin on{" "}
                  {sourceWeakDetails
                    .map((item) => `${item.label} ${item.value}%`)
                    .join(", ")}
                  .
                </p>
              )}
              {sourceHealth?.nextAction && (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--t5)]">
                  {sourceHealth.nextAction}
                </p>
              )}
            </div>

            {explainedWhyShown.length > 0 && (
              <div className="rounded-[var(--r1)] bg-[var(--s0)] px-2.5 py-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Why shown
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                  {explainedWhyShown.join(" · ")}
                  {lastSeenText ? ` · seen ${lastSeenText}` : ""}
                </p>
              </div>
            )}

            <div className="rounded-[var(--r1)] bg-[var(--s0)] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Confidence
                </span>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase",
                    confidenceTone,
                  )}
                >
                  {confidenceLabel} · {confidenceScore}/100
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                Based on listing completeness, source proof, and buyer math.{" "}
                {explainedConfidenceSummary}
              </p>
            </div>

            {visibleWarnings.length > 0 && (
              <div className="rounded-[var(--r1)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-2.5 py-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--amber-d)]">
                  Risk notes
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--amber-d)]">
                  {visibleWarnings.join(" ")}
                </p>
              </div>
            )}

            {actionDetails.length > 0 && (
              <div className="rounded-[var(--r1)] bg-[var(--s0)] px-2.5 py-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Listing
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                  {actionDetails.join(" · ")}
                </p>
              </div>
            )}

            <div className="rounded-[var(--r1)] bg-[var(--s0)] px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Valuation
                </span>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase",
                    valuationBasis === "comps"
                      ? "text-[var(--green)]"
                      : valuationBasis === "market"
                        ? "text-[var(--amber-d)]"
                        : "text-[var(--t5)]",
                  )}
                >
                  {valuationBasisLabel}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                {resaleBasis
                  ? `$${resaleBasis.toLocaleString()} ${copy.basisNoun}`
                  : copy.basisMissingShort}
                {" · "}
                {valuationConfidence} confidence
                {valuationProof.length
                  ? ` · ${valuationProof.join(" · ")}`
                  : ""}
              </p>
              {valuationSource !== "comparables" && (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--t5)]">
                  {valuationSource === "third_party"
                    ? "One external benchmark helps, but title, mileage, and sold comps still need confirmation."
                    : valuationSource === "historical_estimate"
                      ? copy.historicalNote
                      : valuationSource === "asking_price"
                        ? "Anchored to the seller's ask, not a completed sale. Confirm with independent comps."
                        : copy.modeledNote}
                </p>
              )}
            </div>
          </div>
        </details>

        {/* Big profit (flip desk only) */}
        <div className="flex items-end justify-between mt-auto pt-1 gap-2">
          {showFlipEconomics ? (
            <div data-testid="dealcard-flip-economics">
              <p className="text-[9px] uppercase tracking-widest text-[var(--t4)] font-semibold mb-0.5">
                Net Profit Est.
              </p>
              {needsComps ? (
                <>
                  <Mono className="text-2xl font-black leading-none text-[var(--t3)]">
                    —
                  </Mono>
                  <p className="text-[10px] text-[var(--t4)] font-medium mt-1">
                    Needs comps
                  </p>
                </>
              ) : (
                <Mono
                  className="text-2xl font-black leading-none"
                  style={{ color: isPositive ? "var(--green)" : "var(--red)" }}
                >
                  {isPositive ? "+" : "-"}$
                  {Math.abs(profitEstimate).toLocaleString()}
                </Mono>
              )}
              {!needsComps && recommendedMaxBid != null && (
                <p className="text-[10px] text-[var(--t4)] font-medium mt-1">
                  Max bid{" "}
                  <Mono className="text-[var(--t2)] font-bold">
                    ${recommendedMaxBid.toLocaleString()}
                  </Mono>
                </p>
              )}
            </div>
          ) : (
            <div />
          )}

          {(condition || damageType) && (
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-[var(--r1)] max-w-[120px] text-right leading-tight shrink-0"
              style={{
                background: damageType ? "var(--rlo)" : "var(--glo)",
                color: damageType ? "var(--red)" : "var(--green)",
              }}
            >
              {formatCondition(condition, damageType)}
            </span>
          )}
        </div>
      </div>

      {/* MikeHunt advisor read: tap-to-check (rate-limited API), never a guessed number */}
      <div className="px-4 py-1 border-t" style={{ borderColor: "var(--b1)" }}>
        <AdvisorSummary
          flipDesk={flipDesk}
          deal={{ id }}
        />
      </div>

      {/* Footer CTA */}
      <div
        className="px-4 py-3 border-t flex items-center justify-between gap-3"
        style={{ borderColor: "var(--b1)", background: "var(--s1)" }}
      >
        <span className="text-[11px] text-[var(--t4)] font-medium font-mono truncate">
          #{id.slice(0, 8).toUpperCase()}
        </span>
        {onSave && (
          <button
            type="button"
            aria-label={
              isSaved
                ? "Remove vehicle from watchlist"
                : "Add vehicle to watchlist"
            }
            title={
              isSaved
                ? "Remove vehicle from watchlist"
                : "Add vehicle to watchlist"
            }
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center justify-center rounded-[var(--r2)] border px-3 py-1.5 text-[11px] font-black transition-colors",
              isSaved
                ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                : "border-[var(--b2)] bg-[var(--s0)] text-[var(--t2)] hover:border-[var(--amber-bd)]",
            )}
            aria-pressed={!!isSaved}
          >
            {isSaved ? "Watching" : "Watch"}
          </button>
        )}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hidden min-w-0 truncate text-[11px] font-bold text-[var(--t4)] hover:text-[var(--t1)] sm:block"
          >
            Source
          </a>
        )}
        {sellerPhone && (
          <a
            href={`tel:${sellerPhone}`}
            onClick={(e) => e.stopPropagation()}
            className="hidden min-w-0 truncate text-[11px] font-bold text-[var(--t4)] hover:text-[var(--t1)] md:block"
          >
            Call
          </a>
        )}
        {sellerEmail && (
          <a
            href={`mailto:${sellerEmail}`}
            onClick={(e) => e.stopPropagation()}
            className="hidden min-w-0 truncate text-[11px] font-bold text-[var(--t4)] hover:text-[var(--t1)] lg:block"
          >
            Email
          </a>
        )}
        {sellerContactUrl && (
          <a
            href={sellerContactUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hidden min-w-0 truncate text-[11px] font-bold text-[var(--t4)] hover:text-[var(--t1)] lg:block"
          >
            Contact
          </a>
        )}
        <motion.a
          href={primaryHref}
          target={primaryTarget}
          rel={primaryRel}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs font-bold text-white rounded-[var(--r2)] px-3 py-1.5 shrink-0 border-none"
          style={{
            background: "var(--grad)",
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {isLivePreview ? "Open Source" : "View Deal"}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </motion.a>
      </div>
    </motion.div>
  );
});

// Shimmer skeleton for loading grid
export function DealCardSkeleton() {
  return (
    <div
      className="glass-panel flex flex-col overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--b1)", background: "var(--s1)" }}
      >
        <div className="h-5 w-16 rounded-[var(--r1)] shimmer" />
        <div className="w-9 h-9 rounded-full shimmer" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="h-5 w-3/4 rounded-[var(--r2)] shimmer" />
        <div className="h-3 w-1/2 rounded-[var(--r1)] shimmer" />
        <div className="h-14 w-full rounded-[var(--r2)] shimmer" />
        <div className="h-7 w-1/2 rounded-[var(--r2)] shimmer mt-1" />
      </div>
      <div
        className="px-4 py-3 border-t flex items-center justify-between"
        style={{ borderColor: "var(--b1)", background: "var(--s1)" }}
      >
        <div className="h-3 w-16 rounded-[var(--r1)] shimmer" />
        <div className="h-7 w-20 rounded-[var(--r2)] shimmer" />
      </div>
    </div>
  );
}
