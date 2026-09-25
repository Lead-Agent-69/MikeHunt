import type { Prediction } from "@/lib/intelligence/predict";

// The PREDICTIVE card — the engine's forward-looking read on a deal: how fast it'll move, whether the
// seller's likely to cut, whether to act now, and the return at the actionable price. All derived, all
// explainable (each stat is backed by the model's own reasons).

const URGENCY: Record<
  string,
  { label: string; color: string; icon: string } | null
> = {
  act_now: { label: "ACT NOW", color: "var(--red)", icon: "🔥" },
  soon: { label: "MOVE SOON", color: "var(--amber)", icon: "⚡" },
  watch: { label: "WATCH", color: "var(--t3)", icon: "👀" },
  none: null,
};

const VELOCITY: Record<string, { label: string; color: string }> = {
  fast: { label: "Fast market", color: "var(--green)" },
  normal: { label: "Normal pace", color: "var(--t2)" },
  slow: { label: "Slow market", color: "var(--amber)" },
  unknown: { label: "Pace unknown", color: "var(--t4)" },
};

function Stat({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-black/30 p-3">
      <div
        className="text-lg font-bold"
        style={{ color: color ?? "var(--t1)" }}
      >
        {icon} {value}
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
  const { daysToSell, velocity, priceDropChance, urgency, projectedRoiPct } =
    prediction;
  const u = URGENCY[urgency] ?? null;
  const vel = VELOCITY[velocity] ?? VELOCITY.unknown;
  const dropPct =
    priceDropChance != null ? Math.round(priceDropChance * 100) : null;

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-[var(--t2)]">
          🔮 Forecast
        </h3>
        {u && (
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{
              color: u.color,
              background: "color-mix(in srgb, var(--bg) 60%, transparent)",
              border: `1px solid ${u.color}`,
            }}
          >
            {u.icon} {u.label}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat
          icon="⏱"
          value={daysToSell != null ? `~${daysToSell}d` : "—"}
          label={vel.label}
          color={vel.color}
        />
        <Stat
          icon="📉"
          value={dropPct != null ? `${dropPct}%` : "—"}
          label="price-drop odds (2wk)"
          color={
            dropPct != null && dropPct >= 50 ? "var(--amber)" : "var(--t1)"
          }
        />
        <Stat
          icon="📈"
          value={projectedRoiPct != null ? `${projectedRoiPct}%` : "—"}
          label="projected ROI"
          color={
            projectedRoiPct != null && projectedRoiPct > 0
              ? "var(--green)"
              : "var(--t1)"
          }
        />
      </div>

      {prediction.reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {prediction.reasons.map((r, i) => (
            <li key={i} className="text-xs text-[var(--t3)]">
              • {r}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
