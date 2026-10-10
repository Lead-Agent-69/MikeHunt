"use client";

import Link from "next/link";
import useSWR from "swr";
import { RotateCcw } from "lucide-react";
import { DiscoveryCard } from "./DiscoveryCard";
import { loadPriceOpportunities } from "@/lib/discovery/price-opportunities";

export function FlashRail({ state }: { state?: string }) {
  const params = new URLSearchParams();
  if (state) params.set("state", state);
  const query = params.toString();
  const { data, error, isLoading, mutate } = useSWR(
    `/api/flash-deals${query ? `?${query}` : ""}`,
    loadPriceOpportunities,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  if (!error && !isLoading && data?.deals.length === 0) return null;
  return (
    <section aria-label="Price opportunities" className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--t1)]">
          Price opportunities
        </h2>
        <Link
          href={`/flash-deals${query ? `?${query}` : ""}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)]"
        >
          View all opportunities
        </Link>
      </header>
      <p className="text-xs text-[var(--t3)]">
        Recently observed asking prices below a market estimate. Verify
        condition, costs and availability.
      </p>
      {error ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm">
            Price opportunities are unavailable, not confirmed empty.
          </p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Retry opportunities
          </button>
        </div>
      ) : isLoading && !data ? (
        <p role="status" className="text-sm">
          Loading price opportunities...
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {data?.deals.map((deal) => (
            <div key={deal.id} className="w-[280px] shrink-0">
              <DiscoveryCard deal={deal} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
