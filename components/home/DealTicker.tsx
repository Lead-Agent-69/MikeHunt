"use client";

import React from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Scrolling market ticker (Visor-style marquee), dealer data. Hides when empty. */
export function DealTicker() {
  const { data } = useSWR("/api/market/ticker", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 300_000,
  });
  const items: any[] = data?.items ?? [];
  if (items.length === 0) return null;

  const loop = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-1.5 border-y border-[var(--b1)] -mx-4 md:-mx-6">
      <div className="ticker-inner">
        {loop.map((it, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-[11px]"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  it.change > 0
                    ? "var(--green)"
                    : it.change < 0
                      ? "var(--amber)"
                      : "var(--blue)",
              }}
            />
            <span className="text-[var(--t2)] font-medium">{it.label}</span>
            {it.change !== 0 && (
              <span
                style={{
                  color: it.change > 0 ? "var(--green)" : "var(--amber)",
                }}
              >
                {it.change > 0 ? "↑ +" : "↓ "}
                {Math.abs(it.change)}% / wk
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
