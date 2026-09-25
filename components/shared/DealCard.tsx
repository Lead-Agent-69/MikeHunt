"use client";

import React, { memo } from "react";
import { motion } from "framer-motion";
import { Mono } from "./Mono";
import { cn } from "@/lib/utils";
import { liteDealIQ, IQ_TIER_COLOR } from "@/lib/intelligence/lite-iq";
import { daysOnMarket, domTier } from "@/lib/intelligence/days-on-market";
import { type DealCardProps } from "./deal-card/types";
import {
  VERDICT_STYLES,
  getScoreColor,
  formatCondition,
} from "./deal-card/utils";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { buyTerm } from "@/lib/deal-terms";

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
  profitScore = 50,
  locationCity,
  locationState,
  mileage,
  condition,
  damageType,
  dealVerdict,
  recommendedMaxBid,
  sellEstimate,
  priceDropAmount,
  priceDropDays,
  firstSeenAt,
  onClick,
}: DealCardProps) {
  const scoreColor = getScoreColor(profitScore);
  const dom = daysOnMarket(firstSeenAt);
  const tier = dom != null ? domTier(dom) : null;
  const isPositive = profitEstimate >= 0;
  const location = [locationCity, locationState].filter(Boolean).join(", ");
  const verdict = dealVerdict ? VERDICT_STYLES[dealVerdict] : null;
  // Zero-cost Deal IQ from fields already on the card. Pass the verdict so the chip can't
  // contradict the GO/PASS pill (a rejected deal never shows a high IQ).
  const iq = liteDealIQ({
    askPrice,
    sellEstimate,
    mmrValue,
    profitEstimate,
    dealVerdict,
  });

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
      {/* Top strip: source badge + score ring */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--b1)", background: "var(--s1)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <SourceBadge
            source={source}
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
          {iq && (
            <span
              className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-[var(--r1)] shrink-0"
              style={{ background: "var(--s2)", color: IQ_TIER_COLOR[iq.tier] }}
              title={`Deal IQ ${iq.score}/100 (${iq.tier})`}
            >
              IQ {iq.score}
            </span>
          )}
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
          style={{
            background: scoreColor.bg,
            color: scoreColor.text,
            fontFamily: "var(--fm)",
          }}
          title={`Profit Score: ${profitScore}/100`}
        >
          {profitScore}
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
              MMR Value
            </p>
            <Mono className="text-sm font-extrabold text-[var(--t3)]">
              {mmrValue ? `$${mmrValue.toLocaleString()}` : "N/A"}
            </Mono>
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
        <motion.a
          href={`/deal/${id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 text-xs font-bold text-white rounded-[var(--r2)] px-3 py-1.5 shrink-0 border-none"
          style={{
            background: "var(--grad)",
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          View Deal
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
