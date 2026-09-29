"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { fetcher } from "@/lib/swr-config";
import { useDealerId } from "@/hooks/useDealerId";
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

function ProgressArc({
  pct,
  color,
  size = 72,
}: {
  pct: number;
  color: string;
  size?: number;
}) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(1, pct);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--s3)"
        strokeWidth={8}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
    </svg>
  );
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

  const { data: outData } = useSWR("/api/outcomes", fetcher, {
    revalidateOnFocus: false,
  });

  const metrics = useMemo(() => {
    const inventory = (invData?.items || []) as InventoryItem[];
    const outcomes: any[] = outData?.outcomes ?? [];
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
      return s + days * (i.dailyFloorRate > 0 ? i.dailyFloorRate : DAILY_FLOOR_RATE);
    }, 0);

    const estProfit = active.reduce((s, i) => {
      const mv = i.marketValue ?? i.listPrice ?? 0;
      return mv > 0 ? s + mv - i.totalCost : s;
    }, 0) - totalCarry;

    const logsWithSell = outcomes.filter(
      (o) => o.sell_price && o.purchase_price && o.days_to_sell,
    );
    const avgDaysToFlip =
      logsWithSell.length > 0
        ? Math.round(
            logsWithSell.reduce((s, o) => s + o.days_to_sell, 0) /
              logsWithSell.length,
          )
        : 28;

    const avgNet =
      logsWithSell.length > 0
        ? logsWithSell.reduce((s, o) => s + (o.actual_profit ?? 0), 0) /
          logsWithSell.length
        : 0;

    const flipsIn90 = avgDaysToFlip > 0 ? Math.floor(90 / avgDaysToFlip) : 3;
    const startCapital = capitalDeployed > 0 ? capitalDeployed : 15000;
    let compoundCapital = startCapital;
    for (let i = 0; i < flipsIn90; i++) {
      compoundCapital += Math.max(0, avgNet);
    }

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
            (outcomes.filter((o) => (o.actual_profit ?? 0) > 0).length /
              outcomes.length) *
              100,
          )
        : 0;

    return {
      capitalDeployed,
      dailyBurn,
      totalCarry,
      estProfit,
      avgDaysToFlip,
      avgNet,
      flipsIn90,
      compoundCapital,
      startCapital,
      stageMetrics,
      staleCount: staleUnits.length,
      activeCount: active.length,
      soldCount: inventory.filter((i) => i.stage === "sold").length,
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
      ? Math.min(1, metrics.totalCarry / (metrics.capitalDeployed * 0.15))
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
            Capital Velocity Engine
          </p>
          <p className="text-xs text-[var(--t4)] mt-0.5">
            {metrics.activeCount} active units · $
            {metrics.dailyBurn.toLocaleString()}/day burn
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
            label: "Daily Burn Rate",
            value: `$${metrics.dailyBurn.toLocaleString()}`,
            sub: "floor + carry/day",
            color: "var(--red)",
          },
          {
            label: "Est. Net Position",
            value: `${metrics.estProfit >= 0 ? "+" : ""}$${Math.abs(Math.round(metrics.estProfit / 1000)).toFixed(0)}k`,
            sub: "if listed at MMR",
            color: metrics.estProfit >= 0 ? "var(--green)" : "var(--red)",
          },
          {
            label: "Avg Flip Time",
            value: `${metrics.avgDaysToFlip}d`,
            sub: "from your logged wins",
            color: "var(--amber)",
          },
          {
            label: "Win Rate",
            value: `${metrics.winRate}%`,
            sub: `${metrics.soldCount} units logged`,
            color: metrics.winRate >= 70 ? "var(--green)" : "var(--amber)",
          },
          {
            label: "Avg Net / Deal",
            value: `${metrics.avgNet >= 0 ? "+" : ""}$${Math.round(metrics.avgNet).toLocaleString()}`,
            sub: "actual outcomes",
            color: metrics.avgNet >= 0 ? "var(--green)" : "var(--red)",
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
            <Mono className="text-xl font-black" style={{ color: kpi.color }}>
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
            Carry Cost Pressure
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
                background: s.count > 0 ? `${s.color}14` : "var(--s1)",
                border: `1px solid ${s.count > 0 ? `${s.color}30` : "var(--b1)"}`,
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

      {/* 90-Day Compounding Projection */}
      {metrics.avgNet > 0 && (
        <div
          className="rounded-xl p-4 flex items-center justify-between gap-4"
          style={{
            background: "rgba(5,150,105,0.06)",
            border: "1px solid rgba(5,150,105,0.2)",
          }}
        >
          <div className="relative shrink-0">
            <ProgressArc
              pct={
                metrics.startCapital > 0
                  ? (metrics.compoundCapital - metrics.startCapital) /
                    metrics.startCapital
                  : 0
              }
              color="var(--green)"
              size={72}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-black text-[var(--green)]">
                {metrics.flipsIn90}x
              </span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-1">
              90-Day Compound Projection
            </p>
            <div className="flex items-baseline gap-2">
              <Mono className="text-2xl font-black text-[var(--green)]">
                ${(metrics.compoundCapital / 1000).toFixed(0)}k
              </Mono>
              <span className="text-xs text-[var(--t4)]">
                from ${(metrics.startCapital / 1000).toFixed(0)}k at{" "}
                {metrics.flipsIn90} flips
              </span>
            </div>
            <p className="text-[10px] text-[var(--t5)] mt-1">
              Based on {metrics.avgDaysToFlip}d avg flip · $
              {Math.round(metrics.avgNet).toLocaleString()} avg net
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
