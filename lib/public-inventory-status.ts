import type { createServerComponentClient } from "@/lib/supabase";
import { buildRealDataReadiness } from "@/lib/real-data-readiness";
import { applyCustomerInventory } from "@/lib/search/customer-inventory";

/** Public headline proof needs counts, never listing payloads or valuation backtests. */
export async function publicInventoryStatus(
  sb: ReturnType<typeof createServerComponentClient>,
) {
  const signal = AbortSignal.timeout(8000);
  const activeQuery = () =>
    sb
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
  const count = async (query: ReturnType<typeof activeQuery>) => {
    const result = await query.abortSignal(signal);
    if (result.error || result.count == null)
      throw new Error("Inventory status unavailable");
    return result.count;
  };
  const since24 = new Date(Date.now() - 86400_000).toISOString();
  const [
    active,
    new24,
    photos,
    links,
    prices,
    titles,
    damage,
    go,
    watch,
    sold,
    newest,
  ] = await Promise.all([
    count(activeQuery()),
    count(activeQuery().gt("created_at", since24)),
    count(applyCustomerInventory(activeQuery())),
    count(activeQuery().not("source_url", "is", null).neq("source_url", "")),
    count(activeQuery().gt("ask_price", 0)),
    count(activeQuery().not("title", "is", null).neq("title", "")),
    count(activeQuery().or("condition.not.is.null,damage_type.not.is.null")),
    count(activeQuery().eq("deal_verdict", "go")),
    count(
      activeQuery()
        .gte("ask_price", 3000)
        .gt("sell_estimate", 0)
        .not("true_net_profit", "is", null)
        .lt("true_net_profit", 0),
    ),
    count(
      sb.from("sold_listings").select("id", { count: "exact", head: true }),
    ),
    sb
      .from("deals")
      .select("last_seen_at")
      .eq("active", true)
      .not("last_seen_at", "is", null)
      .lte("last_seen_at", new Date().toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .abortSignal(signal)
      .maybeSingle()
      .then((result) => {
        if (result.error) throw new Error("Inventory status unavailable");
        return result.data?.last_seen_at ?? null;
      }),
  ]);
  const age = newest
    ? (Date.now() - new Date(newest).getTime()) / 3600_000
    : null;
  const newestAgeHours =
    age != null && Number.isFinite(age) ? Math.max(0, Math.round(age)) : null;
  const pct = (value: number) => (active ? (value / active) * 100 : 0);
  const realData = buildRealDataReadiness({
    activeDeals: active,
    newLast24h: new24,
    newestAgeHours,
    photoPct: pct(photos),
    sourceLinkPct: pct(links),
    pricePct: pct(prices),
    titlePct: pct(titles),
    damagePct: pct(damage),
    sellerPct: pct(links),
    mileagePct: 0,
    vinPct: 0,
    sellerContactPct: 0,
    auctionDatePct: 0,
    decisionReady: go > 0 && sold > 0,
  });
  return {
    activeDeals: active,
    buyerReady: realData.buyerReady,
    decisionReady: realData.decisionReady,
    // A source total needs a separate aggregate. Unknown is not zero or a sampled total.
    sourceHealth: { readySources: null, activeDeals: active },
    freshness: {
      activeDeals: active,
      newLast24h: new24,
      newestAgeHours,
      stale: newestAgeHours == null || newestAgeHours > 24,
    },
    quality: { goDeals: go, watchCandidates: watch },
  };
}
