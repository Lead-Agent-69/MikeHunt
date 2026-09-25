"use client";

import useSWR from "swr";
import Link from "next/link";
import { useDealerWatch } from "@/hooks/useDealerWatch";
import { proxiedImage } from "@/lib/image-url";

// The payoff of the dealer watchlist: newest listings across every shop you watch, so you catch their fresh
// cars the moment they post — with the accurate title status + our resale, right here. Hides when empty.

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n?: number | null) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : "—";

const TITLE_COLOR: Record<string, string> = {
  clean_title: "var(--green)",
  clean: "var(--green)",
  rebuilt_title: "var(--amber)",
  repairable: "var(--amber)",
  run_drive: "var(--amber)",
  salvage_title: "var(--red)",
  parts_only: "var(--t4)",
  flood: "var(--blue)",
  fire: "var(--red)",
  hail: "var(--amber)",
};
const TITLE_LABEL: Record<string, string> = {
  clean_title: "Clean",
  clean: "Clean",
  rebuilt_title: "Rebuilt",
  repairable: "Repairable",
  run_drive: "Runs",
  salvage_title: "Salvage",
  parts_only: "Parts",
  flood: "Flood",
  fire: "Fire",
  hail: "Hail",
};

export function WatchedDealerFeed() {
  const watch = useDealerWatch();
  const key = watch.hosts.length
    ? `/api/scan?dealers=${encodeURIComponent(watch.hosts.join(","))}&limit=30`
    : null;
  const { data } = useSWR(key, fetcher, { revalidateOnFocus: false });

  if (!watch.hosts.length) return null;
  const cars = ((data?.vehicles || []) as any[])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.firstSeenAt || 0).getTime() -
        new Date(a.firstSeenAt || 0).getTime(),
    )
    .slice(0, 20);
  if (!cars.length) return null;

  return (
    <section className="min-w-0">
      <h2 className="text-sm font-black text-[var(--t1)] mb-2">
        ⭐ New from your watched dealers{" "}
        <span className="text-[var(--t4)] font-bold">
          · {watch.hosts.length} shop{watch.hosts.length > 1 ? "s" : ""}
        </span>
      </h2>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {cars.map((c) => {
          const img =
            Array.isArray(c.images) && c.images[0]?.startsWith?.("http")
              ? proxiedImage(c.images[0])
              : null;
          return (
            <Link
              key={c.id}
              href={`/deal/${c.id}`}
              className="shrink-0 w-44 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] overflow-hidden hover:border-[var(--amber-bd)] transition-colors"
            >
              <div className="relative h-24 bg-[var(--s2)] grid place-items-center">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="opacity-30">🚗</span>
                )}
                {c.condition && TITLE_LABEL[c.condition] && (
                  <span
                    className="absolute bottom-1 left-1 text-[9px] font-black px-1 py-0.5 rounded text-white"
                    style={{ background: TITLE_COLOR[c.condition] }}
                  >
                    {TITLE_LABEL[c.condition]}
                  </span>
                )}
              </div>
              <div className="p-2">
                <div className="text-[12px] font-bold text-[var(--t1)] truncate">
                  {[c.year, c.make, c.model].filter(Boolean).join(" ")}
                </div>
                <div className="text-[11px] text-[var(--t4)]">
                  {money(c.askPrice)}
                  {c.sellEstimate != null && (
                    <span> · resale ~{money(c.sellEstimate)}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
