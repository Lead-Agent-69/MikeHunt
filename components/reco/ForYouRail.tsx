"use client";

import React from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { fetchForYou } from "@/lib/reco/client";
import { forYouCards, forYouHonestyMessage } from "./for-you";
import type { DiscoveryDeal } from "@/components/discovery/types";

const loadForYou = ([, , ids]: [string, string, string]) =>
  fetchForYou(12, ids.split(",").filter(Boolean));

/**
 * "For You" on Discover, ranked by /api/reco/for-you from the user's own view signals.
 * Shows cards when personalized; soft one-line honesty when signed-in cold-start or
 * signalsAvailable:false; retry on service errors, hidden for guests. Non-flip desks never see
 * profit or max-bid (forYouCards redacts).
 */
export function ForYouRail({
  flipDesk,
  eligibleDeals,
}: {
  flipDesk: boolean;
  eligibleDeals: DiscoveryDeal[];
}) {
  const { dealerId } = useDealerId();
  const ids = Array.from(new Set(eligibleDeals.map((deal) => deal.id)))
    .slice(0, 120)
    .join(",");
  const { data, error, mutate } = useSWR(
    dealerId && ids ? ["/api/reco/for-you", dealerId, ids] : null,
    loadForYou,
    {
      revalidateOnFocus: true,
      dedupingInterval: 60_000,
      shouldRetryOnError: false,
    },
  );

  if (error)
    return (
      <section
        aria-label="For You"
        className="flex items-center justify-between gap-3 px-1"
        role="status"
      >
        <p className="text-sm text-[var(--t4)]">
          Recommendations are temporarily unavailable.
        </p>
        <button
          type="button"
          title="Retry recommendations"
          aria-label="Retry recommendations"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--b1)]"
          onClick={() => void mutate()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </section>
    );

  const cards = forYouCards(data, flipDesk, eligibleDeals);
  if (cards.length > 0) {
    return (
      <section
        className="space-y-3"
        aria-labelledby="for-you-title"
        data-testid="for-you-rail"
      >
        <div className="px-1">
          <h2
            id="for-you-title"
            className="text-lg font-bold leading-tight text-[var(--t1)]"
          >
            From your activity
          </h2>
          <p className="mt-0.5 text-xs text-[var(--t4)]">
            Based on listings you opened, saved or spent time on.
          </p>
        </div>
        <div
          role="region"
          aria-label="For You vehicles"
          tabIndex={0}
          className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6"
          style={{
            scrollSnapType: "x mandatory",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {cards.map((deal) => (
            <DiscoveryCard key={`for-you-${deal.id}`} deal={deal} />
          ))}
        </div>
      </section>
    );
  }

  const honesty = forYouHonestyMessage(data ?? undefined);
  if (!honesty) return null;

  return (
    <section
      className="space-y-1 px-1"
      aria-labelledby="for-you-title"
      data-testid="for-you-rail-empty"
    >
      <h2
        id="for-you-title"
        className="text-lg font-bold leading-tight text-[var(--t1)]"
      >
        From your activity
      </h2>
      <p className="text-xs text-[var(--t4)]">{honesty}</p>
    </section>
  );
}
