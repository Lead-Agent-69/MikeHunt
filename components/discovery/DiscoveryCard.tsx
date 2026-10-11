"use client";

import React, { memo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { DiscoveryDeal } from "./types";
import { proxiedImage } from "@/lib/image-url";
import {
  sourceMeta,
  buyTerms,
  tint,
  sellerTypeLabel,
  sourceLabel,
} from "@/lib/sources/source-meta";
import { CONFIDENCE_META } from "@/lib/valuation/confidence";
import {
  readCondition,
  CONDITION_TIER_COLOR,
} from "@/lib/intelligence/condition";
import { useDiscoverySave } from "./DiscoverySaveProvider";
import {
  discoveryConditionLabel,
  discoveryEvidence,
  discoveryReason,
} from "./card-evidence";
import { Bookmark, Clock3, Flame, Zap } from "lucide-react";
import { listingFreshnessLabel } from "@/lib/deals/listing-freshness";
import { TitleBadge } from "@/components/shared/TitleBadge";

// Short, glanceable lane labels ΓÇö the channel/risk a dealer reads instantly (color from the API).
const LANE_LABELS: Record<string, string> = {
  auction: "Auction",
  salvage: "Salvage",
  repairable: "Repairable",
  "clean-retail": "Retail",
  private: "Private",
};

/** Graceful image placeholder when a deal has no photos / a broken URL. */
function Placeholder() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: "var(--s2)" }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--t5)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
        <circle cx="7" cy="17" r="2" />
        <circle cx="17" cy="17" r="2" />
      </svg>
    </div>
  );
}

/**
 * Compact, tappable discovery card ΓÇö CarGurus/Kayak feel. Image-forward, with a
 * market deal-grade badge, prominent ask price, the key Kayak "found on N sites"
 * multi-source signal, and a subtle max-bid hint for the flipper.
 */
