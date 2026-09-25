"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Mono } from "@/components/shared/Mono";

// REAL recent sale prices for this model (eBay sold etc.) — actual money that changed hands, not
// asking prices. Shows the dealer what these truly sell for. Hides when there's no real data.
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n?: number | null) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

export function RecentlySold({
  make,
  model,
  year,
}: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}) {
  const key =
    make && model
      ? `/api/sold?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}${year ? `&year=${year}` : ""}`
      : null;
  const { data } = useSWR(key, fetcher, { revalidateOnFocus: false });
  if (!data || !data.count || data.count < 2) return null;

  return (
    <Card
      className="border-none"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Real recent sales · {make} {model}
          </p>
          <span className="text-[10px] text-[var(--t5)]">
            actual transactions
          </span>
        </div>

        <div className="flex items-end gap-5 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
              Median sold
            </p>
            <Mono className="text-3xl font-black text-[var(--t1)] leading-none">
              {money(data.median)}
            </Mono>
          </div>
          <p className="text-xs text-[var(--t3)] font-semibold pb-1">
            {data.count} sales · {money(data.low)}–{money(data.high)}
          </p>
        </div>

        <div className="divide-y divide-[var(--b1)]">
          {(data.sales || []).map((s: any, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="truncate text-[var(--t2)]">{s.title}</span>
              <div className="flex items-center gap-3 shrink-0">
                {s.mileage ? (
                  <Mono className="text-xs text-[var(--t4)]">
                    {Math.round(s.mileage).toLocaleString()} mi
                  </Mono>
                ) : null}
                <Mono className="font-bold text-[var(--green)]">
                  {money(s.price)}
                </Mono>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
