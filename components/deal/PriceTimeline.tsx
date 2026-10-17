"use client";

import React from "react";
import useSWR from "swr";
import { CalendarDays, TrendingDown, TrendingUp } from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import { fetchObservedPrices } from "@/lib/vehicle/observed-price-history";

type TimelineRange = "30d" | "90d" | "all";

type PriceObservation = {
  price: number;
  observedAt: string;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));

const shortDate = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date unavailable";

const W = 620;
const H = 188;
const PAD = { left: 14, right: 14, top: 16, bottom: 24 };

/**
 * Interactive, observed listing-price history. Every point can be inspected by
 * mouse, touch, or keyboard; range controls never infer a sale price.
 */
export function PriceTimeline({ dealId }: { dealId: string }) {
  const { data, error, isLoading, mutate } = useSWR<PriceObservation[]>(
    `/api/deals/${dealId}/price-history`,
    fetchObservedPrices,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      errorRetryCount: 1,
    },
  );
  const [range, setRange] = React.useState<TimelineRange>("all");
  const [selectedAt, setSelectedAt] = React.useState<string | null>(null);

  const observations = React.useMemo(
    () =>
      [...(data ?? [])]
        .filter(
          (item) =>
            Number.isFinite(Number(item.price)) && Number(item.price) > 0,
        )
        .sort(
          (a, b) =>
            new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime(),
        ),
    [data],
  );
  const visible = React.useMemo(() => {
    if (range === "all") return observations;
    const days = range === "30d" ? 30 : 90;
    const cutoff = Date.now() - days * 86_400_000;
    const limited = observations.filter(
      (item) => new Date(item.observedAt).getTime() >= cutoff,
    );
    return limited.length >= 2 ? limited : observations;
  }, [observations, range]);

  React.useEffect(() => {
    const latest = visible[visible.length - 1];
    if (!latest) return;
    if (!visible.some((item) => item.observedAt === selectedAt)) {
      setSelectedAt(latest.observedAt);
    }
  }, [selectedAt, visible]);

  if (isLoading)
    return (
      <section
        aria-label="Interactive listing price history"
        className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] p-5"
      >
        <div className="skeleton h-44 w-full" />
      </section>
    );
  if (error)
    return (
      <section
        aria-label="Interactive listing price history"
        className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] p-5 text-sm text-[var(--t3)]"
      >
        <p>Price history could not be loaded.</p>
        <button
          type="button"
          className="premium-focus mt-2 min-h-11 text-[var(--blue)]"
          onClick={() => void mutate()}
        >
          Try again
        </button>
      </section>
    );
  if (observations.length < 2)
    return (
      <section
        aria-label="Interactive listing price history"
        className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] p-5"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t4)]">
          Listing price history
        </p>
        <p className="mt-3 text-sm text-[var(--t4)]">
          Not enough dated price observations to show a trend.
        </p>
      </section>
    );

  const prices = visible.map((item) => Number(item.price));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || Math.max(1, max * 0.08);
  const innerWidth = W - PAD.left - PAD.right;
  const innerHeight = H - PAD.top - PAD.bottom;
  const coords = visible.map((item, index) => ({
    ...item,
    price: Number(item.price),
    x:
      PAD.left +
      (visible.length === 1
        ? innerWidth / 2
        : (index / (visible.length - 1)) * innerWidth),
    y:
      PAD.top + innerHeight - ((Number(item.price) - min) / span) * innerHeight,
  }));
  const linePath = coords
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${H - PAD.bottom} L ${coords[0].x.toFixed(2)} ${H - PAD.bottom} Z`;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const selected =
    coords.find((item) => item.observedAt === selectedAt) ?? last;
  const selectedIndex = coords.indexOf(selected);
  const prior = selectedIndex > 0 ? coords[selectedIndex - 1] : null;
  const selectedChange = prior ? selected.price - prior.price : 0;
  const totalChange = last.price - first.price;
  const trendColor =
    totalChange < 0
      ? "var(--green)"
      : totalChange > 0
        ? "var(--red)"
        : "var(--blue)";
  const gradientId = `price-timeline-${dealId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <section
      aria-label="Interactive listing price history"
      className="overflow-hidden rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)]"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--b1)] p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t4)]">
            Listing price history
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <Mono className="text-2xl font-black text-[var(--t1)]">
              {money(last.price)}
            </Mono>
            <span
              className="mb-0.5 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black"
              style={{
                background:
                  totalChange < 0
                    ? "var(--glo)"
                    : totalChange > 0
                      ? "var(--rlo)"
                      : "var(--s2)",
                color: trendColor,
              }}
            >
              {totalChange < 0 ? (
                <TrendingDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
              )}
              {totalChange === 0
                ? "No observed change"
                : `${totalChange < 0 ? "Down" : "Up"} ${money(Math.abs(totalChange))}`}
            </span>
          </div>
        </div>
        <div
          role="group"
          aria-label="Price history range"
          className="flex rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-1"
        >
          {(
            [
              ["30d", "30D"],
              ["90d", "90D"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => {
                setRange(value);
                setSelectedAt(null);
              }}
              className="premium-focus min-h-9 min-w-12 rounded-md px-2 text-[11px] font-black"
              style={{
                background: range === value ? "var(--s0)" : "transparent",
                color: range === value ? "var(--t1)" : "var(--t4)",
                boxShadow: range === value ? "var(--shadow1)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        <div
          aria-live="polite"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--r2)] bg-[var(--s1)] px-3 py-2"
        >
          <div className="flex items-center gap-2 text-xs text-[var(--t3)]">
            <CalendarDays
              className="h-3.5 w-3.5 text-[var(--t4)]"
              aria-hidden="true"
            />
            {shortDate(selected.observedAt)}
          </div>
          <div className="text-right">
            <Mono className="text-sm font-black text-[var(--t1)]">
              {money(selected.price)}
            </Mono>
            {prior && selectedChange !== 0 && (
              <span
                className="ml-2 text-[10px] font-black"
                style={{
                  color: selectedChange < 0 ? "var(--green)" : "var(--red)",
                }}
              >
                {selectedChange < 0 ? "↓" : "↑"}{" "}
                {money(Math.abs(selectedChange))}
              </span>
            )}
          </div>
        </div>

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-48 w-full overflow-visible"
          role="group"
          aria-label="Select an observed listing price"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.24" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((ratio) => {
            const y = PAD.top + ratio * innerHeight;
            return (
              <line
                key={ratio}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--b1)"
                strokeWidth="1"
                strokeDasharray="3 5"
              />
            );
          })}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={trendColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {coords.map((point) => {
            const isSelected = point.observedAt === selected.observedAt;
            return (
              <g
                key={`${point.observedAt}-${point.price}`}
                role="button"
                tabIndex={0}
                aria-label={`${shortDate(point.observedAt)}, ${money(point.price)}`}
                aria-pressed={isSelected}
                className="cursor-pointer outline-none"
                onClick={() => setSelectedAt(point.observedAt)}
                onFocus={() => setSelectedAt(point.observedAt)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedAt(point.observedAt);
                  }
                }}
              >
                <circle cx={point.x} cy={point.y} r="12" fill="transparent" />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isSelected ? 6 : 3.5}
                  fill={isSelected ? "var(--t1)" : trendColor}
                  stroke={trendColor}
                  strokeWidth={isSelected ? 3 : 1}
                />
              </g>
            );
          })}
          <text x={PAD.left} y={H - 5} fontSize="10" fill="var(--t5)">
            {shortDate(first.observedAt)}
          </text>
          <text
            x={W - PAD.right}
            y={H - 5}
            textAnchor="end"
            fontSize="10"
            fill="var(--t5)"
          >
            {shortDate(last.observedAt)}
          </text>
        </svg>

        <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
          Select any point to inspect the recorded listing amount. These are
          source observations—not confirmed sale prices or vehicle-history
          records.
        </p>
      </div>
    </section>
  );
}
