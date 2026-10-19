const DERIVED_OR_RECORD_FIELDS = new Set([
  "id",
  "created_at",
  "first_seen_at",
  "updated_at",
  "last_seen_at",
  "deal_analysis",
  "sell_estimate",
  "recommended_max_bid",
  "true_net_profit",
  "profit_score",
  "deal_verdict",
  "is_arbitrage_opportunity",
  "estimated_transport_cost",
  "estimated_repair_cost",
  "completeness",
]);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value ?? null;
}

/** Unknown fields and nested evidence remain significant; only known model outputs are excluded. */
export function sameSourceObservation(
  stored: Record<string, any>,
  incoming: Record<string, any>,
) {
  for (const key of [
    "source",
    "source_deal_id",
    "source_url",
    "ask_price",
    "images",
    "active",
  ])
    if (!Object.prototype.hasOwnProperty.call(incoming, key)) return false;
  const keys = Object.keys(incoming).filter(
    (key) => !DERIVED_OR_RECORD_FIELDS.has(key),
  );
  return keys.every(
    (key) =>
      JSON.stringify(canonical(stored[key])) ===
      JSON.stringify(canonical(incoming[key])),
  );
}

/** A buffered old payload is not a fresh source observation. Neither is a changed price or title. */
export function mayTouchDeferredObservation(
  stored: Record<string, any>,
  incoming: Record<string, any>,
  now = Date.now(),
) {
  const observed = Date.parse(incoming.last_seen_at);
  const priorSeen = Date.parse(stored.last_seen_at);
  const version = Date.parse(stored.updated_at);
  const price = Number(incoming.ask_price);
  return (
    incoming.active === true &&
    stored.active === true &&
    Number.isFinite(price) &&
    price > 0 &&
    Array.isArray(incoming.images) &&
    incoming.images.length > 0 &&
    typeof incoming.source_url === "string" &&
    /^https?:\/\//i.test(incoming.source_url) &&
    Number.isFinite(version) &&
    Number.isFinite(priorSeen) &&
    Number.isFinite(observed) &&
    observed >= priorSeen &&
    observed <= now + 60_000 &&
    now - observed <= 15 * 60_000 &&
    sameSourceObservation(stored, incoming)
  );
}
