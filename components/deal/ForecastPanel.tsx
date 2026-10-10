import type { Prediction } from "@/lib/intelligence/predict";
import {
  Binoculars,
  Clock3,
  Flame,
  TrendingDown,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";

// The PREDICTIVE card — the engine's forward-looking read on a deal: how fast it'll move, whether the
// seller's likely to cut, whether to act now, and the return at the actionable price. All derived, all
// explainable (each stat is backed by the model's own reasons).

const URGENCY: Record<
  string,
  { label: string; color: string; Icon: LucideIcon } | null
> = {
  act_now: { label: "Review candidate", color: "var(--t2)", Icon: Flame },
  soon: { label: "Review candidate", color: "var(--t2)", Icon: Zap },
  watch: { label: "Watch candidate", color: "var(--t3)", Icon: Binoculars },
  none: null,
};

const VELOCITY: Record<string, { label: string; color: string }> = {
  fast: { label: "Sparse supply", color: "var(--t2)" },
  normal: { label: "Moderate supply", color: "var(--t2)" },
  slow: { label: "Higher supply", color: "var(--t2)" },
  unknown: { label: "Unknown supply", color: "var(--t4)" },
};

function Stat({
  Icon,
  value,
  label,
  color,
}: {
  Icon: LucideIcon;
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 p-2">
      <div
        className="flex items-center gap-2 text-lg font-bold"
        style={{ color: color ?? "var(--t1)" }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--t4)]">
        {label}
      </div>
    </div>
  );
}

export function ForecastPanel({
  prediction,
}: {
  prediction?: Prediction | null;
}) {
  if (!prediction) return null;
  const { velocity, priceDropChance, urgency, projectedRoiPct } = prediction;
  const u = URGENCY[urgency] ?? null;
  const vel = VELOCITY[velocity] ?? VELOCITY.unknown;

  return (
    <section className="border-t border-[var(--b1)] py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-[var(--t2)]">
          Market signals
        </h3>
        {u && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
            style={{
              color: u.color,
              background: "color-mix(in srgb, var(--bg) 60%, transparent)",
              border: `1px solid ${u.color}`,
            }}
          >
            <u.Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {u.label}
          </span>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--t3)]">
        Rule-based estimates, not calibrated against completed sales. Listing
        coverage may be incomplete.
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          Icon={Clock3}
          value={vel.label}
          label="Listing supply signal"
          color={vel.color}
        />
        <Stat
          Icon={TrendingDown}
          value={
            priceDropChance == null
              ? "Unknown"
              : priceDropChance >= 0.5
                ? "Elevated"
                : "Lower"
          }
          label="Price pressure signal"
        />
        <Stat
          Icon={TrendingUp}
          value={projectedRoiPct != null ? `${projectedRoiPct}%` : "—"}
          label="Estimated ROI, not guaranteed"
          color={
            projectedRoiPct != null && projectedRoiPct > 0
              ? "var(--green)"
              : "var(--t1)"
          }
        />
      </div>
    </section>
  );
}
import React from "react";
