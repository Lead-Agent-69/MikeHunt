"use client";

import React from "react";
import useSWR from "swr";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { fetchForYou } from "@/lib/reco/client";
import { forYouCards, forYouHonestyMessage } from "./for-you";
import type { DiscoveryDeal } from "@/components/discovery/types";

const loadForYou = (url: string) => {
  const m = /[?&]limit=(\d+)/.exec(url);
  return fetchForYou(m ? Number(m[1]) : 12);
};

/**
 * "For You" on Discover, ranked by /api/reco/for-you from the user's own view signals.
 * Shows cards when personalized; soft one-line honesty when signed-in cold-start or
 * signalsAvailable:false; hidden on network/unsigned error. Non-flip desks never see
 * profit or max-bid (forYouCards redacts).
 */
export function ForYouRail({
  flipDesk,
  eligibleDeals,
}: {
  flipDesk: boolean;
  eligibleDeals: DiscoveryDeal[];
}) {
  const { data, error } = useSWR("/api/reco/for-you?limit=12", loadForYou, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    shouldRetryOnError: false,
  });

  if (error) return null;

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
            For You
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
        For You
      </h2>
      <p className="text-xs text-[var(--t4)]">{honesty}</p>
    </section>
  );
}
