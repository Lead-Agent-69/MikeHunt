"use client";

import React, { memo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import type { DiscoveryDeal } from "./types";
import { proxiedImage } from "@/lib/image-url";
import { sourceMeta, buyTerms, tint } from "@/lib/sources/source-meta";
import { CONFIDENCE_META } from "@/lib/valuation/confidence";
import {
  readCondition,
  CONDITION_TIER_COLOR,
} from "@/lib/intelligence/condition";
import {
  toLocalSavedVehicle,
  useLocalSavedVehicles,
} from "@/hooks/useLocalSavedVehicles";
import { discoveryEvidence, discoveryReason } from "./card-evidence";
import { Clock3, Flame, Zap } from "lucide-react";

const TITLE_STYLES: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  clean: {
    label: "Clean title reported",
    bg: "var(--glo)",
    text: "var(--green)",
  },
  rebuilt: { label: "Rebuilt", bg: "var(--amber-lo)", text: "var(--amber-d)" },
  salvage: { label: "Salvage", bg: "var(--rlo)", text: "var(--red)" },
  parts: { label: "Parts Only", bg: "var(--rlo)", text: "var(--red)" },
};

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

function relativeFreshness(value?: string | null) {
  if (!value) return "Freshness unknown";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "Freshness unknown";
  const hours = Math.max(0, Math.round(ms / 3_600_000));
  if (hours < 1) return "Seen just now";
  if (hours < 24) return `Seen ${hours}h ago`;
  return `Seen ${Math.round(hours / 24)}d ago`;
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
  const localSaves = useLocalSavedVehicles();
  const img = proxiedImage(deal.images?.[0]);
  const showImg = img && !imgFailed;
  const title =
    deal.title ||
    `${deal.year ?? ""} ${deal.make ?? ""} ${deal.model ?? ""}`.trim();
  const location = [deal.locationCity, deal.locationState]
    .filter(Boolean)
    .join(", ");
  const titleStyle = deal.titleClass
    ? TITLE_STYLES[deal.titleClass]
    : undefined;
  const multi = deal.listingCount > 1;
  // Channel-correct wording so an auction's CURRENT BID isn't shown as a fixed "purchase price".
  const terms = buyTerms(deal.source);
  // Operability read ΓÇö "Runs & drives" vs "Needs work" vs "Non-runner": the first thing a flipper checks.
  const cond = readCondition(deal.condition, deal.damageType, title);
  const href =
    deal.id.startsWith("live-") && deal.sourceUrl
      ? deal.sourceUrl
      : `/deal/${deal.id}`;
  const external = href.startsWith("http");
  const isSaved = localSaves.has(deal.id);
  const evidence = discoveryEvidence(deal);
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

          <span
            className="absolute left-2.5 top-2.5 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-black"
            style={{ background: decision.background, color: decision.color }}
          >
            {decision.label}
          </span>

          {/* Multi-source chip ΓÇö floating top-right (the Kayak signal) */}
          {multi && (
            <span
              className="absolute right-2.5 top-12 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-white"
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
              if (isSaved) localSaves.remove(deal.id);
              else localSaves.save(toLocalSavedVehicle(deal));
            }}
            className="absolute right-2.5 top-2.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-white transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber)]"
            style={{
              background: isSaved ? "var(--amber)" : "rgba(20,10,20,.72)",
              backdropFilter: "blur(8px)",
            }}
            title={isSaved ? "Remove from saved vehicles" : "Save vehicle"}
            aria-label={isSaved ? "Remove from saved vehicles" : "Save vehicle"}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill={isSaved ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex justify-between items-start gap-2">
            <Link
              href={href}
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              className="min-w-0 break-words text-[17px] font-black leading-tight text-[var(--t1)] transition-colors group-hover:text-[var(--blue)]"
            >
              {title}
            </Link>
            {deal.vin && (
              <span className="font-mono text-[10px] text-[var(--t4)] shrink-0 group-hover:text-[var(--t2)] transition-colors">
                {deal.vin.slice(-6)}
              </span>
            )}
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
                title={`${LANE_LABELS[deal.lane] || deal.lane} channel`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: deal.laneColor }}
                />
                {LANE_LABELS[deal.lane] || deal.lane}
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
                    ? "Runs & drives"
                    : cond.runs === "no"
                      ? "Does not run"
                      : "Operability unconfirmed"
                }
              >
                {cond.label}
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

          {titleStyle && (
            <span
              className="w-fit rounded-[var(--r1)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: titleStyle.bg, color: titleStyle.text }}
              title="Listing-reported title status. Verify the actual title before purchase."
            >
              {titleStyle.label}
            </span>
          )}

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
            <div
              className="rounded-[var(--r2)] px-2.5 py-2 text-[10px]"
              style={{ background: "var(--s1)", border: "1px solid var(--b1)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-black uppercase tracking-wide text-[var(--t4)]">
                  Why shown
                </span>
                <span className="font-bold text-[var(--t3)]">
                  {deal.matchReasons.length} match
                  {deal.matchReasons.length === 1 ? "" : "es"}
                </span>
              </div>
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
            </div>
          )}

          <p className="text-[11px] font-semibold text-[var(--t4)]">
            {relativeFreshness(deal.lastSeenAt)} /{" "}
            {deal.sourceUrl ? "source linked" : "source link unavailable"}
          </p>
          <p className="text-xs leading-relaxed text-[var(--t3)]">
            {evidence.nextCheck}
          </p>

          <p className="text-[11px] leading-relaxed text-[var(--t3)]">
            {`Ask $${deal.askPrice.toLocaleString()}`}
            {" · "}
            {deal.soldAnchored && deal.sellEstimate && (deal.compCount || 0) > 0
              ? `Comp-backed resale $${Math.round(deal.sellEstimate).toLocaleString()} · ${deal.compCount} comps`
              : deal.sellEstimate && !deal.soldAnchored
                ? `Ask-based estimate $${Math.round(deal.sellEstimate).toLocaleString()}${
                    deal.compCount ? ` · ${deal.compCount} listing asks` : ""
                  }`
                : "Resale basis not on file."}
            {` · ${relativeFreshness(deal.lastSeenAt)}`}
            {deal.valueAsOf
              ? ` · as of ${new Date(deal.valueAsOf).toLocaleDateString()}`
              : ""}
            {deal.source ? ` · ${deal.source.replace(/_/g, " ")}` : ""}
            {deal.sellerType === "dealer"
              ? " · Dealer"
              : deal.sellerType === "private"
                ? " · Private"
                : ""}
          </p>

          {/* Price and practical ceiling stay adjacent so the acquisition decision is readable. */}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-2 border-t border-[var(--b1)]">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--t4)]">
                {terms.priceLabel}
              </p>
              <span className="font-mono text-lg font-black leading-none text-[var(--t1)] tracking-tight">
                {Number.isFinite(deal.askPrice) && deal.askPrice > 0
                  ? `$${deal.askPrice.toLocaleString()}`
                  : "Price not reported"}
              </span>
            </div>

            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--t4)]">
                Purchase ceiling
              </p>
              {evidence.acquisitionReady && deal.recommendedMaxBid ? (
                <span className="font-mono text-[17px] font-black leading-none text-[var(--green)]">
                  ${Math.round(deal.recommendedMaxBid).toLocaleString()}
                </span>
              ) : (
                <span className="text-xs font-semibold leading-normal text-[var(--t3)]">
                  Not established
                </span>
              )}
            </div>
          </div>

          {/* Sell estimate + max bid ΓÇö the context that makes the profit number mean something. */}
          <details className="border-t border-[var(--b1)] pt-2">
            <summary className="cursor-pointer py-2 text-xs font-semibold text-[var(--t3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
              Cost estimates and source details
            </summary>
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
            className="mt-1 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--blue)] px-3 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            {external ? "View source listing" : "Review vehicle"}
          </Link>
        </div>
      </div>
    </motion.div>
  );
});
