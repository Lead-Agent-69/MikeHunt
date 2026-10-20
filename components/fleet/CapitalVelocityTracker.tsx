"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { ownerOutcomeFetcher } from "@/lib/outcomes/fetcher";
import { fetcher } from "@/lib/swr-config";
import { useDealerId } from "@/hooks/useDealerId";
import {
  completeOutcomeRows,
  ledgerTotals,
  type LedgerRow,
} from "@/lib/outcomes/ledger";
import { InventoryItem } from "@/lib/data/inventory-service";

const DAILY_FLOOR_RATE = 35;

interface StageMetrics {
  stage: string;
  label: string;
  count: number;
  capitalLocked: number;
  avgDays: number;
  color: string;
}

export function CapitalVelocityTracker() {
  const { dealerId, loading: dealerLoading } = useDealerId();

  const { data: invData, isLoading } = useSWR(
    dealerId && !dealerLoading
      ? `/api/inventory?dealerId=${dealerId}&limit=200`
      : null,
    fetcher,
    { refreshInterval: 60_000 },
  );

  const { data: outData, error: outError } = useSWR(
    dealerId && !dealerLoading ? ["/api/outcomes", dealerId] : null,
    ownerOutcomeFetcher,
    {
      revalidateOnFocus: false,
    },
  );

  const metrics = useMemo(() => {
    const inventory = (invData?.items || []) as InventoryItem[];
    const outcomes = completeOutcomeRows(
      (outData?.outcomes ?? []) as LedgerRow[],
    );
    const now = Date.now();

    const active = inventory.filter(
      (i) => i.stage !== "sold" && i.stage !== "wholesale",
    );

    const capitalDeployed = active.reduce((s, i) => s + i.totalCost, 0);

    const dailyBurn = active.reduce((s, i) => {
      return s + (i.dailyFloorRate > 0 ? i.dailyFloorRate : DAILY_FLOOR_RATE);
    }, 0);

    const totalCarry = active.reduce((s, i) => {
      const days = Math.max(
        0,
        Math.floor((now - new Date(i.floorDate).getTime()) / 86_400_000),
      );
      return (
        s + days * (i.dailyFloorRate > 0 ? i.dailyFloorRate : DAILY_FLOOR_RATE)
      );
    }, 0);

    const avgDaysToFlip = outcomes.length
      ? Math.round(
          outcomes.reduce(
            (sum, row) => sum + ledgerTotals(row).daysToSell!,
            0,
          ) / outcomes.length,
        )
      : null;
    const avgNet = outcomes.length
      ? outcomes.reduce((sum, row) => sum + ledgerTotals(row).profit!, 0) /
        outcomes.length
      : null;

    const STAGE_COLORS: Record<string, string> = {
      acquired: "var(--blue)",
      transport: "var(--amber)",
      recon: "var(--coral)",
      listed: "var(--green)",
      offer: "#a78bfa",
    };
    const stageMetrics: StageMetrics[] = [
      "acquired",
      "transport",
      "recon",
      "listed",
      "offer",
    ].map((s) => {
      const units = active.filter((i) => i.stage === s);
      const avgDays =
        units.length > 0
          ? Math.round(
              units.reduce((acc, i) => {
                return (
                  acc +
                  Math.max(
                    0,
                    Math.floor(
                      (now - new Date(i.floorDate).getTime()) / 86_400_000,
                    ),
                  )
                );
              }, 0) / units.length,
            )
          : 0;
      return {
        stage: s,
        label: s.charAt(0).toUpperCase() + s.slice(1),
        count: units.length,
        capitalLocked: units.reduce((a, i) => a + i.totalCost, 0),
        avgDays,
        color: STAGE_COLORS[s] ?? "var(--t4)",
      };
    });

    const staleUnits = active.filter((i) => {
      const days = Math.floor(
        (now - new Date(i.floorDate).getTime()) / 86_400_000,
      );
      return days > 45;
    });

    const winRate =
      outcomes.length > 0
        ? Math.round(
            (outcomes.filter((o) => ledgerTotals(o).profit! > 0).length /
              outcomes.length) *
              100,
          )
        : null;

    return {
      capitalDeployed,
      dailyBurn,
      totalCarry,
      avgDaysToFlip,
      avgNet,
      stageMetrics,
      staleCount: staleUnits.length,
      activeCount: active.length,
      completedCount: outcomes.length,
      winRate,
    };
  }, [invData, outData]);

  if (isLoading || dealerLoading) {
    return (
      <div className="glass-panel p-6 space-y-4 animate-pulse">
        <div className="h-4 w-32 rounded bg-[var(--s3)]" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-[var(--s3)]" />
          ))}
        </div>
      </div>
    );
  }

  const burnPct =
    metrics.capitalDeployed > 0
      ? Math.min(1, metrics.totalCarry / metrics.capitalDeployed)
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-panel p-5 space-y-5"
      style={{
        borderColor: "rgba(251,191,36,0.18)",
        background: "rgba(251,191,36,0.02)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
            Capital and recorded results
          </p>
          <p className="text-xs text-[var(--t4)] mt-0.5">
            {metrics.activeCount} active units · $
            {metrics.dailyBurn.toLocaleString()}/day modeled carry
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {metrics.staleCount > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "var(--rlo)",
                color: "var(--red)",
                border: "1px solid var(--rbd)",
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              ⚠ {metrics.staleCount} stale
            </span>
          )}
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Capital Deployed",
            value: `$${(metrics.capitalDeployed / 1000).toFixed(0)}k`,
            sub: `across ${metrics.activeCount} units`,
            color: "var(--blue)",
          },
          {
            label: "Modeled Daily Carry",
            value: `$${metrics.dailyBurn.toLocaleString()}`,
            sub: "recorded rate or $35/day default",
            color: "var(--red)",
          },
          {
            label: "Modeled Carry to Date",
            value: `$${Math.round(metrics.totalCarry).toLocaleString()}`,
            sub: "estimate; review actual expenses",
            color: "var(--amber)",
          },
          {
            label: "Avg Flip Time",
            value:
              metrics.avgDaysToFlip == null
                ? "Unavailable"
                : `${metrics.avgDaysToFlip}d`,
            sub: "complete recorded sales",
            color: "var(--amber)",
          },
          {
            label: "Win Rate",
            value:
              metrics.winRate == null ? "Unavailable" : `${metrics.winRate}%`,
            sub: `${metrics.completedCount} complete records`,
            color:
              (metrics.winRate ?? 0) >= 70 ? "var(--green)" : "var(--amber)",
          },
          {
            label: "Avg Net / Deal",
            value:
              metrics.avgNet == null
                ? "Unavailable"
                : `${metrics.avgNet >= 0 ? "+" : "-"}$${Math.round(Math.abs(metrics.avgNet)).toLocaleString()}`,
            sub: "owner-reported; before income tax",
            color: (metrics.avgNet ?? 0) >= 0 ? "var(--green)" : "var(--red)",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl p-3 space-y-1"
            style={{ background: "var(--s2)", border: "1px solid var(--b1)" }}
          >
            <p
              className="text-[10px] uppercase tracking-wider font-bold"
              style={{ color: "var(--t5)" }}
            >
              {kpi.label}
            </p>
            <Mono
              className="text-lg font-black break-words"
              style={{ color: kpi.color }}
            >
              {kpi.value}
            </Mono>
            <p className="text-[10px]" style={{ color: "var(--t5)" }}>
              {kpi.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Burn Pressure Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="font-bold text-[var(--t4)]">
            Modeled Carry / Capital
          </span>
          <span
            className="font-mono font-bold"
            style={{
              color: burnPct > 0.6 ? "var(--red)" : "var(--amber)",
            }}
          >
            {Math.round(burnPct * 100)}%
          </span>
        </div>
        <div
          className="relative h-2 w-full rounded-full overflow-hidden"
          style={{ background: "var(--s3)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            style={{
              width: `${burnPct * 100}%`,
              background:
                burnPct > 0.6
                  ? "linear-gradient(90deg, var(--amber), var(--red))"
                  : "linear-gradient(90deg, var(--green), var(--amber))",
            }}
          />
        </div>
        <p className="text-[10px] text-[var(--t5)]">
          ${metrics.totalCarry.toLocaleString()} carry accrued ÷ $
          {metrics.capitalDeployed.toLocaleString()} deployed
        </p>
      </div>

      {/* Pipeline Stage Heat */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
          Pipeline Heat
        </p>
        <div className="flex gap-2 flex-wrap">
          {metrics.stageMetrics.map((s) => (
            <div
              key={s.stage}
              className="flex-1 min-w-[72px] rounded-xl p-2.5 text-center"
              style={{
                background:
                  s.count > 0
                    ? `color-mix(in srgb, ${s.color} 8%, transparent)`
                    : "var(--s1)",
                border: `1px solid ${s.count > 0 ? `color-mix(in srgb, ${s.color} 20%, transparent)` : "var(--b1)"}`,
              }}
            >
              <Mono
                className="text-lg font-black"
                style={{ color: s.count > 0 ? s.color : "var(--t5)" }}
              >
                {s.count}
              </Mono>
              <p
                className="text-[9px] font-bold uppercase tracking-wider"
                style={{ color: "var(--t5)" }}
              >
                {s.label}
              </p>
              {s.count > 0 && (
                <p className="text-[9px] mt-0.5" style={{ color: "var(--t5)" }}>
                  ${(s.capitalLocked / 1000).toFixed(0)}k
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--t4)]">
        {outError
          ? "Outcome history could not be loaded. Review your records in Outcomes and learning. "
          : "Historical results include reviewed costs and losses. Incomplete records do not count. "}
        These owner-reported results do not forecast future returns.
      </p>
    </motion.div>
  );
}
