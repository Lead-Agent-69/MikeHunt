"use client";

import React from "react";

interface Pt {
  mileage: number;
  price: number;
}

/**
 * Price-vs-miles scatter ("Visualize Mode") — pure inline SVG, no chart dependency. Market listings
 * as faint dots, the depreciation trend as a dashed line, and THIS car highlighted. Instantly shows
 * whether a deal sits below the curve for its mileage.
 */
export function PriceMilesChart({
  points,
  trend,
  here,
}: {
  points: Pt[];
  trend?: { mileage: number; price: number }[] | null;
  here?: { mileage?: number | null; price?: number | null };
}) {
  const all = points.filter((p) => p.mileage > 0 && p.price > 0);
  if (all.length < 6) return null;

  const W = 320;
  const H = 150;
  const PAD = { l: 6, r: 6, t: 8, b: 16 };

  const maxX =
    Math.max(...all.map((p) => p.mileage), here?.mileage || 0) * 1.05;
  const maxY = Math.max(...all.map((p) => p.price), here?.price || 0) * 1.08;
  const x = (m: number) => PAD.l + (m / maxX) * (W - PAD.l - PAD.r);
  const y = (p: number) => H - PAD.b - (p / maxY) * (H - PAD.t - PAD.b);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ overflow: "visible" }}
      >
        {/* market dots */}
        {all.map((p, i) => (
          <circle
            key={i}
            cx={x(p.mileage)}
            cy={y(p.price)}
            r={2.5}
            fill="var(--t4)"
            opacity={0.35}
          />
        ))}
        {/* depreciation trend */}
        {trend && trend.length === 2 && (
          <line
            x1={x(trend[0].mileage)}
            y1={y(trend[0].price)}
            x2={x(Math.min(trend[1].mileage, maxX))}
            y2={y(
              trend[1].price +
                ((trend[1].price - trend[0].price) /
                  (trend[1].mileage - trend[0].mileage)) *
                  (Math.min(trend[1].mileage, maxX) - trend[1].mileage),
            )}
            stroke="var(--green)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.7}
          />
        )}
        {/* this car */}
        {here?.mileage != null &&
          here?.price != null &&
          here.mileage > 0 &&
          here.price > 0 && (
            <>
              <circle
                cx={x(here.mileage)}
                cy={y(here.price)}
                r={6}
                fill="var(--amber)"
                stroke="#fff"
                strokeWidth={1.5}
              />
            </>
          )}
      </svg>
      <div className="flex justify-between text-[10px] text-[var(--t5)] font-semibold mt-1">
        <span>0 mi</span>
        <span style={{ color: "var(--amber)" }}>● this car</span>
        <span>{Math.round(maxX / 1000)}k mi</span>
      </div>
    </div>
  );
}
