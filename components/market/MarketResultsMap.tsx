"use client";

import React from "react";
import Link from "next/link";
import { LocateFixed, Minus, Plus } from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import type { MarketListing } from "@/lib/market/explorer";

const WIDTH = 960;
const HEIGHT = 500;
const MIN_LNG = -125;
const MAX_LNG = -66;
const MIN_LAT = 24;
const MAX_LAT = 50;

function project(lat: number, lng: number) {
  return {
    x: ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * WIDTH,
    y: ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * HEIGHT,
  };
}

function jitter(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index++)
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  return { x: (hash % 9) - 4, y: ((hash >> 3) % 9) - 4 };
}

export function MarketResultsMap({
  rows,
  flipDesk,
}: {
  rows: MarketListing[];
  flipDesk: boolean;
}) {
  const points = React.useMemo(
    () =>
      rows
        .filter(
          (row) =>
            row.mapLat != null &&
            row.mapLng != null &&
            row.mapLat >= MIN_LAT &&
            row.mapLat <= MAX_LAT &&
            row.mapLng >= MIN_LNG &&
            row.mapLng <= MAX_LNG,
        )
        .map((row) => ({ row, ...project(row.mapLat!, row.mapLng!) })),
    [rows],
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [metric, setMetric] = React.useState<"inventory" | "profit">(
    "inventory",
  );
  const [zoom, setZoom] = React.useState(1);
  React.useEffect(() => {
    if (selectedId && !points.some(({ row }) => row.id === selectedId))
      setSelectedId(null);
  }, [points, selectedId]);
  const selected =
    points.find(({ row }) => row.id === selectedId)?.row || points[0]?.row;
  const center = selected
    ? project(selected.mapLat!, selected.mapLng!)
    : { x: WIDTH / 2, y: HEIGHT / 2 };
  const viewWidth = WIDTH / zoom;
  const viewHeight = HEIGHT / zoom;
  const viewX = Math.max(
    0,
    Math.min(WIDTH - viewWidth, center.x - viewWidth / 2),
  );
  const viewY = Math.max(
    0,
    Math.min(HEIGHT - viewHeight, center.y - viewHeight / 2),
  );

  return (
    <section
      aria-label="Interactive results map"
      className="overflow-hidden rounded-2xl border border-[var(--b1)] bg-[var(--s1)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--b1)] px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--t1)]">Results map</h3>
          <p className="text-[10px] text-[var(--t4)]">
            {points.length.toLocaleString()} of {rows.length.toLocaleString()}{" "}
            listings on this page have approximate coordinates
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {flipDesk && (
            <div className="mr-1 flex rounded-lg border border-[var(--b1)] p-1">
              {(["inventory", "profit"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={metric === value}
                  onClick={() => setMetric(value)}
                  className="min-h-8 rounded-md px-2 text-[10px] font-semibold capitalize aria-pressed:bg-[var(--s2)] aria-pressed:text-[var(--blue)]"
                >
                  {value}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            aria-label="Zoom map out"
            disabled={zoom === 1}
            onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--b1)] disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Zoom map in"
            disabled={zoom === 2.5}
            onClick={() => setZoom((value) => Math.min(2.5, value + 0.5))}
            className="grid h-10 w-10 place-items-center rounded-lg border border-[var(--b1)] disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative min-h-[18rem] bg-[var(--s0)]">
        <svg
          viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
          className="h-[clamp(18rem,38vw,30rem)] w-full"
          role="img"
          aria-label="Map of current market result locations"
        >
          <defs>
            <pattern
              id="market-map-grid"
              width="80"
              height="80"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 80 0 L 0 0 0 80"
                fill="none"
                stroke="var(--b1)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width={WIDTH} height={HEIGHT} fill="url(#market-map-grid)" />
          <path
            d="M48 72 L113 48 L195 62 L240 48 L320 71 L390 69 L455 87 L535 73 L606 86 L670 74 L728 92 L791 89 L836 116 L881 124 L908 171 L889 204 L902 237 L876 273 L850 279 L831 320 L798 336 L769 376 L733 407 L683 423 L638 413 L596 384 L545 393 L501 371 L451 383 L402 361 L354 371 L315 347 L267 355 L226 327 L177 319 L155 282 L121 271 L105 226 L76 205 L65 160 Z"
            fill="var(--s2)"
            stroke="var(--b2)"
            strokeWidth="3"
          />
          {points.map(({ row, x, y }) => {
            const offset = jitter(row.id);
            const selectedPoint = selected?.id === row.id;
            const radius =
              metric === "profit"
                ? Math.max(
                    5,
                    Math.min(
                      13,
                      5 + Math.max(0, row.profitEstimate || 0) / 1200,
                    ),
                  )
                : 7;
            return (
              <g
                key={row.id}
                role="button"
                tabIndex={0}
                aria-label={`${row.title}, ${row.locationCity || "location"} ${row.locationState || ""}`}
                onClick={() => setSelectedId(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(row.id);
                  }
                }}
                className="cursor-pointer focus:outline-none"
              >
                {selectedPoint && (
                  <circle
                    cx={x + offset.x}
                    cy={y + offset.y}
                    r={radius + 7}
                    fill="none"
                    stroke="var(--blue)"
                    strokeWidth="3"
                  />
                )}
                <circle
                  cx={x + offset.x}
                  cy={y + offset.y}
                  r={radius}
                  fill={
                    metric === "profit" && row.profitEstimate < 0
                      ? "var(--red)"
                      : metric === "profit"
                        ? "var(--green)"
                        : "var(--blue)"
                  }
                  stroke="var(--s0)"
                  strokeWidth="2"
                  opacity={selectedPoint ? 1 : 0.82}
                />
              </g>
            );
          })}
        </svg>
        {!points.length && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <LocateFixed className="mx-auto h-7 w-7 text-[var(--t5)]" />
              <p className="mt-2 text-sm font-semibold text-[var(--t2)]">
                No mapped listings on this page
              </p>
              <p className="mt-1 text-xs text-[var(--t4)]">
                Try another page or narrow the search to a location.
              </p>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--b1)] px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--t1)]">
              {selected.title}
            </p>
            <p className="text-[10px] text-[var(--t4)]">
              {[selected.locationCity, selected.locationState]
                .filter(Boolean)
                .join(", ") || "Location not reported"}
              {selected.mileage != null
                ? ` · ${selected.mileage.toLocaleString()} mi`
                : " · mileage not reported"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Mono className="text-sm font-black text-[var(--t1)]">
              {selected.price?.amount != null
                ? `$${selected.price.amount.toLocaleString()}`
                : "Price not reported"}
            </Mono>
            <Link
              href={`/deal/${selected.id}`}
              className="inline-flex min-h-10 items-center rounded-lg bg-[var(--blue)] px-3 text-xs font-bold text-white"
            >
              Review listing
            </Link>
          </div>
        </div>
      )}
      <p className="border-t border-[var(--b1)] px-4 py-2 text-[9px] text-[var(--t5)]">
        Approximate source locations only. Select a marker to inspect its
        listing.
      </p>
    </section>
  );
}
