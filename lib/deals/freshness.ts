/**
 * Deal freshness: is this listing live inventory, or a frozen / stale / ended snapshot?
 *
 * Public API (stable, shared with lib/arbitrage): dealFreshness(row), isFrozenDeal(row),
 * isLiveDeal(row), sortLiveFirst(rows, stateOf), and the `freshness` field that every deal mapper
 * attaches via freshnessFields(row).
 *
 * eli's 2026-10-09 audit: 1,757 of 3,879 active rows (45%) were imports from sources whose terms
 * ban automated access (copart, govdeals, publicsurplus). Nothing refreshes them, yet APIs and cards
 * presented them as live (an 8-day-old Copart bid was called "a current auction price").
 *
 * States:
 * - "ended":  the auction end time has passed; the price shown is not purchasable.
 * - "frozen": a terms-gated source (TOS_RESTRICTED_SOURCES) that has not been re-observed within
 *             FROZEN_GRACE_HOURS. Without an operator opt-in nothing will refresh it.
 * - "stale":  any other source not re-observed within STALE_AFTER_HOURS.
 * - "live":   re-observed recently by a source we actually run.
 *
 * Frozen/stale/ended rows stay visible but labeled ("Last updated 8d ago, not live") and rank after
 * live rows. Client-safe: no node imports.
 */
import { TOS_RESTRICTED_SOURCES } from "@/lib/scrapers/terms-restricted";
import { sourceFromUrl } from "@/lib/sources/source-meta";
import { urlHostMatches } from "@/lib/net/host-match";

export const STALE_AFTER_HOURS = 72;
/** A gated source re-seen within this window means an operator opt-in is refreshing it. */
export const FROZEN_GRACE_HOURS = 24;

export type FreshnessState = "live" | "stale" | "frozen" | "ended";

export type DealFreshness = {
  state: FreshnessState;
  live: boolean;
  /** Last time a scraper re-observed this row (deals.last_seen_at). */
  lastUpdatedAt: string | null;
  ageHours: number | null;
  /** Terms-gated source id when the row comes from one (copart, govdeals, ...). */
  gatedSource: string | null;
  /** Buyer-facing label. Empty for live rows (cards keep their normal freshness line). */
  label: string;
};

export type FreshnessInput = {
  source?: string | null;
  sourceUrl?: string | null;
  source_url?: string | null;
  lastSeenAt?: string | Date | null;
  last_seen_at?: string | Date | null;
  auctionEndAt?: string | Date | null;
  auction_end_at?: string | Date | null;
  auction_end?: string | Date | null;
};

const HOUR = 3_600_000;

function toMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  const ms =
    value instanceof Date ? value.getTime() : new Date(value as any).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function agoText(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The terms-gated source behind a row, by DB source or source URL (gov_auction is shared). */
export function gatedSourceForRow(input: FreshnessInput): string | null {
  const source = String(input.source || "")
    .trim()
    .toLowerCase();
  if (source && TOS_RESTRICTED_SOURCES[source]) return source;
  const fromUrl = sourceFromUrl(input.sourceUrl ?? input.source_url ?? null);
  if (fromUrl && TOS_RESTRICTED_SOURCES[fromUrl]) return fromUrl;
  if (
    urlHostMatches(input.sourceUrl ?? input.source_url ?? null, ["copart.com"])
  )
    return "copart";
  return null;
}

export function dealFreshness(
  input: FreshnessInput,
  now: number = Date.now(),
): DealFreshness {
  const lastMs = toMs(input.lastSeenAt ?? input.last_seen_at);
  const endMs = toMs(
    input.auctionEndAt ?? input.auction_end_at ?? input.auction_end,
  );
  const ageHours = lastMs == null ? null : Math.max(0, (now - lastMs) / HOUR);
  const gatedSource = gatedSourceForRow(input);
  const lastUpdatedAt = lastMs == null ? null : new Date(lastMs).toISOString();
  const updated =
    ageHours == null
      ? "Last update unknown"
      : `Last updated ${agoText(ageHours)}`;

  let state: FreshnessState = "live";
  if (endMs != null && endMs < now) state = "ended";
  else if (gatedSource && (ageHours == null || ageHours > FROZEN_GRACE_HOURS))
    state = "frozen";
  else if (ageHours == null || ageHours > STALE_AFTER_HOURS) state = "stale";

  const label =
    state === "live"
      ? ""
      : state === "ended"
        ? `Auction ended ${agoText(Math.max(0, (now - (endMs as number)) / HOUR))}, not live`
        : `${updated}, not live`;

  return {
    state,
    live: state === "live",
    lastUpdatedAt,
    ageHours: ageHours == null ? null : Math.round(ageHours),
    gatedSource,
    label,
  };
}

const RANK: Record<FreshnessState, number> = {
  live: 0,
  stale: 1,
  frozen: 2,
  ended: 3,
};

export function freshnessRank(
  state: FreshnessState | undefined | null,
): number {
  return state ? (RANK[state] ?? 0) : 0;
}

/** Stable: live rows first, then stale, frozen, ended — original order kept within each tier. */
export function sortLiveFirst<T>(
  rows: readonly T[],
  stateOf: (row: T) => FreshnessState | undefined | null,
): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: freshnessRank(stateOf(row)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.row);
}

/** Fields every deal mapper attaches so cards never need a second lookup. */
export function freshnessFields(
  input: FreshnessInput,
  now: number = Date.now(),
) {
  const liveness = dealFreshness(input, now);
  return {
    freshness: liveness,
    stale: !liveness.live,
    lastUpdatedAt: liveness.lastUpdatedAt,
  };
}

/**
 * Terms-gated source that nothing refreshes (copart / govdeals / publicsurplus imports, ...).
 * Its price is the last recorded snapshot. Arbitrage and recommendations should not treat it as a
 * current price. Accepts mapped deals (camelCase) or raw DB rows (snake_case).
 */
export function isFrozenDeal(row: FreshnessInput, now: number = Date.now()) {
  return dealFreshness(row, now).state === "frozen";
}

/** Live inventory: re-observed recently by a source we run, and not an ended auction. */
export function isLiveDeal(row: FreshnessInput, now: number = Date.now()) {
  return dealFreshness(row, now).live;
}
