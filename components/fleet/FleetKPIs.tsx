"use client";

import React from "react";
import { Mono } from "@/components/shared/Mono";
import type { InventoryItem } from "@/lib/data/inventory-service";
import Link from "next/link";
import useSWR from "swr";
import { useDealerId } from "@/hooks/useDealerId";
import { ownerOutcomeFetcher } from "@/lib/outcomes/fetcher";
import {
  completeOutcomeRows,
  ledgerTotals,
  type LedgerRow,
} from "@/lib/outcomes/ledger";

// Inventory operations plus reviewed outcome results; modeled holding costs stay separate.

const FLOOR_PER_DAY = 35; // est. daily holding/floor cost per unit when not tracked explicitly

const days = (a?: Date | string, b?: Date | string) => {
  if (!a || !b) return null;
  const d = (new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
  return Number.isFinite(d) && d >= 0 ? d : null;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;

export function FleetKPIs({ fleet }: { fleet: InventoryItem[] }) {
  const { dealerId, loading } = useDealerId();
  const { data, error, isLoading, mutate } = useSWR(
    dealerId && !loading ? ["/api/outcomes", dealerId] : null,
    ownerOutcomeFetcher,
    { revalidateOnFocus: false },
  );
  const k = React.useMemo(() => {
    const sold = fleet.filter((f) => f.stage === "sold");
    const active = fleet.filter(
      (f) => f.stage !== "sold" && f.stage !== "wholesale",
    );

    const soldIds = new Set(sold.map((item) => item.id));
    const reviewed = error
      ? []
      : completeOutcomeRows((data?.outcomes ?? []) as LedgerRow[]).filter(
          (row) => row.inventory_id && soldIds.has(row.inventory_id),
        );
    const margins = reviewed.map((row) => ledgerTotals(row).profit!);
    const ttm = reviewed.map((row) => ledgerTotals(row).daysToSell!);
    const recon = fleet.map(
      (f) => (Number(f.reconCost) || 0) + (Number(f.repairCost) || 0),
    );
    const capital = active.reduce((s, f) => s + (Number(f.totalCost) || 0), 0);

    // Ghost cost: what the cars sitting on the lot are quietly burning (explicit holdingCost or floor est).
    const ghost = active.reduce((s, f) => {
      const age = days(new Date(), f.floorDate) || 0;
      const rate = f.dailyFloorRate > 0 ? f.dailyFloorRate : FLOOR_PER_DAY;
      return s + Math.floor(age) * rate;
    }, 0);

    // Bottleneck: the non-sold stage holding the most units.
    const byStage: Record<string, number> = {};
    for (const f of active) byStage[f.stage] = (byStage[f.stage] || 0) + 1;
    const bottleneck = Object.entries(byStage).sort((a, b) => b[1] - a[1])[0];

    return {
      active: active.length,
      sold: sold.length,
      reviewed: reviewed.length,
      avgMargin: mean(margins),
      avgTtm: mean(ttm),
      avgRecon: mean(recon),
      capital,
      ghost,
      bottleneck: bottleneck
        ? { stage: bottleneck[0], n: bottleneck[1] }
        : null,
    };
  }, [fleet, data, error]);

  if (!fleet.length) {
    return (
      <div
        className="rounded-[var(--r3)] p-4 text-center text-sm text-[var(--t4)]"
        style={{ background: "var(--s1)" }}
      >
        Add your first vehicle to see fleet KPIs — reviewed net results,
        days-to-sell, recon spend, and holding cost.
      </div>
    );
  }

  return (
    <section aria-label="Pipeline metrics" className="space-y-2">
      <div
        className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r3)] md:grid-cols-4 lg:grid-cols-7"
        style={{ background: "var(--s2)", boxShadow: "var(--shadow)" }}
      >
        <KPI label="In pipeline" value={`${k.active}`} sub={`${k.sold} sold`} />
        <KPI label="Capital deployed" value={money(k.capital)} />
        <KPI
          label="Avg recorded net"
          value={k.reviewed ? money(k.avgMargin) : "—"}
          accent={
            k.reviewed
              ? k.avgMargin >= 0
                ? "var(--green)"
                : "var(--red)"
              : undefined
          }
          sub={
            error
              ? "history unavailable"
              : isLoading || loading
                ? "loading records"
                : `${k.reviewed} reviewed sale${k.reviewed === 1 ? "" : "s"}`
          }
        />
        <KPI
          label="Avg days to sell"
          value={k.reviewed ? `${Math.round(k.avgTtm)}d` : "—"}
        />
        <KPI label="Avg recon" value={money(k.avgRecon)} />
        <KPI
          label="Modeled holding cost"
          value={money(k.ghost)}
          accent="var(--amber-d)"
          sub="recorded rate or $35/day"
        />
        <KPI
          label="Bottleneck"
          value={k.bottleneck ? k.bottleneck.stage : "—"}
          sub={
            k.bottleneck
              ? `${k.bottleneck.n} unit${k.bottleneck.n === 1 ? "" : "s"}`
              : ""
          }
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-[var(--t3)]">
          Reviewed results unavailable.{" "}
          <button
            type="button"
            onClick={() => mutate()}
            className="min-h-11 underline"
          >
            Retry outcome records
          </button>
        </p>
      ) : (
        <p className="text-xs text-[var(--t3)]">
          Net results before income tax use complete owner-reported costs for
          this pipeline, within the latest 200 outcome records.{" "}
          <Link
            href="/insights"
            className="inline-flex min-h-11 items-center underline"
          >
            Review actual costs
          </Link>
        </p>
      )}
    </section>
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
