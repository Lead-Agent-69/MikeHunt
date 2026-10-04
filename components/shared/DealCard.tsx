"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { Mono } from "./Mono";
import { cn } from "@/lib/utils";
import { daysOnMarket, domTier } from "@/lib/intelligence/days-on-market";
import { type DealCardProps } from "./deal-card/types";
import {
  VERDICT_STYLES,
  formatCondition,
} from "./deal-card/utils";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { buyTerm } from "@/lib/deal-terms";
import { qualityFieldLabel } from "@/lib/data-quality";

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
}: DealCardProps) {
  const dom = daysOnMarket(firstSeenAt);
  const tier = dom != null ? domTier(dom) : null;
  const isPositive = profitEstimate >= 0;
  const location = [locationCity, locationState].filter(Boolean).join(", ");
  const verdict = dealVerdict ? VERDICT_STYLES[dealVerdict] : null;
  const isLivePreview = id.startsWith("live-");
  const primaryHref = isLivePreview && sourceUrl ? sourceUrl : `/deal/${id}`;
  const primaryTarget = isLivePreview && sourceUrl ? "_blank" : undefined;
  const primaryRel = isLivePreview && sourceUrl ? "noreferrer" : undefined;
  const lastSeenText = lastSeenAt
    ? new Date(lastSeenAt).toLocaleDateString()
    : null;
  const freshnessText = relativeFreshness(lastSeenAt || firstSeenAt);
  const auctionEndText = auctionEndAt
    ? new Date(auctionEndAt).toLocaleDateString()
    : null;
  const actionDetails = [
    auctionEndText ? `Ends ${auctionEndText}` : null,
    bidCount != null ? `${bidCount} bid${bidCount === 1 ? "" : "s"}` : null,
    seller ? seller : sellerType ? `${sellerType} seller` : null,
  ].filter(Boolean);
  const whyShown = [
    profitEstimate > 0 ? `+$${profitEstimate.toLocaleString()} net` : null,
    recommendedMaxBid != null
      ? `$${recommendedMaxBid.toLocaleString()} max bid`
      : null,
    sellEstimate != null ? `$${sellEstimate.toLocaleString()} resale` : null,
  ].filter(Boolean);
  const resaleBasis = sellEstimate || mmrValue || 0;
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
    valuation?.confidence ||
    valuation?.compConfidence ||
    (valuationSource === "comparables"
      ? "medium"
      : valuationSource === "third_party" ||
          valuationSource === "historical_estimate"
        ? "low"
        : "none");
  const resaleBasisLabel = soldAnchored
    ? "Comp-backed resale"
    : resaleBasis
      ? "Ask-based estimate"
      : "Resale basis";
  const resaleBasisTitle =
    valuationSource === "comparables"
      ? "Resale estimate backed by comparable listings"
      : valuationSource === "third_party"
        ? "Resale estimate anchored to an external market benchmark"
        : valuationSource === "historical_estimate"
          ? "Estimate derived from prior listing history, not completed-sale proof"
          : valuationSource === "asking_price"
            ? "Estimate anchored to the seller's asking price, not a completed sale"
            : "Modeled resale estimate; verify with comparable sales before bidding";
  const valuationCompCount = Number(valuation?.compCount || 0);
  const valuationSoldCount = Number(valuation?.soldCount || 0);
  const valuationSampleCount = Number(valuation?.sampleCount || 0);
  const valuationProof = [
    valuationCompCount > 0
      ? `${valuationCompCount} comparable${valuationCompCount === 1 ? "" : "s"}`
      : null,
    valuationSoldCount > 0
      ? `${valuationSoldCount} sold`
      : soldAnchored
        ? "sold anchored"
        : null,
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
    askPrice > 0
      ? { label: buyTerm(source).priceLabel, value: askPrice }
      : null,
    repairEstimate && repairEstimate > 0
      ? { label: "Repair", value: repairEstimate }
      : null,
    transportEstimate && transportEstimate > 0
      ? { label: "Transport", value: transportEstimate }
      : null,
  ].filter(Boolean) as { label: string; value: number }[];
  const knownCostTotal = costStack.reduce((sum, item) => sum + item.value, 0);
  const mathConfidence =
    (dataQuality?.score || 0) >= 78 && resaleBasis > 0
      ? "High"
      : (dataQuality?.score || 0) >= 58 || resaleBasis > 0
        ? "Medium"
        : "Low";
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
    (profitEstimate > 0 ? 12 : 0) +
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
    dealVerdict === "pass"
      ? "Pass for now"
      : dealVerdict === "hold"
        ? "Watch closely"
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
    profitEstimate > 0
      ? `$${profitEstimate.toLocaleString()} estimated spread`
      : "no positive spread yet",
    mathConfidence === "Low"
      ? `low confidence until ${weakAssumption} is known`
      : `${mathConfidence.toLowerCase()} math confidence`,
    trustSignals.length >= 4
      ? "source proof is usable"
      : "source proof is thin",
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
        ? "Worth reviewing, but verify weak fields before bidding."
        : "Needs better proof before this should drive a bid.");
  const proxiedUrl = imageUrl?.startsWith("http")
    ? `/api/image/proxy?url=${encodeURIComponent(imageUrl)}`
    : imageUrl;

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
        <p className="text-xs leading-relaxed text-[var(--t3)]">
          {askPrice > 0
            ? `Ask $${askPrice.toLocaleString()}`
            : "Ask not listed"}
          {" · "}
          {soldAnchored && resaleBasis && valuationCompCount > 0
            ? `Comp-backed resale $${resaleBasis.toLocaleString()} · ${valuationCompCount} comps`
            : resaleBasis && !soldAnchored
              ? `Ask-based estimate $${resaleBasis.toLocaleString()}${
                  valuationCompCount > 0
                    ? ` · ${valuationCompCount} listing asks`
                    : ""
                }`
              : "Resale basis not on file."}
          {` · ${freshnessText}`}
          {source ? ` · ${source}` : ""}
          {sellerType === "dealer"
            ? " · Dealer"
            : sellerType === "private"
              ? " · Private"
              : ""}
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
              Tighten before bidding:{" "}
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

        <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
              Buyer math
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
            <span className="text-[var(--t4)]">Resale basis</span>
            <Mono className="text-right font-bold text-[var(--t2)]">
              {resaleBasis ? `$${resaleBasis.toLocaleString()}` : "Unknown"}
            </Mono>
            <span className="text-[var(--t4)]">Known costs</span>
            <Mono className="text-right font-bold text-[var(--t2)]">
              {knownCostTotal ? `$${knownCostTotal.toLocaleString()}` : "Thin"}
            </Mono>
          </div>
          {costStack.length > 0 && (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--t4)]">
              {costStack
                .map((item) => `${item.label}: $${item.value.toLocaleString()}`)
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

        <details className="group/details rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10px] font-black uppercase tracking-wider text-[var(--t4)] [&::-webkit-details-marker]:hidden">
            <span>Review proof</span>
            <span className="text-[var(--t5)] transition-transform group-open/details:rotate-180">
              ▼
            </span>
          </summary>
          <div className="mt-3 space-y-3">
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
                {sourceUrl ? "Direct source link" : "No source link"} ·{" "}
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
                  ? `$${resaleBasis.toLocaleString()} resale basis`
                  : "No resale basis yet"}
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
                      ? "Built from prior active-listing estimates, not verified sale prices. Confirm sold comps before bidding."
                      : valuationSource === "asking_price"
                        ? "Anchored to the seller's ask, not a completed sale. Confirm with independent comps."
                        : "Modeled estimates need sold or market comps before this should drive an aggressive bid."}
                </p>
              )}
            </div>
          </div>
        </details>

        {/* Price grid */}
        <div
          className="rounded-[var(--r2)] grid grid-cols-2 gap-3 px-3 py-2.5"
          style={{ background: "var(--s1)" }}
        >
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[var(--t4)] font-semibold mb-0.5">
              {buyTerm(source).priceLabel}
            </p>
            <Mono className="text-sm font-extrabold text-[var(--t1)]">
              ${askPrice.toLocaleString()}
            </Mono>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[var(--t4)] font-semibold mb-0.5">
              {resaleBasisLabel}
            </p>
            <Mono
              className="text-sm font-extrabold text-[var(--t3)]"
              title={resaleBasisTitle}
            >
              {resaleBasis ? `$${resaleBasis.toLocaleString()}` : "Unknown"}
            </Mono>
            {sellEstimate && !mmrValue && (
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--t5)]">
                Needs comps
              </p>
            )}
          </div>
        </div>

        {/* Big profit */}
        <div className="flex items-end justify-between mt-auto pt-1 gap-2">
          <div>
            <p className="text-[9px] uppercase tracking-widest text-[var(--t4)] font-semibold mb-0.5">
              Net Profit Est.
            </p>
            <Mono
              className="text-2xl font-black leading-none"
              style={{ color: isPositive ? "var(--green)" : "var(--red)" }}
            >
              {isPositive ? "+" : "-"}$
              {Math.abs(profitEstimate).toLocaleString()}
            </Mono>
            {recommendedMaxBid != null && (
              <p className="text-[10px] text-[var(--t4)] font-medium mt-1">
                Max bid{" "}
                <Mono className="text-[var(--t2)] font-bold">
                  ${recommendedMaxBid.toLocaleString()}
                </Mono>
              </p>
            )}
          </div>

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
