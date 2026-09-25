"use client";

import React from "react";
import { Mono } from "@/components/shared/Mono";

export function MarketVisualizers({ facets }: { facets: any }) {
  if (!facets) return null;

  const hasPrices = facets.priceHistogram?.some((h: any) => h.n > 0);
  const hasLanes = Object.keys(facets.lanes || {}).length > 0;
  const hasProfit = Object.keys(facets.laneProfit || {}).length > 0;

  if (!hasPrices && !hasLanes && !hasProfit) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
      <div className="glass-panel flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
          Price Distribution
        </h3>
        <div className="flex-1 min-h-[120px]">
          {hasPrices ? (
            <PriceHistogram histogram={facets.priceHistogram} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--t4)]">
              No data
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
          Inventory by Lane
        </h3>
        <div className="flex-1 min-h-[120px]">
          {hasLanes ? (
            <LaneDonut lanes={facets.lanes} colors={facets.laneColors} />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--t4)]">
              No data
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel flex flex-col gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
          Median Profit by Lane
        </h3>
        <div className="flex-1 min-h-[120px]">
          {hasProfit ? (
            <ProfitWaterfall
              laneProfit={facets.laneProfit}
              colors={facets.laneColors}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-[var(--t4)]">
              No data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceHistogram({
  histogram,
}: {
  histogram: { from: number; to: number; n: number }[];
}) {
  const maxN = Math.max(...histogram.map((h) => h.n), 1);

  return (
    <div className="h-full flex items-end gap-1 pt-4 relative group">
      {histogram.map((bin, i) => {
        const heightPct = (bin.n / maxN) * 100;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col justify-end relative h-full group/bar"
          >
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity z-10 pointer-events-none text-center">
              <div className="bg-[var(--s1)] border border-[var(--b2)] rounded-md px-2 py-1 shadow-lg text-[10px] whitespace-nowrap">
                <div className="font-bold text-[var(--t1)]">{bin.n} deals</div>
                <div className="text-[var(--t4)]">
                  ${bin.from / 1000}k - ${bin.to / 1000}k
                </div>
              </div>
            </div>
            {/* Bar */}
            <div
              className="w-full rounded-t-sm transition-all duration-300"
              style={{
                height: `${heightPct}%`,
                background: bin.n > 0 ? "var(--amber)" : "transparent",
                opacity: 0.8,
              }}
            />
            {/* Base axis label (only show a few) */}
            {(i === 0 ||
              i === histogram.length - 1 ||
              i === Math.floor(histogram.length / 2)) && (
              <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-[var(--t5)]">
                ${Math.round(bin.from / 1000)}k
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LaneDonut({
  lanes,
  colors,
}: {
  lanes: Record<string, number>;
  colors: Record<string, string>;
}) {
  const total = Object.values(lanes).reduce((a, b) => a + b, 0) || 1;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;

  const entries = Object.entries(lanes).sort((a, b) => b[1] - a[1]);

  return (
    <div className="h-full flex items-center justify-center gap-6">
      <div className="relative w-[100px] h-[100px] shrink-0">
        <svg
          width="100"
          height="100"
          viewBox="0 0 100 100"
          className="-rotate-90"
        >
          {entries.map(([lane, count], i) => {
            const fraction = count / total;
            const length = fraction * circumference;
            const strokeDasharray = `${length} ${circumference}`;
            const strokeDashoffset = -currentOffset;
            currentOffset += length;

            return (
              <circle
                key={lane}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={colors[lane] || "var(--s3)"}
                strokeWidth="14"
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500 ease-out hover:opacity-80"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Mono className="text-sm font-black text-[var(--t1)]">{total}</Mono>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 flex-1 max-h-[100px] overflow-y-auto scrollbar-hide">
        {entries.map(([lane, count]) => (
          <div
            key={lane}
            className="flex items-center justify-between text-[11px]"
          >
            <div className="flex items-center gap-1.5 truncate">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: colors[lane] || "var(--s3)" }}
              />
              <span className="capitalize text-[var(--t2)] truncate">
                {lane}
              </span>
            </div>
            <Mono className="text-[var(--t4)]">{count}</Mono>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfitWaterfall({
  laneProfit,
  colors,
}: {
  laneProfit: Record<string, number>;
  colors: Record<string, string>;
}) {
  const entries = Object.entries(laneProfit).sort((a, b) => b[1] - a[1]);
  const maxAbs = Math.max(...entries.map(([, p]) => Math.abs(p)), 1000);

  return (
    <div className="h-full flex flex-col justify-center gap-2 relative">
      {/* Zero line */}
      <div className="absolute top-0 bottom-0 left-[50%] w-px bg-[var(--b2)] z-0" />

      {entries.slice(0, 5).map(([lane, profit]) => {
        const isPos = profit >= 0;
        const widthPct = (Math.abs(profit) / maxAbs) * 50;

        return (
          <div
            key={lane}
            className="flex items-center relative z-10 w-full text-[10px]"
          >
            {/* Left side (negative) */}
            <div className="flex-1 flex justify-end pr-2">
              {!isPos && (
                <div className="flex items-center gap-2">
                  <Mono className="text-[var(--red)] font-bold">
                    -${Math.abs(profit)}
                  </Mono>
                  <div
                    className="h-4 rounded-sm"
                    style={{
                      width: `${widthPct}%`,
                      minWidth: "2px",
                      background: "var(--red)",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Lane label centered if no room, or absolute */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-1 w-16">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: colors[lane] || "var(--s3)" }}
              />
              <span className="capitalize text-[8px] font-bold text-[var(--t3)] truncate w-12 text-center">
                {lane}
              </span>
            </div>

            {/* Right side (positive) */}
            <div className="flex-1 pl-2">
              {isPos && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 rounded-sm"
                    style={{
                      width: `${widthPct}%`,
                      minWidth: "2px",
                      background: colors[lane] || "var(--green)",
                    }}
                  />
                  <Mono className="text-[var(--green)] font-bold">
                    ${profit}
                  </Mono>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