export const DiscoveryCard = memo(function DiscoveryCard({
  deal,
}: {
  deal: DiscoveryDeal;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const reducedMotion = useReducedMotion();
  const bookmark = useDiscoverySave(deal);
  const img = proxiedImage(deal.images?.[0]);
  const showImg = img && !imgFailed;
  const title =
    deal.title ||
    `${deal.year ?? ""} ${deal.make ?? ""} ${deal.model ?? ""}`.trim();
  const location = [deal.locationCity, deal.locationState]
    .filter(Boolean)
    .join(", ");
  const multi = deal.listingCount > 1;
  // Channel-correct wording so an auction's CURRENT BID isn't shown as a fixed "purchase price".
  const terms = buyTerms(deal.source);
  const sourceChannel = sourceMeta(deal.source).channel;
  const laneLabel =
    deal.lane === "private" && sourceChannel === "dealer"
      ? "Dealer"
      : deal.lane === "private" && sourceChannel === "retail"
        ? "Retail"
        : LANE_LABELS[deal.lane || ""] || deal.lane;
  // Operability read ΓÇö "Runs & drives" vs "Needs work" vs "Non-runner": the first thing a flipper checks.
  const cond = readCondition(deal.condition, deal.damageType, title);
  const href =
    deal.id.startsWith("live-") && deal.sourceUrl
      ? deal.sourceUrl
      : `/deal/${deal.id}`;
  const external = href.startsWith("http");
  const isSaved = bookmark.saved;
  const evidence = discoveryEvidence(deal);
  const priceLabel =
    "saleTermsUnclear" in evidence ? "Listed amount" : terms.priceLabel;
  const decision = {
    label: evidence.label,
    background: "rgba(35, 43, 55, .88)",
    color: "#ffffff",
  };

  return (
    <motion.div
      layout
      initial={reducedMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-20px" }}
      whileHover={reducedMotion ? undefined : { y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="w-[calc(100vw-2.5rem)] max-w-[358px] shrink-0 sm:w-[300px]"
      style={{ scrollSnapAlign: "start" }}
    >
      <div
        className="deal-card glass-panel interactive-surface group flex flex-col overflow-hidden premium-focus"
        style={{ padding: 0, height: "100%", borderRadius: 8 }}
      >
        {/* Image */}
        <div
          className="relative w-full aspect-[4/3] overflow-hidden"
          style={{ background: "var(--s2)" }}
        >
          <Link
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            aria-label={`View ${title}${external ? " at the source (opens in a new tab)" : ""}`}
            className="absolute inset-0 inline-flex min-h-11 items-center focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[var(--blue)]"
          >
            {showImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt={title}
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105 motion-reduce:transition-none"
              />
            ) : (
              <Placeholder />
            )}
          </Link>

          <span
            className="pointer-events-none absolute left-2.5 top-2.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black"
            style={{ background: decision.background, color: decision.color }}
          >
            {decision.label}
          </span>

          {/* Multi-source chip ΓÇö floating top-right (the Kayak signal) */}
          {multi && (
            <span
              className="pointer-events-none absolute right-2.5 top-12 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-white"
              style={{
                background: "rgba(36,28,43,.72)",
                backdropFilter: "blur(8px)",
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
              {deal.listingCount} sites
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void bookmark.toggle();
            }}
            className="absolute right-2.5 top-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-white motion-safe:transition-transform motion-safe:hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber)] disabled:cursor-wait disabled:opacity-70"
            style={{
              background: isSaved ? "var(--amber)" : "rgba(20,10,20,.72)",
              backdropFilter: "blur(8px)",
            }}
            title={bookmark.label}
            aria-label={bookmark.label}
            aria-busy={bookmark.busy}
            disabled={bookmark.busy}
          >
            <Bookmark
              size={15}
              fill={isSaved ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex justify-between items-start gap-2">
            <Link
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="inline-flex min-h-11 min-w-0 items-center break-words rounded-sm text-[17px] font-black leading-tight text-[var(--t1)] transition-colors hover:text-[var(--blue)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
            >
              {title}
            </Link>
            {deal.vin && (
              <span className="font-mono text-[10px] text-[var(--t4)] shrink-0 group-hover:text-[var(--t2)] transition-colors">
                {deal.vin.slice(-6)}
              </span>
            )}
          </div>
          <div
            data-testid="discovery-card-price"
            className="grid grid-cols-2 gap-2 border-b border-[var(--b1)] pb-3"
          >
            <div>
              <p className="text-[10px] font-bold uppercase text-[var(--t4)] mb-1">
                {priceLabel}
              </p>
              <span className="font-mono text-xl font-black text-[var(--t1)]">
                {Number.isFinite(deal.askPrice) && deal.askPrice > 0
                  ? `$${deal.askPrice.toLocaleString()}`
                  : "Not reported"}
              </span>
            </div>
            {evidence.acquisitionReady && deal.recommendedMaxBid ? (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-[var(--t4)] mb-1">
                  Purchase ceiling
                </p>
                <span className="font-mono text-[17px] font-black text-[var(--green)]">
                  ${Math.round(deal.recommendedMaxBid).toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>

          {/* VIN-graph red flag ΓÇö the moat made visible. Loud red for misrepresentation traps (a
              "clean" car our cross-market records show was salvaged/washed/rolled-back); a subtle chip
              for a car that already discloses its history. */}
          {deal.vinFlags && deal.vinFlags.length > 0 && (
            <span
              className="inline-flex w-fit items-center gap-1 rounded-[var(--r1)] px-2 py-0.5 text-[10px] font-bold"
              style={
                deal.vinFlagSeverity === "high"
                  ? { background: "var(--rlo)", color: "var(--red)" }
                  : { background: "var(--amber-lo)", color: "var(--amber-d)" }
              }
              title={deal.vinFlags.join(" / ")}
            >
              {deal.vinFlagSeverity === "high" ? "Warning: " : ""}
              {deal.vinFlags.find((f) =>
                /washing|rollback|salvage|flood|fire/i.test(f),
              ) || deal.vinFlags[0]}
            </span>
          )}

          {/* Meta: lane ┬╖ mileage ┬╖ location */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--t4)]">
            {deal.lane && deal.laneColor && (
              <span
                className="inline-flex items-center gap-1 rounded-[var(--r1)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{
                  background: `${deal.laneColor}22`,
                  color: deal.laneColor,
                }}
                title={`${laneLabel} channel`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: deal.laneColor }}
                />
                {laneLabel}
              </span>
            )}
            {cond && (
              <span
                className="inline-flex items-center gap-1 rounded-[var(--r1)] px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  background: `${CONDITION_TIER_COLOR[cond.tier]}1f`,
                  color: CONDITION_TIER_COLOR[cond.tier],
                }}
                title={
                  cond.runs === "yes"
                    ? "Listing reports runs & drives. Verify with an inspection."
                    : cond.runs === "no"
                      ? "Listing reports a non-runner or parts-only vehicle. Verify with the source."
                      : "Operability unconfirmed"
                }
              >
                {discoveryConditionLabel(cond)}
                {cond.detail ? ` / ${cond.detail}` : ""}
              </span>
            )}
            {deal.mileage != null && Number.isFinite(deal.mileage) ? (
              <span className="font-mono text-[var(--t3)]">
                {deal.mileage.toLocaleString()} mi
              </span>
            ) : null}
            {deal.mileage != null && location ? (
              <span className="opacity-30" aria-hidden="true">
                /
              </span>
            ) : null}
            {location && (
              <span className="inline-flex items-center gap-1 truncate">
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
          </div>

          <TitleBadge
            className="w-fit"
            condition={deal.condition}
            damageType={deal.damageType}
            titleSource={deal.titleSource}
          />

          {/* Contextual reason (distance, win-pattern) when a rail provides one */}
          {deal.winReason && (
            <span
              className="w-fit inline-flex items-center gap-1 rounded-[var(--r1)] px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--amber-lo)", color: "var(--amber-d)" }}
            >
              {deal.winReason}
            </span>
          )}

          {deal.matchReasons && deal.matchReasons.length > 0 && (
            <details className="text-[11px] text-[var(--t3)]">
              <summary className="min-h-11 cursor-pointer py-3 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
                Why shown
              </summary>
              <div className="mt-1 flex flex-wrap gap-1">
                {deal.matchReasons.slice(0, 4).map((reason) => (
                  <span
                    key={reason}
                    className="rounded-full bg-[var(--s2)] px-1.5 py-0.5 font-bold text-[var(--t3)]"
                  >
                    {discoveryReason(reason)}
                  </span>
                ))}
              </div>
            </details>
          )}

          <p className="text-[11px] font-semibold text-[var(--t4)]">
            {listingFreshnessLabel(deal)} /{" "}
            {deal.sourceUrl ? "source linked" : "source link unavailable"}
          </p>
          <p className="text-xs leading-relaxed text-[var(--t3)]">
            {evidence.nextCheck}
          </p>

          <details className="border-t border-[var(--b1)] pt-2">
            <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-[var(--t3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
              Cost estimates and source details
            </summary>
            <p className="text-[11px] leading-relaxed text-[var(--t3)]">
              {deal.askPrice > 0
                ? `${priceLabel} $${deal.askPrice.toLocaleString()}`
                : "Price not reported"}
              {" · "}
              {deal.soldAnchored &&
              deal.sellEstimate &&
              (deal.compCount || 0) > 0
                ? `Comp-backed resale $${Math.round(deal.sellEstimate).toLocaleString()} · ${deal.compCount} comps`
                : deal.sellEstimate && !deal.soldAnchored
                  ? `Ask-based estimate $${Math.round(deal.sellEstimate).toLocaleString()}${
                      deal.compCount ? ` · ${deal.compCount} listing asks` : ""
                    }`
                  : "Resale basis not on file."}
              {` · ${listingFreshnessLabel(deal)}`}
              {deal.valueAsOf
                ? ` · as of ${new Date(deal.valueAsOf).toLocaleDateString()}`
                : ""}
              {deal.source ? ` · ${sourceLabel(deal.source)}` : ""}
              {deal.sellerType === "dealer" || deal.sellerType === "private"
                ? ` · ${sellerTypeLabel(deal.sellerType)}`
                : ""}
            </p>

            {/* Sell estimate + max bid ΓÇö the context that makes the profit number mean something. */}
            <p className="text-[11px] leading-relaxed text-[var(--t4)]">
              Listing and model estimates, not inspection findings or guaranteed
              sale prices.
            </p>
            {(deal.sellEstimate || deal.recommendedMaxBid) && (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px]">
                <div
                  className="flex items-center justify-between rounded-[var(--r1)] px-2 py-1"
                  style={{ background: "var(--s1)" }}
                >
                  <span className="flex items-center gap-1 font-semibold text-[var(--t4)]">
                    Sell est
                    {deal.valueConfidence && (
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{
                          background:
                            CONFIDENCE_META[deal.valueConfidence].color,
                        }}
                        title={`${CONFIDENCE_META[deal.valueConfidence].label} confidence: ${CONFIDENCE_META[deal.valueConfidence].blurb}${
                          deal.valueEvidence
                            ? ` / backed by ${deal.valueEvidence} real comps/sales`
                            : ""
                        }`}
                      />
                    )}
                  </span>
                  <span className="font-mono font-bold text-[var(--t2)]">
                    {deal.sellEstimate
                      ? `$${Math.round(deal.sellEstimate).toLocaleString()}`
                      : "Not available"}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between rounded-[var(--r1)] px-2 py-1"
                  style={{ background: "var(--s1)" }}
                >
                  <span className="font-semibold text-[var(--t4)]">
                    Model ceiling (unverified)
                  </span>
                  <span className="font-mono font-bold text-[var(--green)]">
                    {deal.recommendedMaxBid
                      ? `$${Math.round(deal.recommendedMaxBid).toLocaleString()}`
                      : "Not available"}
                  </span>
                </div>
              </div>
            )}

            {(deal.repairEstimate || deal.transportEstimate) && (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[10px]">
                <div
                  className="flex items-center justify-between rounded-[var(--r1)] px-2 py-1"
                  style={{ background: "var(--s1)" }}
                >
                  <span className="font-semibold text-[var(--t4)]">Repair</span>
                  <span className="font-mono font-bold text-[var(--t2)]">
                    {deal.repairEstimate
                      ? `$${Math.round(deal.repairEstimate).toLocaleString()}`
                      : "Not available"}
                  </span>
                </div>
                <div
                  className="flex items-center justify-between rounded-[var(--r1)] px-2 py-1"
                  style={{ background: "var(--s1)" }}
                >
                  <span className="font-semibold text-[var(--t4)]">
                    Transport
                  </span>
                  <span className="font-mono font-bold text-[var(--t2)]">
                    {deal.transportEstimate
                      ? `$${Math.round(deal.transportEstimate).toLocaleString()}`
                      : "Not available"}
                  </span>
                </div>
              </div>
            )}

            {/* Cross-source price compare (Kayak): the SAME car on each source, brand-chipped,
              cheapest first + outlined ΓÇö so a dealer sees who has it and for how much at a glance. */}
            {multi && (
              <div
                className="mt-1 rounded-[var(--r2)] px-2.5 py-2"
                style={{ background: "var(--s1)" }}
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--t4)]">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--amber)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  Same car on {deal.listingCount} sources
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { source: deal.source, askPrice: deal.askPrice },
                    ...deal.alsoOn,
                  ]
                    .slice()
                    .sort(
                      (a, b) =>
                        (a.askPrice || Infinity) - (b.askPrice || Infinity),
                    )
                    .map((s, i) => {
                      const m = sourceMeta(s.source);
                      const isCheapest = i === 0;
                      return (
                        <span
                          key={`${s.source}-${i}`}
                          className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{
                            background: tint(m.color, isCheapest ? 0.22 : 0.1),
                            color: m.color,
                            boxShadow: isCheapest
                              ? `inset 0 0 0 1px ${m.color}`
                              : undefined,
                          }}
                          title={`${m.label}${isCheapest ? " - lowest reported price" : ""}`}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ background: m.color }}
                          />
                          {m.short}
                          {s.askPrice ? (
                            <span className="font-mono text-[var(--t2)]">
                              ${Math.round(s.askPrice).toLocaleString()}
                            </span>
                          ) : null}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}
          </details>
          <Link
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="mt-1 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--blue)] px-3 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
          >
            {external ? "View source listing" : "Review vehicle"}
          </Link>
        </div>
      </div>
    </motion.div>
  );
});
