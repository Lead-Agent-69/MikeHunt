"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Mono } from "@/components/shared/Mono";
import { Ico } from "@/components/shared/Ico";

interface PricePoint {
  price: number;
  observedAt: string;
}

interface PriceSparklineProps {
  dealId: string;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch price history");
    return res.json();
  });

const fmt = (val: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(val));

const W = 280;
const H = 64;
const PAD = 4;

export function PriceSparkline({ dealId }: PriceSparklineProps) {
  const { data, isLoading } = useSWR<PricePoint[]>(
    dealId ? `/api/deals/${dealId}/price-history` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 },
  );

  const points = Array.isArray(data) ? data : [];
  const enough = points.length >= 2;

  const geom = React.useMemo(() => {
    if (!enough) return null;
    const prices = points.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min || 1;
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;

    const coords = points.map((p, i) => {
      const x =
        PAD +
        (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
      const y = PAD + innerH - ((p.price - min) / span) * innerH;
      return { x, y };
    });

    const linePath = coords
      .map(
        (c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`,
      )
      .join(" ");
    const areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(2)} ${H - PAD} L ${coords[0].x.toFixed(2)} ${H - PAD} Z`;

    return { coords, linePath, areaPath };
  }, [points, enough]);

  const first = points[0]?.price ?? 0;
  const current = points[points.length - 1]?.price ?? 0;
  const delta = current - first;
  const dropped = delta < 0;
  const trendColor = dropped
    ? "var(--green)"
    : delta > 0
      ? "var(--red)"
      : "var(--t4)";

  return (
    <Card className="border-[var(--b2)] bg-[var(--s0)] shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Ico name="trending-up" size={15} className="text-[var(--t4)]" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Price history
          </p>
        </div>

        {isLoading ? (
          <div className="skeleton h-16 w-full" />
        ) : !enough ? (
          <p className="text-sm text-[var(--t4)] py-3">
            Tracking — check back as we re-scan.
          </p>
        ) : (
          <>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-0.5">
                  Current
                </p>
                <Mono
                  className="text-2xl font-black text-[var(--t1)] leading-none"
                  style={{ fontFamily: "var(--fm)" }}
                >
                  {fmt(current)}
                </Mono>
              </div>
              <div
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-md"
                style={{
                  color: trendColor,
                  background: dropped
                    ? "var(--glo)"
                    : delta > 0
                      ? "var(--rlo)"
                      : "var(--s1)",
                }}
              >
                <span>{dropped ? "▼" : delta > 0 ? "▲" : "—"}</span>
                {fmt(Math.abs(delta))} since first seen
              </div>
            </div>

            <svg
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              height={H}
              preserveAspectRatio="none"
              role="img"
              aria-label="Price history sparkline"
            >
              <defs>
                <linearGradient
                  id={`spark-fill-${dealId}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={trendColor} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={trendColor} stopOpacity="0" />
                </linearGradient>
              </defs>
              {geom && (
                <>
                  <path d={geom.areaPath} fill={`url(#spark-fill-${dealId})`} />
                  <path
                    d={geom.linePath}
                    fill="none"
                    stroke={trendColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle
                    cx={geom.coords[geom.coords.length - 1].x}
                    cy={geom.coords[geom.coords.length - 1].y}
                    r={3}
                    fill={trendColor}
                  />
                </>
              )}
            </svg>
          </>
        )}
      </CardContent>
    </Card>
  );
}
