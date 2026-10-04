"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { fetchObservedPrices } from "@/lib/vehicle/observed-price-history";

const money = (v: any) => `$${(Number(v) || 0).toLocaleString()}`;

/** Per-listing price timeline + motivated-seller signal (Visor price history). Hides with <2 points. */
export function PriceTimeline({ dealId }: { dealId: string }) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/deals/${dealId}/price-history`,
    fetchObservedPrices,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000,
      errorRetryCount: 1,
    },
  );
  // The route returns a bare ascending array of { price, observedAt }.
  const raw = data ?? [];
  if (isLoading)
    return (
      <p role="status" className="py-4 text-sm text-[var(--t3)]">
        Loading observed prices...
      </p>
    );
  if (error)
    return (
      <div className="py-4 text-sm text-[var(--t3)]">
        <p>Price history could not be loaded.</p>
        <button
          type="button"
          className="mt-2 min-h-11 text-[var(--blue)]"
          onClick={() => void mutate()}
        >
          Try again
        </button>
      </div>
    );
  if (raw.length < 2)
    return (
      <p className="py-4 text-sm text-[var(--t3)]">
        Not enough dated price observations to show a trend.
      </p>
    );

  // Ascending → compute change vs previous; show newest first.
  const withChange = raw.map((h, i) => ({
    price: Number(h.price),
    at: h.observedAt,
    change: i > 0 ? Number(h.price) - Number(raw[i - 1].price) : 0,
  }));
  const drops = withChange.filter((h) => h.change < 0).length;
  const firstAt = withChange[0]?.at;
  const days = firstAt
    ? Math.floor((Date.now() - new Date(firstAt).getTime()) / 86400000)
    : null;
  const totalChange =
    withChange[withChange.length - 1].price - withChange[0].price;
  const rows = [...withChange].reverse().slice(0, 8);

  return (
    <div className="glass-panel p-5 mt-4 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
        Listing price history
      </p>

      {drops >= 2 && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-[var(--r2)]"
          style={{
            background: "var(--glo)",
            border: "0.5px solid var(--green)",
          }}
        >
          <span className="text-xs font-bold text-[var(--green)]">
            {drops} observed price drops. Seller intent is unknown.
          </span>
        </div>
      )}

      <div className="divide-y divide-[var(--b1)]">
        {rows.map((h, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-1.5 text-xs"
          >
            <span className="text-[var(--t4)] w-16">
              {h.at
                ? new Date(h.at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                : "—"}
            </span>
            <Mono
              className="text-[var(--t2)] font-bold flex-1 text-right pr-3"
              style={{ fontFamily: "var(--fm)" }}
            >
              {money(h.price)}
            </Mono>
            <span
              className="w-20 text-right"
              style={{
                color:
                  h.change < 0
                    ? "var(--green)"
                    : h.change > 0
                      ? "var(--red)"
                      : "var(--t5)",
              }}
            >
              {h.change === 0
                ? "observed"
                : `${h.change < 0 ? "↓" : "↑"} ${money(Math.abs(h.change))}`}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--t4)]">
        {days != null
          ? `First observed by MIKEHUNT ${Math.max(0, days)}d ago · `
          : ""}
        {totalChange !== 0
          ? `${totalChange < 0 ? "down" : "up"} ${money(Math.abs(totalChange))} total`
          : "no change"}
      </p>
      <p className="text-xs leading-relaxed text-[var(--t4)]">
        Recorded listing amounts, not confirmed sale prices or vehicle-history
        records. First observed is not the original listing date.
      </p>
    </div>
  );
}
