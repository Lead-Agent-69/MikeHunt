"use client";

import React from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** Market ticker strip (each stat shown once). Hides when empty. */
export function DealTicker() {
  const { data } = useSWR("/api/market/ticker", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 300_000,
  });
  const raw: any[] = data?.items ?? [];
  // Render each stat once. The old marquee clone (items rendered twice) had no animation behind it,
  // so a single-item personal ticker read "New listings today: N" twice side by side.
  const seen = new Set<string>();
  const items = raw.filter((it) => {
    const key = String(it?.label ?? "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (items.length === 0) return null;
  return (
    <div className="relative overflow-hidden py-1.5 border-y border-[var(--b1)] -mx-4 md:-mx-6">
      <div className="ticker-inner flex flex-wrap items-center gap-x-4 gap-y-1 px-4 md:px-6">
        {items.map((it, i) => (
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
