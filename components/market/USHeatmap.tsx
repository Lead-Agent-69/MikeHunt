"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";

// State tiles summarize only purchase-evidence-backed candidates in the bounded sample.
// An empty state is not proof that its entire market has no inventory.
// Recognizable tile layout (not a precise map); each tile links into that state's discovery feed.
const fetcher = async (u: string) => {
  const response = await fetch(u);
  if (!response.ok) throw new Error("Market map unavailable");
  return response.json();
};

// prettier-ignore
const GRID: string[][] = [
  ["AK","" ,"" ,"" ,"" ,"" ,"" ,"" ,"" ,"" ,"ME"],
  ["" ,"" ,"" ,"" ,"" ,"" ,"" ,"" ,"" ,"VT","NH"],
  ["WA","ID","MT","ND","MN","WI","" ,"MI","" ,"NY","MA"],
  ["OR","NV","WY","SD","IA","IL","IN","OH","PA","NJ","RI"],
  ["CA","UT","CO","NE","MO","KY","WV","VA","MD","CT","" ],
  ["" ,"AZ","NM","KS","AR","TN","NC","SC","DC","DE","" ],
  ["" ,"" ,"" ,"OK","LA","MS","AL","GA","" ,"" ,"" ],
  ["HI","" ,"TX","" ,"" ,"" ,"" ,"FL","" ,"" ,"" ],
];

const money = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`;

export function USHeatmap() {
  const { data, error, isLoading } = useSWR("/api/market/heatmap", fetcher, {
    revalidateOnFocus: false,
  });
  const states: Record<
    string,
    { n: number; avgProfit?: number; maxProfit?: number }
  > = data?.states || {};
  const maxN: number = data?.maxN || 1;

  return (
    <div
      className="rounded-[var(--r3)] p-3"
      style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
          {error
            ? "Market map unavailable"
            : isLoading
              ? "Checking market evidence…"
              : `Evidence-backed candidates · ${data?.total ?? 0} in the current sample`}
        </span>
        <span className="text-[10px] text-[var(--t5)]">
          click a state to drill in
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {GRID.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            {row.map((st, ci) => {
              if (!st)
                return <div key={ci} className="h-9 flex-1" aria-hidden />;
              const s = states[st];
              const n = s?.n || 0;
              const intensity = n ? 0.18 + 0.82 * (n / maxN) : 0;
              const tile = (
                <div
                  className="flex h-9 flex-1 flex-col items-center justify-center rounded-[var(--r1)] transition-transform hover:scale-[1.08]"
                  style={{
                    background: n
                      ? `color-mix(in srgb, var(--green) ${Math.round(intensity * 100)}%, var(--s2))`
                      : "var(--s2)",
                    color: intensity > 0.55 ? "#06210f" : "var(--t3)",
                  }}
                  title={
                    n
                      ? `${st} · ${n} sampled candidate${n === 1 ? "" : "s"}${s.avgProfit != null && s.maxProfit != null ? ` · estimated net: best ${money(s.maxProfit)} · avg ${money(s.avgProfit)}` : ""}`
                      : `${st} · no verified candidate in this sample; coverage may be incomplete`
                  }
                >
                  <span className="text-[10px] font-black leading-none">
                    {st}
                  </span>
                  {n > 0 && (
                    <span className="text-[9px] font-bold leading-none opacity-80">
                      {n}
                    </span>
                  )}
                </div>
              );
              return n > 0 ? (
                <Link
                  key={ci}
                  href={`/discover?state=${st}`}
                  className="flex flex-1"
                >
                  {tile}
                </Link>
              ) : (
                <div key={ci} className="flex flex-1">
                  {tile}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
