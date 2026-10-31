import { canonicalModel, titleCaseMake } from "@/lib/vehicle/canonical";
import { recommendationEvidence } from "@/lib/deals/recommendation-evidence";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import { daysOnMarket } from "@/lib/intelligence/days-on-market";
import { fitDepreciationCurve } from "@/lib/scoring/depreciation";

const modelKey = (model: string) =>
  canonicalModel(model)
    .toLowerCase()
    .replace(/[\s-]+/g, "");
export const makeKey = (make: string) => titleCaseMake(make).toLowerCase();
export function modelVariants(model: string) {
  const pickup = model.trim().match(/^f[ -]?(150|250|350|450|550)$/i);
  return pickup
    ? [`F-${pickup[1]}`, `F${pickup[1]}`, `F ${pickup[1]}`]
    : [canonicalModel(model)];
}
export function exactVehicleModel(
  row: any,
  make: string,
  model: string,
  year?: number,
) {
  return (
    makeKey(row.make || "") === makeKey(make) &&
    modelKey(row.model || "") === modelKey(model) &&
    (!year || row.year === year)
  );
}

/** Unknown characteristics are never pooled into a known-condition mileage model. */
export function comparisonSample(
  rows: any[],
  spec: { make: string; model: string; year?: number },
  total: number | null,
) {
  const matching = rows.filter((row) =>
    exactVehicleModel(row, spec.make, spec.model, spec.year),
  );
  const eligible = matching.filter((row) => {
    const evidence = recommendationEvidence(row);
    return (
      evidence.price.canCompareToAskingCurve &&
      evidence.title.category === "clean" &&
      !evidence.title.weak &&
      !evidence.title.unconfirmed
    );
  });
  const ready = eligible.filter((row) => recommendationEvidence(row).ready);
  const ages = eligible
    .map((row) => daysOnMarket(row.first_seen_at))
    .filter((n): n is number => n != null);
  const cohorts = new Map<string, any[]>();
  for (const row of eligible) {
    if (
      !row.year ||
      !row.trim ||
      !row.condition ||
      !row.fuel_type ||
      !row.drivetrain ||
      !row.transmission
    )
      continue;
    const key = JSON.stringify([
      row.year,
      row.trim,
      row.condition,
      row.fuel_type,
      row.drivetrain,
      row.transmission,
      row.location_state,
    ]);
    cohorts.set(key, [...(cohorts.get(key) || []), row]);
  }
  // A single coherent cohort is required; do not pick the most flattering subgroup.
  const homogeneous =
    cohorts.size === 1 &&
    Array.from(cohorts.values())[0].length === eligible.length;
  const fit = homogeneous
    ? fitDepreciationCurve(
        eligible.map((row) => ({
          mileage: row.mileage,
          price: sourcePriceContext(row).cashPrice!,
        })),
      )
    : null;
  return {
    make: spec.make,
    model: spec.model,
    year: spec.year || null,
    totalListings: matching.length,
    goDeals: ready.length,
    avgProfit: ready.length
      ? Math.round(
          ready.reduce((sum, row) => sum + row.true_net_profit, 0) /
            ready.length,
        )
      : null,
    avgDaysOnMarket: ages.length
      ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
      : null,
    depreciationPer1000Miles:
      fit && fit.slope < 0 ? fit.depreciationPer1000Miles : null,
    timingSignal: null,
    pctChange30d: null,
    sample: {
      status: ready.length ? "ok" : "insufficient_evidence",
      geography: "nationwide",
      observedDays: 3,
      lane: "reported_clean_retail",
      sampled: rows.length,
      matched: matching.length,
      eligible: eligible.length,
      decisionReady: ready.length,
      excludedIdentity: rows.length - matching.length,
      excludedPriceOrCondition: matching.length - eligible.length,
      totalCandidates: total,
      truncated: total == null ? null : total > rows.length,
      years: Array.from(
        new Set(matching.map((row) => row.year).filter(Boolean)),
      ).sort(),
      cohorts: cohorts.size,
      limitations: [
        "Asking prices are not completed sales.",
        "Trend is unavailable without a matching dated historical sample.",
        ...(!homogeneous
          ? [
              "Mixed or unknown vehicle specifications; mileage adjustment withheld.",
            ]
          : []),
      ],
    },
  };
}
