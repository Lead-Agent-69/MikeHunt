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
import { RotateCcw } from "lucide-react";
import {
  ComparableInspector,
  type ComparablePoint,
} from "./ComparableInspector";

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
  const [maxAmount, setMaxAmount] = React.useState("");
  const [maxMileage, setMaxMileage] = React.useState("");
  const [selection, setSelection] = React.useState<{
    dealId: string;
    key: string;
  } | null>(null);
  const {
    data,
    error,
    isLoading,
    mutate: retrySimilar,
  } = useSWR(`/api/deals/${dealId}/similar`, fetcher, {
    revalidateOnFocus: false,
  });
  const {
    data: sourceData,
    error: sourceError,
    isLoading: sourceLoading,
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
  if (isLoading || sourceLoading)
    return (
      <p role="status" className="p-4 text-sm text-[var(--t3)]">
        Loading price comparisons...
      </p>
    );
  const comps: any[] = (
    Array.isArray(data?.similar) ? data.similar : []
  ).filter((candidate: any) => candidate && candidate.id !== dealId);
  const pointFor = (c: any, i: number, y: number): ComparablePoint => ({
    key: c.id || `comparison-${i}`,
    id: c.id,
    x: Number(c.mileage),
    y,
    me: false,
    name:
      [c.year, c.make, c.model].filter(Boolean).join(" ") ||
      "Comparable vehicle",
    source: c.source,
    location: [c.locationCity, c.locationState].filter(Boolean).join(", "),
    priceLabel:
      c.priceContext?.label ||
      (c.priceContext?.canCompareToAskingCurve === true
        ? "Reported asking price"
        : "Unverified advertised amount"),
  });

  const cashPoints = comps
    .filter(
      (c) =>
        c.priceContext?.canCompareToAskingCurve === true &&
        Number.isFinite(Number(c.mileage)) &&
        Number(c.mileage) > 0 &&
        Number.isFinite(c.priceContext.cashPrice) &&
        c.priceContext.cashPrice > 0,
    )
    .map((c, i) => pointFor(c, i, c.priceContext.cashPrice));
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
    .map((c, i) =>
      pointFor(c, i, c.priceContext.advertisedAmount ?? c.priceContext.amount),
    );
  const mode =
    selectedMode ??
    (cashPoints.length >= 4 || advertisedPoints.length < 4
      ? "cash"
      : "advertised");
  const loaded = mode === "cash" ? cashPoints : advertisedPoints;
  const invalidLimit = [maxAmount, maxMileage].some(
    (value) =>
      value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0),
  );
  const pts = loaded.filter(
    (point) =>
      invalidLimit ||
      ((!maxAmount || point.y <= Number(maxAmount)) &&
        (!maxMileage || point.x <= Number(maxMileage))),
  );
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
          onClick={() => {
            setSelectedMode(value);
            setSelection(null);
          }}
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
  const filterControl = (
    <div className="mb-4 w-full space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {[
          {
            label: "Maximum amount ($)",
            value: maxAmount,
            change: setMaxAmount,
            step: 500,
          },
          {
            label: "Maximum mileage",
            value: maxMileage,
            change: setMaxMileage,
            step: 1000,
          },
        ].map((field) => (
          <label
            key={field.label}
            className="min-w-0 text-xs font-semibold text-[var(--t2)]"
          >
            <span className="block min-h-8">{field.label}</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              step={field.step}
              value={field.value}
              onChange={(event) => {
                field.change(event.target.value);
                setSelection(null);
              }}
              placeholder="Any"
              aria-invalid={
                (field.value !== "" &&
                  (!Number.isFinite(Number(field.value)) ||
                    Number(field.value) < 0)) ||
                undefined
              }
              className="mt-1 min-h-11 w-full min-w-0 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-2 text-sm text-[var(--t1)] aria-[invalid=true]:border-[var(--red)]"
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-[var(--t3)]">
          {pts.length} of {loaded.length} loaded comparisons
        </p>
        <button
          type="button"
          title="Reset comparison filters"
          aria-label="Reset comparison filters"
          disabled={!maxAmount && !maxMileage}
          onClick={() => {
            setMaxAmount("");
            setMaxMileage("");
            setSelection(null);
          }}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--r2)] border border-[var(--b2)] text-[var(--t2)] disabled:opacity-40"
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>
      {invalidLimit && (
        <p role="alert" className="text-xs text-[var(--red)]">
          Use a non-negative number. These limits have not been applied.
        </p>
      )}
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
  if (meValid)
    pts.push({
      key: "current",
      id: dealId,
      x: Number(mileage),
      y: Number(askPrice),
      me: true,
      name:
        [base.year, base.make, base.model].filter(Boolean).join(" ") ||
        "This vehicle",
      source: base.source,
      priceLabel:
        mode === "cash"
          ? "Reported asking price"
          : base.priceContext?.label || "Unverified advertised amount",
    });
  const selected =
    (selection?.dealId === dealId &&
      pts.find((point) => point.key === selection.key)) ||
    pts.find((point) => point.me) ||
    pts[0];
  const selectPoint = (key: string) => setSelection({ dealId, key });
  const inspector = (
    <ComparableInspector
      point={selected}
      points={pts}
      dealId={dealId}
      onSelect={selectPoint}
    />
  );

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
          {filterControl}
          <Ico name="trending-up" size={20} className="text-[var(--t5)]" />
          <p className="text-sm font-semibold text-[var(--t3)]">
            {mode === "cash"
              ? "Not enough comparable asking prices with mileage"
              : "Not enough advertised amounts with mileage"}
          </p>
          {loaded.length > 0 && sampleCount === 0 && (
            <p className="text-sm text-[var(--t2)]">
              No loaded comparisons match these limits.
            </p>
          )}
          {inspector}
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
        {filterControl}
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
          role="group"
          aria-label={
            mode === "cash"
              ? "Comparable asking prices by mileage"
              : "Advertised amounts by mileage"
          }
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ maxHeight: 220 }}
          onClick={(event) => {
            const matrix = event.currentTarget.getScreenCTM();
            if (!matrix) return;
            const cursor = new DOMPoint(
              event.clientX,
              event.clientY,
            ).matrixTransform(matrix.inverse());
            const nearest = pts.reduce((best, point) =>
              Math.hypot(sx(point.x) - cursor.x, sy(point.y) - cursor.y) <
              Math.hypot(sx(best.x) - cursor.x, sy(best.y) - cursor.y)
                ? point
                : best,
            );
            selectPoint(nearest.key);
          }}
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
          {comp.map((p) => (
            <g
              key={p.key}
              role="button"
              tabIndex={0}
              aria-label={`Inspect ${p.name}, ${p.priceLabel}, ${p.y.toLocaleString()} dollars, ${p.x.toLocaleString()} miles`}
              aria-pressed={selected?.key === p.key}
              className="cursor-pointer outline-none"
              onFocus={() => selectPoint(p.key)}
              onClick={(event) => {
                event.stopPropagation();
                selectPoint(p.key);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  selectPoint(p.key);
                }
              }}
            >
              <title>
                {p.name}: {p.priceLabel} ${p.y.toLocaleString()},{" "}
                {p.x.toLocaleString()} mi
              </title>
              <circle
                cx={sx(p.x)}
                cy={sy(p.y)}
                r={selected?.key === p.key ? 6 : 3.5}
                fill={selected?.key === p.key ? "var(--accent)" : "var(--t4)"}
                stroke={selected?.key === p.key ? "var(--t1)" : "none"}
                strokeWidth="1.5"
                opacity={selected?.key === p.key ? 1 : 0.55}
              />
            </g>
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
        {inspector}
      </CardContent>
    </Card>
  );
}
