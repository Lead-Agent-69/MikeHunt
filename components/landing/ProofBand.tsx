"use client";

import useSWR from "swr";
import { useEffect, useRef, useState } from "react";

// The landing "proof in numbers" band — real live figures (count-up animated) that back the headline with
// evidence instead of adjectives. Data from /api/stats/proof; degrades to a quiet dash if it hasn't landed.

const fetcher = (u: string) => fetch(u).then((r) => r.json());

function useCountUp(target: number, run: boolean, ms = 1300) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!run || started.current || !target) return;
    started.current = true;
    let raf = 0;
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setV(Math.round(target * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

function Stat({
  value,
  label,
  prefix = "",
  run,
  highlight = false,
}: {
  value: number;
  label: string;
  prefix?: string;
  run: boolean;
  highlight?: boolean;
}) {
  const n = useCountUp(value, run);
  return (
    <div className="flex flex-col items-center text-center px-2">
      <span
        className="text-[1.7rem] md:text-[2.6rem] font-black tabular-nums leading-none tracking-tight"
        style={
          highlight
            ? {
                background: "var(--grad)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }
            : { color: "var(--t1)" }
        }
      >
        {value ? `${prefix}${n.toLocaleString()}` : "—"}
      </span>
      <span className="mt-2 text-[11px] md:text-xs font-bold uppercase tracking-wider text-[var(--t4)] max-w-[120px]">
        {label}
      </span>
    </div>
  );
}

export function ProofBand() {
  const { data } = useSWR("/api/stats/proof", fetcher, {
    revalidateOnFocus: false,
  });
  const run = !!data;

  return (
    <div className="w-full max-w-5xl mx-auto px-6">
      <div className="glass-panel px-6 py-8 md:py-10">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t4)] mb-7">
          Working the whole market, right now
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-y-8 gap-x-3">
          <Stat value={data?.carsScored ?? 0} label="cars priced" run={run} />
          <Stat
            value={data?.avgSpread ?? 0}
            prefix="$"
            label="avg profit per BUY"
            run={run}
            highlight
          />
          <Stat value={data?.carsBuy ?? 0} label="BUY deals live" run={run} />
          <Stat
            value={data?.totalSpread ?? 0}
            prefix="$"
            label="total profit on the board"
            run={run}
          />
          <Stat value={data?.states ?? 0} label="states covered" run={run} />
        </div>
      </div>
    </div>
  );
}
