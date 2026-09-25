"use client";

import React from "react";
import { Mono } from "@/components/shared/Mono";
import type { InventoryItem } from "@/lib/data/inventory-service";

// Fleet KPI rollup — closes the flip loop. From the dealer's own inventory: capital deployed, avg
// margin + days-to-sell on closed flips, avg recon spend, and the live "ghost cost" of cars sitting on
// the lot. Plus the current bottleneck stage. All computed from real inventory; empty-safe.

const FLOOR_PER_DAY = 35; // est. daily holding/floor cost per unit when not tracked explicitly

const days = (a?: Date | string, b?: Date | string) => {
  if (!a || !b) return null;
  const d = (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
  return d >= 0 ? d : null;
};
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

export function FleetKPIs({ fleet }: { fleet: InventoryItem[] }) {
  const k = React.useMemo(() => {
    const sold = fleet.filter((f) => f.stage === "sold");
    const active = fleet.filter((f) => f.stage !== "sold");

    const margins = sold
      .map((s) => (Number(s.soldPrice) || 0) - (Number(s.totalCost) || 0))
      .filter((m) => Number.isFinite(m));
    const ttm = sold
      .map((s) => days(s.soldDate, s.createdAt))
      .filter((d): d is number => d != null);
    const recon = fleet.map(
      (f) => (Number(f.reconCost) || 0) + (Number(f.repairCost) || 0),
    );
    const capital = active.reduce((s, f) => s + (Number(f.totalCost) || 0), 0);

    // Ghost cost: what the cars sitting on the lot are quietly burning (explicit holdingCost or floor est).
    const ghost = active.reduce((s, f) => {
      const explicit = Number(f.holdingCost) || 0;
      if (explicit > 0) return s + explicit;
      const age = days(new Date(), f.createdAt) || 0;
      return s + age * FLOOR_PER_DAY;
    }, 0);

    // Bottleneck: the non-sold stage holding the most units.
    const byStage: Record<string, number> = {};
    for (const f of active) byStage[f.stage] = (byStage[f.stage] || 0) + 1;
    const bottleneck = Object.entries(byStage).sort((a, b) => b[1] - a[1])[0];

    return {
      active: active.length,
      sold: sold.length,
      avgMargin: mean(margins),
      avgTtm: mean(ttm),
      avgRecon: mean(recon),
      capital,
      ghost,
      bottleneck: bottleneck
        ? { stage: bottleneck[0], n: bottleneck[1] }
        : null,
    };
  }, [fleet]);

  if (!fleet.length) {
    return (
      <div
        className="rounded-[var(--r3)] p-4 text-center text-sm text-[var(--t4)]"
        style={{ background: "var(--s1)" }}
      >
        Add your first vehicle to see fleet KPIs — margin, days-to-sell, recon
        spend, and holding cost.
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r3)] md:grid-cols-4 lg:grid-cols-7"
      style={{ background: "var(--s2)", boxShadow: "var(--shadow)" }}
    >
      <KPI label="In pipeline" value={`${k.active}`} sub={`${k.sold} sold`} />
      <KPI label="Capital deployed" value={money(k.capital)} />
      <KPI
        label="Avg margin"
        value={k.sold ? money(k.avgMargin) : "—"}
        accent={k.avgMargin >= 0 ? "var(--green)" : "var(--red)"}
        sub={k.sold ? "per flip" : "no sales yet"}
      />
      <KPI
        label="Avg days to sell"
        value={k.sold ? `${Math.round(k.avgTtm)}d` : "—"}
      />
      <KPI label="Avg recon" value={money(k.avgRecon)} />
      <KPI
        label="Ghost cost (lot)"
        value={money(k.ghost)}
        accent="var(--amber-d)"
        sub="holding, live"
      />
      <KPI
        label="Bottleneck"
        value={k.bottleneck ? k.bottleneck.stage : "—"}
        sub={k.bottleneck ? `${k.bottleneck.n} units` : ""}
      />
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 p-3"
      style={{ background: "var(--s1)" }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--t4)]">
        {label}
      </span>
      <Mono
        className="text-lg font-black capitalize leading-none"
        style={{ color: accent || "var(--t1)" }}
      >
        {value}
      </Mono>
      {sub && <span className="text-[10px] text-[var(--t4)]">{sub}</span>}
    </div>
  );
}
