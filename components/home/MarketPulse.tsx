"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) => `$${(Number(v) || 0).toLocaleString()}`;

/** "What the market's doing" — the make/models with the most live GO deals (Visor home hook). */
export function MarketPulse() {
  const { data } = useSWR("/api/market/pulse", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
  const rows: any[] = data?.rows ?? [];
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[10px] font-bold text-[var(--t4)] uppercase tracking-[0.18em]">
          What the market's doing
        </h2>
        <span className="text-[10px] text-[var(--t4)]">
          {new Date().toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.slice(0, 6).map((r) => (
          <Link
            key={`${r.make}-${r.model}`}
            href={`/overview/${encodeURIComponent(r.make)}/${encodeURIComponent(r.model)}`}
            className="glass-panel p-4 hover:border-[var(--amber-bd)] transition-colors"
          >
            <p className="text-sm font-bold text-[var(--t1)] capitalize mb-2 truncate">
              {r.make} {r.model}
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <Mono
                  className="text-base font-black text-[var(--t1)]"
                  style={{ fontFamily: "var(--fm)" }}
                >
                  {r.goDeals}
                </Mono>
                <p className="text-[10px] text-[var(--t4)]">BUY</p>
              </div>
              <div>
                <Mono
                  className="text-base font-black text-[var(--green)]"
                  style={{ fontFamily: "var(--fm)" }}
                >
                  {money(r.avgProfit)}
                </Mono>
                <p className="text-[10px] text-[var(--t4)]">avg profit</p>
              </div>
              <div>
                <Mono
                  className="text-base font-black"
                  style={{
                    fontFamily: "var(--fm)",
                    color: r.avgDays > 30 ? "var(--amber)" : "var(--t1)",
                  }}
                >
                  {r.avgDays}d
                </Mono>
                <p className="text-[10px] text-[var(--t4)]">on market</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
