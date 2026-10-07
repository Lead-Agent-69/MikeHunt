"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Zap } from "lucide-react";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import type { DiscoveryDeal } from "@/components/discovery/types";

interface FlashDeal extends DiscoveryDeal {
  secondsRemaining: number | null;
  belowMarketPct: number | null;
}

interface FlashResponse {
  deals: FlashDeal[];
  count: number;
  state: string;
  deskAccess?: string;
  configured?: boolean;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load flash deals");
    return res.json() as Promise<FlashResponse>;
  });

/**
 * Flash Deals page — client-fetches /api/flash-deals (desk-redacts via listingsForDesk).
 * Honest copy: fresh-to-us listings from saved inventory. No fake urgency/timer, no DealCard
 * invent ("Act fast", profit score gates). Guest/personal never see profit/max-bid from the API.
 */
export default function FlashDealsPage() {
  const { data, error, isLoading, mutate } = useSWR<FlashResponse>(
    "/api/flash-deals?limit=48",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--t1)] flex items-center gap-2">
            <Zap className="text-yellow-500 fill-yellow-500/20" size={28} />
            Flash Deals
          </h1>
          <p className="text-[var(--t2)] mt-2 max-w-2xl">
            Fresh-to-us listings from saved inventory — recently seen and priced
            below a real market estimate. No countdown; availability can change.
          </p>
        </div>
        <Link
          href="/discover"
          className="text-sm font-bold text-[var(--t3)] hover:text-[var(--t1)] underline underline-offset-2"
        >
          Back to Discover
        </Link>
      </header>

      {error ? (
        <ErrorState
          compact
          title="We couldn't load flash deals"
          message="Check your connection and try again."
          onRetry={() => void mutate()}
          retryLabel="Try again"
        />
      ) : isLoading && !data ? (
        <p className="text-sm text-[var(--t4)] px-1">Loading flash deals…</p>
      ) : data && data.deals.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.deals.map((deal) => (
            <DiscoveryCard key={`flash-page-${deal.id}`} deal={deal} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="search"
          title="No flash deals right now"
          message="No flash deals in saved inventory right now."
          action={{
            label: "Back to Discover",
            href: "/discover",
          }}
        />
      )}
    </div>
  );
}
