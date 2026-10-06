"use client";

import React from "react";
import useSWR from "swr";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import { forYouCards, type ForYouResponse } from "./for-you";

// lib/reco/client.ts has no reader for GET /api/reco/for-you yet, so this one GET lives here.
// Any error (401, 5xx, network) resolves to null and the rail stays hidden.
const fetchForYou = async (url: string): Promise<ForYouResponse | null> => {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    return res.ok ? ((await res.json()) as ForYouResponse) : null;
  } catch {
    return null;
  }
};

/**
 * "For You" on Discover, ranked by /api/reco/for-you from the user's own view signals. Hidden
 * entirely when empty, on any error, or when the backend isn't personalizing (no signals yet or
 * the deal_signals table missing). Non-flip desks never see profit or max-bid.
 */
export function ForYouRail({ flipDesk }: { flipDesk: boolean }) {
  const { data } = useSWR("/api/reco/for-you?limit=12", fetchForYou, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
    shouldRetryOnError: false,
  });
  const cards = forYouCards(data, flipDesk);
  if (cards.length === 0) return null;

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
