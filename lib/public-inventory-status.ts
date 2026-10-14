import { applyCustomerInventory } from "@/lib/search/customer-inventory";

/** Headline reads only. Never scan listing payloads or run valuation diagnostics for public traffic. */
export async function publicInventoryStatus(sb: any, now = Date.now()) {
  const signal = AbortSignal.timeout(4000);
  const countActive = () =>
    sb
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
  const [active, fresh, added, newest] = await Promise.all([
    countActive().abortSignal(signal),
    applyCustomerInventory(countActive(), now).abortSignal(signal),
    countActive()
      .gt("created_at", new Date(now - 86400000).toISOString())
      .abortSignal(signal),
    sb
      .from("deals")
      .select("last_seen_at")
      .eq("active", true)
      .lte("last_seen_at", new Date(now).toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .abortSignal(signal),
  ]);
  for (const result of [active, fresh, added, newest])
    if (result.error) throw new Error("Inventory status unavailable");
  for (const result of [active, fresh, added])
    if (!Number.isSafeInteger(result.count) || result.count < 0)
      throw new Error("Inventory count not confirmed");
  const stamp = Date.parse(newest.data?.[0]?.last_seen_at || "");
  return {
    activeDeals: active.count,
    buyerReady: fresh.count > 0,
    // This lightweight check cannot certify valuation readiness or source coverage.
    decisionReady: false,
    freshPhotoListings: fresh.count,
    sourceHealth: { activeDeals: active.count, readySources: null },
    freshness: {
      activeDeals: active.count,
      newLast24h: added.count,
      newestAgeHours: Number.isFinite(stamp)
        ? Math.max(0, (now - stamp) / 3600000)
        : null,
      stale: fresh.count === 0,
    },
    quality: { goDeals: null, watchCandidates: null },
    coverage: "inventory_only",
    checkedAt: new Date(now).toISOString(),
  };
}
