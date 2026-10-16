"use client";

import React from "react";
import { Mono } from "@/components/shared/Mono";
import type { MarketFacets } from "@/lib/market/explorer";

interface MarketVisualizersProps {
  facets?: MarketFacets;
  selectedLanes?: string[];
  selectedPrice?: { min: string; max: string };
  onLaneToggle?: (lane: string) => void;
  onPriceRangeSelect?: (from: number, to: number) => void;
}

export function MarketVisualizers({
  facets,
  selectedLanes = [],
  selectedPrice,
  onLaneToggle,
  onPriceRangeSelect,
}: MarketVisualizersProps) {
  if (!facets) return null;
  const hasPrices = facets.priceHistogram?.some((bin) => bin.n > 0);
  const hasLanes = Object.keys(facets.lanes || {}).length > 0;
  const hasProfit = Object.keys(facets.laneProfit || {}).length > 0;
  if (!hasPrices && !hasLanes && !hasProfit) return null;

  return (
    <section
      aria-label="Interactive market charts"
      className="grid grid-cols-1 gap-3 xl:grid-cols-3"
    >
      <ChartCard
        title="Comparable cash asking prices"
        hint="Select a bar to apply its price band"
      >
        {hasPrices ? (
          <PriceHistogram
            histogram={facets.priceHistogram!}
            selectedPrice={selectedPrice}
            onSelect={onPriceRangeSelect}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartCard>
      <ChartCard
        title="Inventory by channel"
        hint="Select a channel to filter inventory"
      >
        {hasLanes ? (
          <LaneDonut
            lanes={facets.lanes!}
            colors={facets.laneColors || {}}
            selected={selectedLanes}
            onToggle={onLaneToggle}
          />
        ) : (
          <EmptyChart />
        )}
      </ChartCard>
      {hasProfit && (
        <ChartCard
          title="Estimated median profit by channel"
          hint="Estimate from the current filtered inventory"
        >
          <ProfitWaterfall
            laneProfit={facets.laneProfit!}
            colors={facets.laneColors || {}}
            selected={selectedLanes}
            onToggle={onLaneToggle}
          />
        </ChartCard>
      )}
    </section>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col gap-2 rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-4">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t2)]">
          {title}
        </h3>
        <p className="mt-1 text-[10px] text-[var(--t4)]">{hint}</p>
      </div>
      <div className="min-h-36 flex-1">{children}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="grid h-full place-items-center text-xs text-[var(--t4)]">
      No evidence in this filter scope
    </div>
  );
}

function PriceHistogram({
  histogram,
  selectedPrice,
  onSelect,
}: {
  histogram: { from: number; to: number; n: number }[];
  selectedPrice?: { min: string; max: string };
  onSelect?: (from: number, to: number) => void;
}) {
  const maxN = Math.max(...histogram.map((bin) => bin.n), 1);
  return (
    <div className="flex h-full items-end gap-1 pb-6 pt-5">
      {histogram.map((bin, index) => {
        const active =
          selectedPrice?.min === String(bin.from) &&
          selectedPrice?.max === String(bin.to);
        const label = `$${Math.round(bin.from / 1000)}k–$${Math.round(bin.to / 1000)}k`;
        return (
          <button
            key={`${bin.from}-${bin.to}`}
            type="button"
            disabled={!bin.n || !onSelect}
            aria-pressed={active}
            aria-label={`${label}: ${bin.n} listings. Apply price band.`}
            title={`${bin.n} listings · ${label}`}
            onClick={() => onSelect?.(bin.from, bin.to)}
            className="group relative flex h-full min-w-0 flex-1 items-end rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)] disabled:cursor-default"
          >
            <span
              aria-hidden="true"
              className="w-full rounded-t-sm transition-[height,opacity] duration-200 group-hover:opacity-100"
              style={{
                height: `${Math.max(bin.n ? 7 : 1, (bin.n / maxN) * 100)}%`,
                background: active ? "var(--blue)" : "var(--amber)",
                opacity: bin.n ? 0.82 : 0.12,
              }}
            />
            {(index === 0 ||
              index === histogram.length - 1 ||
              index === Math.floor(histogram.length / 2)) && (
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] text-[var(--t5)]">
                ${Math.round(bin.from / 1000)}k
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function LaneDonut({
  lanes,
  colors,
  selected,
  onToggle,
}: {
  lanes: Record<string, number>;
  colors: Record<string, string>;
  selected: string[];
  onToggle?: (lane: string) => void;
}) {
  const total =
    Object.values(lanes).reduce((sum, count) => sum + count, 0) || 1;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  let currentOffset = 0;
  const entries = Object.entries(lanes).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex h-full items-center justify-center gap-5">
      <div className="relative h-[108px] w-[108px] shrink-0">
        <svg
          width="108"
          height="108"
          viewBox="0 0 100 100"
          className="-rotate-90"
        >
          {entries.map(([lane, count]) => {
            const length = (count / total) * circumference;
            const strokeDashoffset = -currentOffset;
            currentOffset += length;
            const muted = selected.length > 0 && !selected.includes(lane);
            return (
              <circle
                key={lane}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={colors[lane] || "var(--s3)"}
                strokeWidth="14"
                strokeDasharray={`${length} ${circumference}`}
                strokeDashoffset={strokeDashoffset}
                className="cursor-pointer transition-opacity"
                opacity={muted ? 0.2 : 1}
                role="button"
                tabIndex={0}
                aria-label={`${lane}: ${count} listings`}
                onClick={() => onToggle?.(lane)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onToggle?.(lane);
                  }
                }}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="text-center">
            <Mono className="block text-sm font-black text-[var(--t1)]">
              {total}
            </Mono>
            <span className="text-[9px] text-[var(--t4)]">listings</span>
          </div>
        </div>
      </div>
      <div className="max-h-32 min-w-0 flex-1 overflow-y-auto">
        {entries.map(([lane, count]) => {
          const active = selected.includes(lane);
          return (
            <button
              key={lane}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle?.(lane)}
              className={`flex min-h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-[11px] transition-colors ${active ? "bg-[var(--s2)] text-[var(--t1)]" : "text-[var(--t2)] hover:bg-[var(--s2)]"}`}
            >
              <span className="flex min-w-0 items-center gap-1.5 capitalize">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: colors[lane] || "var(--s3)" }}
                />
                <span className="truncate">{lane}</span>
              </span>
              <Mono className="text-[var(--t4)]">{count}</Mono>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfitWaterfall({
  laneProfit,
  colors,
  selected,
  onToggle,
}: {
  laneProfit: Record<string, number>;
  colors: Record<string, string>;
  selected: string[];
  onToggle?: (lane: string) => void;
}) {
  const entries = Object.entries(laneProfit)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxAbs = Math.max(
    ...entries.map(([, profit]) => Math.abs(profit)),
    1000,
  );
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      {entries.map(([lane, profit]) => {
        const width = Math.max(3, (Math.abs(profit) / maxAbs) * 100);
        const active = selected.includes(lane);
        return (
          <button
            key={lane}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle?.(lane)}
            className={`grid min-h-8 grid-cols-[5.5rem_1fr_auto] items-center gap-2 rounded-md px-2 text-left text-[10px] transition-colors ${active ? "bg-[var(--s2)]" : "hover:bg-[var(--s2)]"}`}
          >
            <span className="truncate capitalize font-semibold text-[var(--t3)]">
              {lane}
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-[var(--s2)]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${width}%`,
                  background:
                    profit >= 0 ? colors[lane] || "var(--green)" : "var(--red)",
                }}
              />
            </span>
            <Mono
              className={
                profit >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
              }
            >
              {profit < 0 ? "−" : ""}${Math.abs(profit).toLocaleString()}
            </Mono>
          </button>
        );
      })}
    </div>
  );
}
