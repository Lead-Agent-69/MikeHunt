/** Keep different collections, but don't repeat an identical set of vehicles. */
export function distinctDiscoveryRails<
  T extends { deals: Array<{ id: string }> },
>(rails: T[]): T[] {
  const seen = new Set<string>();
  return rails.filter((rail) => {
    const ids = Array.from(new Set(rail.deals.map((deal) => deal.id))).sort();
    if (ids.length === 0) return false;
    const signature = JSON.stringify(ids);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}
