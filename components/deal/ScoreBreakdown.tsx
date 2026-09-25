"use client";

import { Ico } from "@/components/shared/Ico";

// "Why this score" — the reasoning made visible. The two dominant factors (Profit /40, Return /30) are
// RECOMPUTED here from the deal's live numbers using the engine's real thresholds, because the persisted
// scoreBreakdown JSON goes stale after a re-score (profit updates, the breakdown doesn't) — ~1/3 of GO deals
// had a stale sum. Speed/Risk are the engine's secondary sub-scores; "Market signal" is a demand HEURISTIC
// (keyword + season prior), disclosed as such rather than dressed up as live market data.

// Mirror of profit-calculator.ts thresholds so the shown points always match the profit/ROI above.
function profitPts(p: number): number {
  const t: [number, number][] = [
    [5000, 40],
    [4000, 35],
    [3000, 30],
    [2000, 25],
    [1500, 20],
    [1000, 15],
    [500, 10],
    [0, 5],
  ];
  for (const [k, v] of t) if (p >= k) return v;
  return 0;
}
function roiPts(r: number): number {
  const t: [number, number][] = [
    [50, 30],
    [40, 27],
    [30, 24],
    [25, 21],
    [20, 18],
    [15, 15],
    [10, 12],
    [5, 8],
    [0, 4],
  ];
  for (const [k, v] of t) if (r >= k) return v;
  return 0;
}

type IcoName = Parameters<typeof Ico>[0]["name"];

export function ScoreBreakdown({
  netProfit,
  roi,
  breakdown,
}: {
  netProfit: number;
  roi: number;
  breakdown?: Record<string, number> | null;
}) {
  const market =
    (breakdown?.marketDemandScore ?? 0) +
    (breakdown?.marketVelocityScore ?? 0) +
    (breakdown?.seasonalityScore ?? 0) +
    (breakdown?.competitionScore ?? 0);

  const rows: {
    icon: IcoName;
    label: string;
    pts: number;
    max: number;
    note: string;
    color: string;
    heuristic?: boolean;
  }[] = [
    {
      icon: "finance",
      label: "Profit",
      pts: profitPts(netProfit),
      max: 40,
      note: `$${Math.round(netProfit).toLocaleString()} net`,
      color: "var(--green)",
    },
    {
      icon: "trending-up",
      label: "Return",
      pts: roiPts(roi),
      max: 30,
      note: `${Math.round(roi)}% ROI`,
      color: "var(--green)",
    },
    {
      icon: "clock",
      label: "Speed to flip",
      pts: breakdown?.speedScore ?? 0,
      max: 15,
      note: "est. days to sell",
      color: "var(--amber)",
    },
    {
      icon: "shield",
      label: "Risk",
      pts: breakdown?.riskScore ?? 0,
      max: 15,
      note: "repair · transport · title",
      color: "var(--blue)",
    },
    {
      icon: "scan",
      label: "Market signal",
      pts: market,
      max: 30,
      note: "demand heuristic",
      color: "var(--purple)",
      heuristic: true,
    },
  ];

  return (
    <div className="w-full mt-3 text-left">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--t4)] mb-2.5">
        Why this score
      </p>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5">
            <span
              className="grid place-items-center w-6 h-6 rounded-[7px] shrink-0"
              style={{ background: "var(--s2)", color: r.color }}
              aria-hidden
            >
              <Ico name={r.icon} size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-[var(--t2)]">
                  {r.label}
                  {r.heuristic && (
                    <span className="ml-1 text-[9px] font-bold uppercase tracking-wide text-[var(--t5)]">
                      heuristic
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-mono text-[var(--t4)] shrink-0">
                  {r.pts}
                  <span className="text-[var(--t5)]">/{r.max}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--s2)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.max(3, Math.min(100, (r.pts / r.max) * 100))}%`,
                    background: r.color,
                  }}
                />
              </div>
              <span className="text-[10px] text-[var(--t5)]">{r.note}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-[var(--t5)]">
        Profit &amp; return are recomputed from this deal&apos;s live numbers.
        Market signal is a demand heuristic (make/model + season), not live
        market data.
      </p>
    </div>
  );
}
