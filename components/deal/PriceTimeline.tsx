"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) => `$${(Number(v) || 0).toLocaleString()}`;

/** Per-listing price timeline + motivated-seller signal (Visor price history). Hides with <2 points. */
export function PriceTimeline({ dealId }: { dealId: string }) {
  const { data } = useSWR(`/api/deals/${dealId}/price-history`, fetcher, {
    revalidateOnFocus: false,
  });
  // The route returns a bare ascending array of { price, observedAt }.
  const raw: any[] = Array.isArray(data) ? data : (data?.history ?? []);
  if (raw.length < 2) return null;

  // Ascending → compute change vs previous; show newest first.
  const withChange = raw.map((h, i) => ({
    price: Number(h.price),
    at: h.observedAt || h.observed_at || h.created_at,
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
        Price history
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
            ↓ {drops} price drops{days != null ? ` in ${days} days` : ""} —
            motivated seller
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
                ? "listed"
                : `${h.change < 0 ? "↓" : "↑"} ${money(Math.abs(h.change))}`}
            </span>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-[var(--t4)]">
        {days != null ? `On market ${days}d · ` : ""}
        {totalChange !== 0
          ? `${totalChange < 0 ? "down" : "up"} ${money(Math.abs(totalChange))} total`
          : "no change"}
      </p>
    </div>
  );
}
