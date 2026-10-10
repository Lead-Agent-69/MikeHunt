import type { Deal } from "@/types";
import { titleCaseMake, canonicalModel } from "@/lib/vehicle/canonical";
import { looksLikePaymentPrice } from "@/lib/scoring/payment-price";
import { looksLikePlaceholderPrice } from "@/lib/scoring/placeholder-price";

export function normalizeVin(value?: string | null): string | null {
  const vin = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
}

export function priceKind(
  deal: Partial<Deal>,
): "ask" | "bid" | "payment" | "placeholder" | "unknown" {
  const options = deal.options;
  if (options?.priceKind === "bid" || options?.priceKind === "payment")
    return options.priceKind;
  if (looksLikePaymentPrice(deal.title)) return "payment";
  if (
    deal.auction_end ||
    deal.source === "copart" ||
    deal.source === "gov_auction"
  )
    return "bid";
  if (
    typeof deal.ask_price !== "number" ||
    !Number.isFinite(deal.ask_price) ||
    deal.ask_price <= 0
  )
    return "unknown";
  return looksLikePlaceholderPrice(deal.ask_price) ? "placeholder" : "ask";
}

export function normalizeIntegrity(deal: Partial<Deal>): Partial<Deal> {
  const normalized = { ...deal };
  if (normalized.vin)
    normalized.vin =
      normalizeVin(normalized.vin) || normalized.vin.trim().toUpperCase();
  // Common odometer placeholders are unknown, not near-million-mile observations.
  if ([999999, 9999999].includes(Number(normalized.mileage)))
    normalized.mileage = undefined;
  normalized.options = {
    ...normalized.options,
    priceKind: priceKind(normalized),
  } as Deal["options"];
  return normalized;
}

/** Conservative grouping: a VIN conflict remains separate and needs review, never a fuzzy merge. */
export function vehicleIdentity(row: Partial<Deal>): string | null {
  const vin = normalizeVin(row.vin);
  if (!vin || !row.make || !row.model || !row.year) return null;
  return [
    vin,
    titleCaseMake(row.make).toLowerCase(),
    canonicalModel(row.model).toLowerCase(),
    row.year,
  ].join("|");
}

export function integritySummary(deal: Partial<Deal>) {
  const fields = {
    vin: Boolean(normalizeVin(deal.vin)),
    photos: Boolean(deal.images?.length),
    mileage: typeof deal.mileage === "number" && Number.isFinite(deal.mileage),
    location: Boolean(deal.location_state && deal.location_city),
    condition: Boolean(deal.condition),
    sourceLink: Boolean(deal.source_url),
  };
  const kind = priceKind(deal);
  return {
    fields,
    completeness: Math.round(
      (Object.values(fields).filter(Boolean).length / 6) * 100,
    ),
    priceKind: kind,
    valuationEligible: kind === "ask",
    warnings: [
      ...(!fields.photos ? ["missing_photos"] : []),
      ...(kind === "payment" || kind === "placeholder"
        ? ["not_cash_price"]
        : []),
      ...(Number(deal.ask_price) > 1000000 ? ["unusual_price"] : []),
    ],
  };
}
