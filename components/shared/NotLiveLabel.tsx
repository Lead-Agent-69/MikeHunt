import React from "react";
import {
  dealFreshness,
  type DealFreshness,
  type FreshnessInput,
} from "@/lib/deals/freshness";

// Anything earlier is a null that a mapper turned into a Date (new Date(null) is 1970).
const EARLIEST_REAL_MS = Date.UTC(2000, 0, 1);

function realTime(value: unknown): string | Date | null {
  if (value == null || value === "") return null;
  const ms =
    value instanceof Date ? value.getTime() : new Date(value as any).getTime();
  return Number.isFinite(ms) && ms >= EARLIEST_REAL_MS
    ? (value as string | Date)
    : null;
}

type NotLiveInput = FreshnessInput & { freshness?: DealFreshness | null };

/**
 * The "not live" label from lib/deals/freshness for a card, or "" when nothing should show.
 * Uses the API's `freshness` field when present, otherwise computes it from the row. Never
 * invents a time: with no real last-seen timestamp there is no label (an ended auction is the
 * exception, because that label comes from the real auction end time).
 */
export function notLiveLabel(deal: NotLiveInput | null | undefined): string {
  if (!deal) return "";
  const lastSeen = realTime(deal.lastSeenAt ?? deal.last_seen_at);
  const f =
    deal.freshness && typeof deal.freshness.label === "string"
      ? deal.freshness
      : dealFreshness({
          ...deal,
          lastSeenAt: lastSeen,
          last_seen_at: lastSeen,
          auctionEndAt: realTime(
            deal.auctionEndAt ?? deal.auction_end_at ?? deal.auction_end,
          ),
          auction_end_at: null,
          auction_end: null,
        });
  if (f.live || !f.label) return "";
  if (f.state === "ended") return f.label;
  if (!realTime(f.lastUpdatedAt)) return "";
  return f.label;
}

export function NotLiveLabel({
  deal,
  className = "",
}: {
  deal: NotLiveInput | null | undefined;
  className?: string;
}) {
  const label = notLiveLabel(deal);
  if (!label) return null;
  return (
    <span
      data-testid="not-live-label"
      className={`font-semibold text-[var(--amber-d)] ${className}`.trim()}
    >
      {label}
    </span>
  );
}
