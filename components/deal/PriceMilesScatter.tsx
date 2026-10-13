"use client";

// "Visualize" — where this deal sits on the price-vs-mileage curve of comparable listings. A dot
// below a trend of reported asking prices is not purchase or resale approval. Built from comps
// (/api/deals/[id]/similar), the current deal highlighted. SVG, zero deps, dark-glass styled.

import React from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";
import { ErrorState } from "@/components/shared/ErrorState";

const fetcher = async (url: string) => {
  const result = await fetch(url);
  if (!result.ok) throw new Error("Price comparison unavailable");
  return result.json();
};
const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

interface Props {
  dealId: string;
  mileage?: number | null;
  askPrice?: number | null;
}

export function PriceMilesScatter({ dealId }: Props) {
  const [selectedMode, setSelectedMode] = React.useState<
    "cash" | "advertised" | null
  >(null);
  const {
    data,
    error,
    mutate: retrySimilar,
  } = useSWR(`/api/deals/${dealId}/similar`, fetcher, {
    revalidateOnFocus: false,
  });
  const {
    data: sourceData,
    error: sourceError,
    mutate: retrySources,
  } = useSWR(`/api/deals/${dealId}/sources`, fetcher, {
    revalidateOnFocus: false,
  });
  if (error || sourceError)
    return (
      <ErrorState
        compact
        title="Price comparison unavailable"
        message="We couldn't check comparable prices. Try again shortly."
        onRetry={() => {
          void retrySimilar();
          void retrySources();
        }}
      />
    );
  const comps: any[] = data?.similar || [];

  const cashPoints = comps
    .filter(
      (c) =>
        c.priceContext?.canCompareToAskingCurve === true &&
        Number.isFinite(Number(c.mileage)) &&
        Number(c.mileage) > 0 &&
        Number.isFinite(c.priceContext.cashPrice) &&
        c.priceContext.cashPrice > 0,
    )
    .map((c) => ({
      x: Number(c.mileage),
      y: c.priceContext.cashPrice as number,
      me: false,
    }));
  const advertisedPoints = comps
    .filter(
      (c) =>
        ["asking", "buy_now", "unknown"].includes(c.priceContext?.kind) &&
        c.priceContext.observationCurrent === true &&
        Number.isFinite(Number(c.mileage)) &&
        Number(c.mileage) > 0 &&
        Number.isFinite(
          c.priceContext.advertisedAmount ?? c.priceContext.amount,
        ) &&
        (c.priceContext.advertisedAmount ?? c.priceContext.amount) > 0,
    )
    .map((c) => ({
      x: Number(c.mileage),
      y: (c.priceContext.advertisedAmount ?? c.priceContext.amount) as number,
      me: false,
    }));
  const mode =
    selectedMode ??
    (cashPoints.length >= 4 || advertisedPoints.length < 4
      ? "cash"
      : "advertised");
  const pts = mode === "cash" ? cashPoints : advertisedPoints;
  const modeControl = (
    <div
      role="group"
      aria-label="Price basis"
      className="mb-3 flex w-full gap-1 rounded-[var(--r2)] border border-[var(--b1)] p-1"
    >
      {(
        [
          ["cash", "Cash prices"],
          ["advertised", "Advertised amounts"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => setSelectedMode(value)}
          className="min-h-11 flex-1 rounded-[var(--r2)] px-2 text-xs font-semibold"
          style={{
            background: mode === value ? "var(--accent)" : "transparent",
            color: mode === value ? "var(--on-accent)" : "var(--t2)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
  const base = sourceData?.base;
  const mileage = base?.mileage,
    askPrice =
      mode === "cash"
        ? base?.cashPrice
        : (base?.priceContext?.advertisedAmount ?? base?.priceContext?.amount);
  const meValid =
    (mode === "cash"
      ? base?.canCompareToAskingCurve === true
      : base?.priceContext?.observationCurrent === true &&
        ["asking", "buy_now", "unknown"].includes(base?.priceContext?.kind)) &&
    Number.isFinite(Number(mileage)) &&
    Number(mileage) > 0 &&
    Number.isFinite(askPrice) &&
    askPrice > 0;
  const sampleCount = pts.length;
  if (meValid) pts.push({ x: Number(mileage), y: Number(askPrice), me: true });

  // Need a real cluster to draw an honest picture.
  // Don't silently vanish — tell the dealer WHY there's no chart (usually missing mileage on the
  // comps, common for private/Craigslist listings) so an absent widget never reads as a bug.
  if (sampleCount < 4) {
    return (
      <Card
        className="border-none"
        style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
      >
        <CardContent className="p-6 flex flex-col items-center justify-center text-center min-h-[180px] gap-2">
          {modeControl}
          <Ico name="trending-up" size={20} className="text-[var(--t5)]" />
          <p className="text-sm font-semibold text-[var(--t3)]">
            {mode === "cash"
              ? "Not enough comparable asking prices with mileage"
              : "Not enough advertised amounts with mileage"}
          </p>
          <p className="text-xs text-[var(--t5)] max-w-[240px]">
            Bids, payment amounts, and unverified prices are not cash-price
            comparisons.
          </p>
        </CardContent>
      </Card>
    );
  }

  const W = 340,
    H = 190,
    padL = 42,
    padB = 26,
    padT = 12,
    padR = 12;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xmin = Math.min(...xs),
    xmax = Math.max(...xs);
  const ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const sx = (x: number) =>
    padL + ((x - xmin) / (xmax - xmin || 1)) * (W - padL - padR);
  const sy = (y: number) =>
    H - padB - ((y - ymin) / (ymax - ymin || 1)) * (H - padB - padT);

  // Least-squares trend on the COMPS (so "below the line" means below the market, not below itself).
  const comp = pts.filter((p) => !p.me);
  let slope = 0,
    intercept = ys.reduce((a, b) => a + b, 0) / ys.length;
  if (comp.length >= 2) {
    const n = comp.length;
    const mx = comp.reduce((a, p) => a + p.x, 0) / n;
    const my = comp.reduce((a, p) => a + p.y, 0) / n;
    const num = comp.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0);
    const den = comp.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    slope = den ? num / den : 0;
    intercept = my - slope * mx;
  }
  const me = pts.find((p) => p.me);
  const compMin = Math.min(...comp.map((p) => p.x)),
    compMax = Math.max(...comp.map((p) => p.x));
  const prediction =
    mode === "cash" &&
    me &&
    compMax > compMin &&
    me.x >= compMin &&
    me.x <= compMax
      ? slope * me.x + intercept
      : null;
  const expected =
    prediction != null && Number.isFinite(prediction) && prediction > 0
      ? prediction
      : null;
  const belowMarket = !!(me && expected != null && me.y < expected);
  const deltaPct =
    me && expected ? Math.round(((expected - me.y) / expected) * 100) : 0;

  const lineY1 = slope * compMin + intercept;
  const lineY2 = slope * compMax + intercept;
  const pointColor =
    expected == null
      ? "var(--blue)"
      : belowMarket
        ? "var(--green)"
        : "var(--red)";

  return (
    <Card
      className="border-none overflow-hidden glass-panel"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
    >
      <CardContent className="p-6 md:p-7">
        {modeControl}
        <div className="flex items-center gap-2 mb-1">
          <Ico name="trending-up" size={15} className="text-[var(--t4)]" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Price vs mileage
          </p>
          {me && expected != null && (
            <span
              className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black"
              style={{
                background: belowMarket ? "var(--glo)" : "var(--rlo)",
                color: belowMarket ? "var(--green)" : "var(--red)",
              }}
            >
              {belowMarket
                ? `${deltaPct}% under the curve`
                : "at/above the curve"}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--t3)] mb-4">
          {mode === "cash"
            ? `${comp.length} comparable asking prices. Not completed sales or a purchase recommendation.`
            : `${comp.length} advertised listing amounts. Price terms may be unverified; this is not a cash-price comparison.`}
        </p>

        <svg
          role="img"
          aria-label={
            mode === "cash"
              ? "Comparable asking prices by mileage"
              : "Advertised amounts by mileage"
          }
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ maxHeight: 220 }}
        >
          {/* axes */}
          <line
            x1={padL}
            y1={H - padB}
            x2={W - padR}
            y2={H - padB}
            stroke="var(--b2)"
            strokeWidth="1"
          />
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={H - padB}
            stroke="var(--b2)"
            strokeWidth="1"
          />
          {/* trend line */}
          {mode === "cash" && slope !== 0 && (
            <line
              x1={sx(compMin)}
              y1={sy(lineY1)}
              x2={sx(compMax)}
              y2={sy(lineY2)}
              stroke="var(--amber)"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity={0.7}
            />
          )}
          {/* comp dots */}
          {comp.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r="3.5"
              fill="var(--t4)"
              opacity={0.55}
            />
          ))}
          {/* the deal */}
          {me && (
            <>
              <circle
                cx={sx(me.x)}
                cy={sy(me.y)}
                r="9"
                fill={pointColor}
                opacity={0.18}
              />
              <circle
                cx={sx(me.x)}
                cy={sy(me.y)}
                r="5"
                fill={pointColor}
                stroke="#fff"
                strokeWidth="1.5"
              />
            </>
          )}
          {/* axis labels */}
          <text x={padL} y={H - 6} fontSize="8" fill="var(--t5)">
            {Math.round(xmin / 1000)}k mi
          </text>
          <text
            x={W - padR}
            y={H - 6}
            fontSize="8"
            fill="var(--t5)"
            textAnchor="end"
          >
            {Math.round(xmax / 1000)}k mi
          </text>
          <text x={4} y={padT + 6} fontSize="8" fill="var(--t5)">
            {money(ymax)}
          </text>
          <text x={4} y={H - padB} fontSize="8" fill="var(--t5)">
            {money(ymin)}
          </text>
        </svg>

        {me && belowMarket && expected != null && (
          <p className="text-[11px] text-[var(--t4)] mt-2">
            Asking-price trend ~
            <Mono className="text-[var(--t2)]">{money(expected)}</Mono> at{" "}
            {Math.round(me.x / 1000)}k miles — this one asks{" "}
            <Mono className="text-[var(--green)]">{money(me.y)}</Mono>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
