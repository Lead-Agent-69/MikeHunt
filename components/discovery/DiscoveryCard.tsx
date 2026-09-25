"use client";

import React, { memo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { DealGradeBadge } from "./DealGradeBadge";
import type { DiscoveryDeal } from "./types";
import { liteDealIQ, IQ_TIER_COLOR } from "@/lib/intelligence/lite-iq";
import { daysOnMarket, domTier } from "@/lib/intelligence/days-on-market";
import { proxiedImage } from "@/lib/image-url";
import { sourceMeta, buyTerms, tint } from "@/lib/sources/source-meta";
import { CONFIDENCE_META } from "@/lib/valuation/confidence";
import {
  readCondition,
  CONDITION_TIER_COLOR,
} from "@/lib/intelligence/condition";

const TITLE_STYLES: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  clean: { label: "Clean Title", bg: "var(--glo)", text: "var(--green)" },
  rebuilt: { label: "Rebuilt", bg: "var(--amber-lo)", text: "var(--amber-d)" },
  salvage: { label: "Salvage", bg: "var(--rlo)", text: "var(--red)" },
  parts: { label: "Parts Only", bg: "var(--rlo)", text: "var(--red)" },
};

// Short, glanceable lane labels — the channel/risk a dealer reads instantly (color from the API).
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
 * Compact, tappable discovery card — CarGurus/Kayak feel. Image-forward, with a
 * market deal-grade badge, prominent ask price, the key Kayak "found on N sites"
 * multi-source signal, and a subtle max-bid hint for the flipper.
 */
