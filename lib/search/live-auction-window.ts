/** Unknown closing times remain eligible; known-ended auctions are not buying opportunities. */
export function isWithinAuctionWindow(
  row: { auction_end_at?: string | null },
  now = Date.now(),
) {
  if (!row.auction_end_at) return true;
  const endsAt = Date.parse(row.auction_end_at);
  return !Number.isFinite(endsAt) || endsAt > now;
}

export function applyLiveAuctionWindow<T extends { or: (filter: string) => T }>(
  query: T,
  now = Date.now(),
): T {
  return query.or(
    `auction_end_at.is.null,auction_end_at.gt.${new Date(now).toISOString()}`,
  );
}
