"use client";

import useSWR from "swr";

// Small live-count chip for the public landing — real numbers from the public stats endpoint, so the
// marketing page feels alive. Degrades to a dash if the fetch hasn't landed.

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function LiveCount() {
  const { data } = useSWR("/api/stats/verticals", fetcher, {
    revalidateOnFocus: false,
  });
  const n = data?.cars?.go ?? null;
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-lg font-black tabular-nums text-[var(--t1)]">
        {n != null ? n.toLocaleString() : "—"}
      </span>
      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--t4)]">
        BUY deals live now
      </span>
    </span>
  );
}
