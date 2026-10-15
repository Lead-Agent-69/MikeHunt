"use client";

import useSWR from "swr";
import { useDealerWatch } from "@/hooks/useDealerWatch";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import type {
  DiscoverResponse,
  DiscoveryDeal,
} from "@/components/discovery/types";
import { RefreshCw } from "lucide-react";

// Watched shops are a discovery rail, not a scan proof board. Rows come from
// /api/discover?dealerSourceIds= and render as DiscoveryCards.
const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data?.error || data?.degraded)
    throw new Error("Watched listings unavailable");
  if (!data || !Array.isArray(data.rails))
    throw new Error("Watched listings unavailable");
  return data as DiscoverResponse;
};

export function WatchedDealerFeed() {
  const watch = useDealerWatch();
  // prefs.watchedDealerSourceIds (server-side), plus ids derived from watched hosts.
  const sourceIds = watch.sourceIds;
  const key = sourceIds.length
    ? `/api/discover?dealerSourceIds=${encodeURIComponent(sourceIds.join(","))}`
    : null;
  const { data, error, isLoading, mutate } = useSWR<DiscoverResponse>(
    key,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );

  if (!watch.hosts.length) return null;

  const deals: DiscoveryDeal[] = [];
  const seen = new Set<string>();
  for (const rail of data?.rails || []) {
    for (const deal of rail.deals || []) {
      if (!deal?.id || seen.has(deal.id)) continue;
      seen.add(deal.id);
      deals.push(deal);
    }
  }

  return (
    <section className="min-w-0">
      <div className="mb-2">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
          Dealer watch
        </p>
        <h2 className="text-sm font-black text-[var(--t1)]">
          New from your watched dealers{" "}
          <span className="text-[var(--t4)] font-bold">
            · {watch.hosts.length} shop{watch.hosts.length > 1 ? "s" : ""}
          </span>
        </h2>
      </div>
      {sourceIds.length > 0 && error && (
        <div role="alert" className="mb-3 text-xs text-[var(--t3)]">
          <p>
            We couldn't load your watched dealers. Your saved shops haven't
            changed.
          </p>
          <button
            type="button"
            onClick={() => void mutate().catch(() => {})}
            className="mt-1 inline-flex min-h-11 items-center gap-2 text-[var(--blue)] font-semibold"
            aria-label="Retry watched dealer listings"
          >
            <RefreshCw size={14} aria-hidden="true" /> Try again
          </button>
        </div>
      )}
      {!sourceIds.length ? (
        <p className="text-xs leading-relaxed text-[var(--t4)]">
          These shops are not on the discovery dealer list yet.
        </p>
      ) : !data && isLoading ? (
        <p role="status" className="text-xs leading-relaxed text-[var(--t4)]">
          Checking your watched dealers...
        </p>
      ) : !deals.length && !error ? (
        <p className="text-xs leading-relaxed text-[var(--t4)]">
          {data?.configured === false
            ? "Dealer inventory isn't available yet. Your watched shops are saved."
            : "No recent matching vehicles to show. Open a watched shop below to review its listings."}
        </p>
      ) : deals.length > 0 ? (
        <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {deals.map((deal) => (
            <DiscoveryCard key={deal.id} deal={deal} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
