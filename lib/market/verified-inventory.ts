import { applyBuyableInventory } from "@/lib/search/customer-inventory";
import {
  RECOMMENDATION_FIELDS,
  recommendationEvidence,
} from "@/lib/deals/recommendation-evidence";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import { exactVehicleModel, modelVariants } from "./comparison-sample";
import { titleCaseMake } from "@/lib/vehicle/canonical";
import { daysOnMarket } from "@/lib/intelligence/days-on-market";
import { cached } from "@/lib/cache";

export const validVehicleTerm = (v: string) =>
  new RegExp("^[\\p{L}\\p{N} .'-]{1,60}$", "u").test(v);
export async function verifiedInventory(
  db: any,
  filter?: { make: string; model: string },
) {
  if (
    filter &&
    (!validVehicleTerm(filter.make) || !validVehicleTerm(filter.model))
  )
    throw new Error("Invalid vehicle identity");
  const snapshot = await cached(
    `market:purchase-evidence:${JSON.stringify(filter || {})}`,
    60000,
    async () => {
      let query = applyBuyableInventory(
        db
          .from("deals")
          .select(
            `${RECOMMENDATION_FIELDS},fuel_type,drivetrain,transmission`,
            {
              count: "exact",
            },
          ),
      )
        .order("last_seen_at", { ascending: false })
        .order("id", { ascending: true })
        .limit(800);
      if (filter)
        query = query.ilike("make", titleCaseMake(filter.make)).or(
          modelVariants(filter.model)
            .map((v) => `model.ilike."${v}"`)
            .join(","),
        );
      const { data, error, count } = await query.abortSignal(
        AbortSignal.timeout(10000),
      );
      if (error || !Array.isArray(data))
        throw new Error("Inventory evidence unavailable");
      return { data, count, readAt: new Date().toISOString() };
    },
    undefined,
    { prefix: "market:purchase-evidence:", maxEntries: 24 },
  );
  const { data, count } = snapshot;
  const rows = data.filter(
    (r: any) => !filter || exactVehicleModel(r, filter.make, filter.model),
  );
  return {
    rows,
    ready: rows.filter((r: any) => recommendationEvidence(r).ready),
    sample: {
      sampled: rows.length,
      totalCandidates: count ?? null,
      truncated: count == null ? null : count > data.length,
      observedDays: 3,
      scope: "nationwide",
      source: "current_listing_evidence",
      evaluatedAt: new Date().toISOString(),
      readAt: snapshot.readAt,
      years: Array.from(
        new Set(rows.map((r: any) => r.year).filter(Boolean)),
      ).sort(),
    },
  };
}

export function verifiedPulse(rows: any[]) {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    if (!recommendationEvidence(row).ready) continue;
    const key = JSON.stringify([
      row.make,
      row.model,
      row.year,
      row.location_state,
    ]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return Array.from(groups.values()).map((group) => {
    const ages = group
      .map((r) => daysOnMarket(r.first_seen_at))
      .filter((n): n is number => n != null);
    return {
      make: group[0].make,
      model: group[0].model,
      year: group[0].year,
      state: group[0].location_state,
      goDeals: group.length,
      avgProfit: Math.round(
        group.reduce((sum, r) => sum + r.true_net_profit, 0) / group.length,
      ),
      avgDays: ages.length
        ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
        : null,
    };
  });
}

export function askingScatter(rows: any[]) {
  return rows.flatMap((row) => {
    const evidence = recommendationEvidence(row);
    const price = sourcePriceContext(row);
    return price.canCompareToAskingCurve &&
      evidence.title.category === "clean" &&
      !evidence.title.weak &&
      !evidence.title.unconfirmed
      ? [{ mileage: row.mileage, price: price.cashPrice! }]
      : [];
  });
}
