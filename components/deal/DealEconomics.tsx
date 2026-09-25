"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Mono } from "@/components/shared/Mono";

// The money, at a glance. One bar = the sale price; cost segments fill it left-to-right and the green
// tail is YOUR profit. A primitive glance tells the whole story: "this much covers the car + costs,
// this green part is mine." When you'd overpay, it goes red and shows the loss. Stunning + obvious.

interface Props {
  buy: number; // recommended buy / max bid
  transport: number;
  recon: number;
  fees: number;
  sell: number;
  profit: number;
  verdict?: "GO" | "HOLD" | "PASS" | string;
}

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

const VERDICT = {
  GO: { c: "var(--green)", t: "BUY IT" },
  HOLD: { c: "var(--amber)", t: "MAYBE" },
  PASS: { c: "var(--red)", t: "SKIP IT" },
} as const;

export function DealEconomics({
  buy,
  transport,
  recon,
  fees,
  sell,
  profit,
  verdict = "PASS",
}: Props) {
  if (!sell || sell <= 0) return null;
  const v = String(verdict).toUpperCase();
  const vv = (VERDICT as any)[v] || VERDICT.PASS;
  const cost =
    Math.max(0, buy) +
    Math.max(0, transport) +
    Math.max(0, recon) +
    Math.max(0, fees);
  const profitable = profit > 0;

  // The bar = all the money in play (costs + your cut/loss), so it always fills and the segments are
  // honestly proportional — costs take their share, the green (or red) tail is what's left for you.
  const scale = cost + Math.abs(profit) || 1;
  const pct = (n: number) =>
    `${Math.max(0, Math.min(100, (n / scale) * 100))}%`;

  const segs = [
    { label: "Buy", value: Math.max(0, buy), color: "var(--t2)" },
    { label: "Transport", value: Math.max(0, transport), color: "var(--t4)" },
    { label: "Recon", value: Math.max(0, recon), color: "var(--amber-d)" },
    { label: "Fees", value: Math.max(0, fees), color: "var(--t5)" },
  ].filter((s) => s.value > 0);

  return (
    <Card
      className="border-none overflow-hidden relative"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
    >
      <div className="h-1 w-full" style={{ background: vv.c }} />
      <CardContent className="p-6 md:p-7">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-1.5">
              {profitable ? "Your profit" : "You'd lose"}
            </p>
            <div className="flex items-center gap-3">
              <Mono
                className="text-4xl md:text-5xl font-black leading-none text-transparent bg-clip-text"
                style={{
                  fontFamily: "var(--fm)",
                  backgroundImage: profitable
                    ? "linear-gradient(100deg, var(--green), #86efac)"
                    : "linear-gradient(100deg, var(--red), #fca5a5)",
                }}
              >
                {profitable ? "+" : "−"}
                {money(profit)}
              </Mono>
              <span
                className="px-2.5 py-1 rounded-md text-[11px] font-black uppercase text-white tracking-wide"
                style={{ background: vv.c }}
              >
                {vv.t}
              </span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
              Sells for
            </p>
            <Mono className="text-xl font-black text-[var(--t1)]">
              {money(sell)}
            </Mono>
          </div>
        </div>

        {/* The one-glance profit bar */}
        <div
          className="relative h-11 w-full rounded-[var(--r2)] overflow-hidden flex"
          style={{ background: "var(--s2)" }}
        >
          {segs.map((s, i) => (
            <div
              key={s.label}
              className="h-full"
              style={{
                width: pct(s.value),
                background: s.color,
                borderRight: "1px solid var(--s0)",
                transformOrigin: "left",
                animation: `growBar 650ms cubic-bezier(.16,1,.3,1) ${i * 70}ms both`,
              }}
              title={`${s.label}: ${money(s.value)}`}
            />
          ))}
          {/* Profit tail (green) or overpay (red) — width = the profit number itself, so they agree */}
          <div
            className="h-full"
            style={{
              width: pct(Math.abs(profit)),
              background: profitable
                ? "linear-gradient(90deg, rgba(34,197,94,.85), rgba(34,197,94,.55))"
                : "linear-gradient(90deg, rgba(239,68,68,.85), rgba(239,68,68,.55))",
              boxShadow: profitable
                ? "0 0 24px rgba(34,197,94,.5) inset"
                : "0 0 24px rgba(239,68,68,.5) inset",
              transformOrigin: "left",
              animation: `growBar 650ms cubic-bezier(.16,1,.3,1) ${segs.length * 70}ms both`,
            }}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4">
          {segs.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              <span className="text-[var(--t4)] font-semibold">{s.label}</span>
              <Mono className="text-[var(--t2)] font-bold">
                {money(s.value)}
              </Mono>
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs ml-auto">
            <span className="text-[var(--t4)] font-semibold">All-in</span>
            <Mono className="text-[var(--t1)] font-black">{money(cost)}</Mono>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