export const DiscoveryCard = memo(function DiscoveryCard({
  deal,
}: {
  deal: DiscoveryDeal;
}) {
  const [imgFailed, setImgFailed] = useState(false);
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
  // Operability read — "Runs & drives" vs "Needs work" vs "Non-runner": the first thing a flipper checks.
  const cond = readCondition(deal.condition, deal.damageType);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-20px" }}
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      style={{
        width: 280,
        flex: "0 0 auto",
        scrollSnapAlign: "start",
      }}
    >
      <Link
        href={`/deal/${deal.id}`}
        className="deal-card glass-panel group flex flex-col overflow-hidden select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber)]"
        style={{ padding: 0, height: "100%", transition: "border-color 0.2s" }}
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
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <Placeholder />
          )}

          {/* Gradient overlay for better text contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(0,0,0,0.9)] via-[rgba(0,0,0,0.2)] to-transparent pointer-events-none" />

          {/* Grade badge — floating top-left */}
          {deal.grade !== "unknown" && (
            <div className="absolute left-2.5 top-2.5">
              <div style={{ backdropFilter: "blur(8px)" }}>
                <DealGradeBadge
                  grade={deal.grade}
                  gradeLabel={deal.gradeLabel}
                  discountPct={deal.discountPct}
                />
              </div>
            </div>
          )}

          {/* Deal IQ chip — floating bottom-left (zero-cost, from card fields) */}
          {(() => {
            const iq = liteDealIQ({
              askPrice: deal.askPrice,
              sellEstimate: deal.sellEstimate,
              trueNetProfit: deal.trueNetProfit,
              distressed: (deal as any).distressed,
              dealVerdict: (deal as any).dealVerdict ?? (deal as any).verdict,
            });
            if (!iq) return null;
            return (
              <span
                className="absolute left-2.5 bottom-2.5 inline-flex items-center rounded-full px-2 py-1 text-[10px] font-black text-white"
                style={{
                  background: "rgba(20,10,20,.72)",
                  backdropFilter: "blur(8px)",
                }}
                title={`Deal IQ ${iq.score}/100 (${iq.tier})`}
              >
                <span style={{ color: IQ_TIER_COLOR[iq.tier] }}>
                  IQ&nbsp;{iq.score}
                </span>
              </span>
            );
          })()}

          {/* Source chip — floating top-left: instant "where's this from", brand-colored */}
          {(() => {
            const m = sourceMeta(deal.source);
            return (
              <span
                className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold"
                style={{
                  background: "rgba(20,10,20,.72)",
                  backdropFilter: "blur(8px)",
                  color: m.color,
                }}
                title={`${m.label} · ${terms.channelTag}`}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: m.color }}
                />
                {m.label}
              </span>
            );
          })()}

          {/* Days-on-market chip — floating bottom-right (negotiating signal) */}
          {(() => {
            const dom = daysOnMarket(deal.firstSeenAt);
            if (dom == null) return null;
            const tier = domTier(dom);
            return (
              <span
                className="absolute right-2.5 bottom-2.5 inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold text-white"
                style={{
                  background: "rgba(20,10,20,.72)",
                  backdropFilter: "blur(8px)",
                }}
                title={`${dom} days on market — ${tier.label}`}
              >
                <span style={{ color: tier.color }}>{dom}d</span>
              </span>
            );
          })()}

          {/* Multi-source chip — floating top-right (the Kayak signal) */}
          {multi && (
            <span
              className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-white"
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
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-2 p-3.5">
          <div className="flex justify-between items-start gap-2">
            <h3 className="truncate text-[15px] font-bold leading-tight text-[var(--t1)] transition-colors group-hover:text-[var(--amber)]">
              {title}
            </h3>
            {deal.vin && (
              <span className="font-mono text-[10px] text-[var(--t4)] shrink-0 group-hover:text-[var(--t2)] transition-colors">
                {deal.vin.slice(-6)}
              </span>
            )}
          </div>

          {/* VIN-graph red flag — the moat made visible. Loud red for misrepresentation traps (a
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
              title={deal.vinFlags.join(" · ")}
            >
              {deal.vinFlagSeverity === "high" ? "⚠ " : ""}
              {deal.vinFlags.find((f) =>
                /washing|rollback|salvage|flood|fire/i.test(f),
              ) || deal.vinFlags[0]}
            </span>
          )}

          {/* Forecast chip — the predictive layer surfaced on the card: urgency + time-to-sell, so the
              engine's forward-looking read shows in the browse, not just the detail page. */}
          {deal.prediction &&
            (deal.prediction.urgency === "act_now" ||
              deal.prediction.urgency === "soon" ||
              deal.prediction.velocity === "fast") && (
              <span
                className="inline-flex w-fit items-center gap-1 rounded-[var(--r1)] px-2 py-0.5 text-[10px] font-black"
                style={
                  deal.prediction.urgency === "act_now"
                    ? { background: "var(--rlo)", color: "var(--red)" }
                    : {
                        background:
                          "color-mix(in srgb, var(--green) 14%, transparent)",
                        color: "var(--green)",
                      }
                }
                title="Forecast: how fast this market clears + whether to act now"
              >
                {deal.prediction.urgency === "act_now"
                  ? "🔥 Act now"
                  : deal.prediction.velocity === "fast"
                    ? "⚡ Fast market"
                    : "⏱ Move soon"}
                {deal.prediction.daysToSell != null
                  ? ` · ~${deal.prediction.daysToSell}d`
                  : ""}
              </span>
            )}

          {/* Meta: lane · mileage · location */}
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
                {cond.runs === "yes" ? "✓ " : cond.runs === "no" ? "✕ " : ""}
                {cond.label}
                {cond.detail ? ` · ${cond.detail}` : ""}
              </span>
            )}
            {deal.mileage ? (
              <span className="font-mono text-[var(--t3)]">
                {deal.mileage.toLocaleString()} mi
              </span>
            ) : null}
            {deal.mileage && location ? (
              <span className="opacity-30">·</span>
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

          {/* Quick Actions (Contact, Copy, Share) */}
          <div className="flex flex-wrap gap-2 mt-1 z-10 relative">
            {deal.vin && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard.writeText(deal.vin!);
                }}
                className="inline-flex items-center gap-1 rounded bg-[var(--s2)] hover:bg-[var(--s3)] px-2 py-1 text-[10px] font-bold text-[var(--t3)] transition-colors border border-[var(--b1)]"
              >
                📋 Copy VIN
              </button>
            )}

            {(deal.sellerPhone || deal.sellerEmail) && (
              <div className="inline-flex items-center gap-1">
                {deal.sellerPhone && (
                  <>
                    <a
                      href={`tel:${deal.sellerPhone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded bg-[var(--blo)] hover:bg-[var(--bbd)] px-2 py-1 text-[10px] font-bold text-[var(--blue)] transition-colors"
                    >
                      📞 Call
                    </a>
                    <a
                      href={`sms:${deal.sellerPhone}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded bg-[var(--glo)] hover:bg-[var(--gbd)] px-2 py-1 text-[10px] font-bold text-[var(--green)] transition-colors"
                    >
                      💬 Text
                    </a>
                  </>
                )}
                {deal.sellerEmail && (
                  <a
                    href={`mailto:${deal.sellerEmail}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded bg-[var(--s2)] hover:bg-[var(--s3)] px-2 py-1 text-[10px] font-bold text-[var(--t2)] transition-colors border border-[var(--b1)]"
                  >
                    ✉️ Email
                  </a>
                )}
              </div>
            )}

            <button
              onClick={(e) => {
                e.preventDefault();
                const url = deal.sourceUrl || window.location.href;
                if (navigator.share) {
                  navigator.share({ url });
                } else {
                  navigator.clipboard.writeText(url);
                }
              }}
              className="inline-flex items-center gap-1 rounded bg-[var(--s2)] hover:bg-[var(--s3)] px-2 py-1 text-[10px] font-bold text-[var(--t3)] transition-colors border border-[var(--b1)]"
            >
              🔗 Share
            </button>
          </div>

          {/* Price + Est Profit grid */}
          <div className="mt-auto grid grid-cols-2 gap-2 pt-2 border-t border-[var(--b1)]">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--t4)]">
                {terms.priceLabel}
              </p>
              <span className="font-mono text-lg font-black leading-none text-[var(--t1)] tracking-tight">
                ${deal.askPrice.toLocaleString()}
              </span>
            </div>

            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--t4)]">
                Est. Net Profit
              </p>
              {deal.trueNetProfit && deal.trueNetProfit > 0 ? (
                <span className="font-mono text-[17px] font-black leading-none text-[var(--green)]">
                  +${deal.trueNetProfit.toLocaleString()}
                </span>
              ) : (
                <span className="font-mono text-[17px] font-bold leading-none text-[var(--t3)]">
                  --
                </span>
              )}
            </div>
          </div>

          {/* Sell estimate + max bid — the context that makes the profit number mean something. */}
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
                        background: CONFIDENCE_META[deal.valueConfidence].color,
                      }}
                      title={`${CONFIDENCE_META[deal.valueConfidence].label} confidence — ${CONFIDENCE_META[deal.valueConfidence].blurb}${
                        deal.valueEvidence
                          ? ` · backed by ${deal.valueEvidence} real comps/sales`
                          : ""
                      }`}
                    />
                  )}
                </span>
                <span className="font-mono font-bold text-[var(--t2)]">
                  {deal.sellEstimate
                    ? `$${Math.round(deal.sellEstimate).toLocaleString()}`
                    : "—"}
                </span>
              </div>
              <div
                className="flex items-center justify-between rounded-[var(--r1)] px-2 py-1"
                style={{ background: "var(--s1)" }}
              >
                <span className="font-semibold text-[var(--t4)]">
                  {terms.maxLabel}
                </span>
                <span className="font-mono font-bold text-[var(--green)]">
                  {deal.recommendedMaxBid
                    ? `$${Math.round(deal.recommendedMaxBid).toLocaleString()}`
                    : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Cross-source price compare (Kayak): the SAME car on each source, brand-chipped,
              cheapest first + outlined — so a dealer sees who has it and for how much at a glance. */}
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
                        title={`${m.label}${isCheapest ? " — cheapest" : ""}`}
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
        </div>
      </Link>
    </motion.div>
  );
});
