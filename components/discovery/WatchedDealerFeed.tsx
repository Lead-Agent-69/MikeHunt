"use client";

import useSWR from "swr";
import { useDealerWatch } from "@/hooks/useDealerWatch";
import { dealerSourceIdForHost } from "@/lib/sources/source-meta";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import type {
  DiscoverResponse,
  DiscoveryDeal,
} from "@/components/discovery/types";

// Watched shops are a discovery rail, not a scan proof board. Rows come from
// /api/discover?dealerSourceIds= and render as DiscoveryCards.
const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function WatchedDealerFeed() {
  const watch = useDealerWatch();
  const sourceIds = Array.from(
    new Set(
      watch.hosts
        .map((host) => dealerSourceIdForHost(host))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const key = sourceIds.length
    ? `/api/discover?dealerSourceIds=${encodeURIComponent(sourceIds.join(","))}`
    : null;
  const { data } = useSWR<DiscoverResponse>(key, fetcher, {
    revalidateOnFocus: false,
  });

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
      {!sourceIds.length ? (
        <p className="text-xs leading-relaxed text-[var(--t4)]">
          These shops are not on the discovery dealer list yet.
        </p>
      ) : !deals.length ? (
        <p className="text-xs leading-relaxed text-[var(--t4)]">
          No discovery cards for these shops yet.
        </p>
      ) : (
        <div className="scrollbar-hide -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {deals.map((deal) => (
            <DiscoveryCard key={deal.id} deal={deal} />
          ))}
        </div>
      )}
    </section>
  );
}
