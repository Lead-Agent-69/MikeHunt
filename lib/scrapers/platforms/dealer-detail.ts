import { load, type CheerioAPI } from "cheerio";
import type { Deal } from "@/types";
import {
  disclosedPriceEvidence,
  type PriceEvidence,
} from "@/lib/deals/acquisition-price";
import { extractVin, isValidVin, normalizeVin } from "@/lib/vehicle/vin";

/** Read explicit price terms only after matching the detail page to this vehicle. */
export function dealerDetailPriceEvidence(
  $: CheerioAPI,
  deal: Partial<Deal>,
  car: Record<string, any>,
  observedAt?: string,
): PriceEvidence | undefined {
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) return undefined;
  const normalize = (value: unknown) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const expectedVin =
    extractVin(deal.vin || "") || extractVin(deal.source_url || "");
  const pageVin =
    car.vehicleIdentificationNumber || dealerDetailField($, "VIN");
  const identity =
    deal.year && deal.make && deal.model
      ? `${deal.year} ${deal.make} ${deal.model}`
      : deal.title;
  const identityKey = normalize(identity);
  if (expectedVin) {
    if (!isValidVin(pageVin) || normalizeVin(pageVin) !== expectedVin)
      return undefined;
  } else if (
    !identityKey ||
    !normalize($("h1").first().text()).includes(identityKey)
  ) {
    return undefined;
  }
  // Ignore other cars, calculators, scripts and site-wide finance advertisements.
  const primary = $.root().clone();
  primary
    .find(
      "script,style,nav,footer,aside,[class*='related'],[id*='related'],[class*='recommend'],[id*='recommend']",
    )
    .remove();
  const clean = load(primary.html() || "");
  const descriptions = primary.find(".vehicle-description");
  const text = [
    expectedVin || (identityKey && normalize(car.name).includes(identityKey))
      ? car.description
      : "",
    descriptions.length === 1 ? descriptions.text() : "",
    ...["Cash Price", "Sale Price", "Full Price", "All In Price"].map(
      (label) => {
        const value = dealerDetailField(clean, label);
        return value ? `${label}: ${value}` : "";
      },
    ),
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  const classifiedText = text.replace(
    /\ball[\s-]+in\s+price\b/gi,
    "full price",
  );
  const evidence = disclosedPriceEvidence(classifiedText, deal.ask_price);
  // Missing detail terms do not invalidate a price established on the inventory card.
  // Keep that card's own observation time, rather than dating it as a detail check.
  if (!evidence && deal.options?.priceEvidence?.kind === "asking")
    return undefined;
  return {
    ...(evidence || {
      kind: "unknown",
      listedAmount: Number(deal.ask_price) || undefined,
      evidenceText: "Source detail did not establish a full purchase price.",
    }),
    checkedAt: observedAt,
  };
}

export function dealerDetailField(
  $: CheerioAPI,
  label: string,
): string | undefined {
  let value: string | undefined;
  $(".leftview, .config-label, .d-title, th, dt").each((_, el) => {
    if (value) return;
    if (
      $(el).text().trim().replace(/:$/, "").toLowerCase() !==
      label.toLowerCase()
    )
      return;
    value = $(el).next().text().trim() || undefined;
  });
  return value;
}

export function dealerDetailAllInPrice(text: string): number | undefined {
  const amounts = new Set<number>();
  for (const pattern of [
    /\ball[\s-]+in\s+price\s*[:*]?\s*\$\s*([\d,]+(?:\.\d{2})?)/gi,
    /\$\s*([\d,]+(?:\.\d{2})?)\s*all[\s-]+in\s+price\b/gi,
  ]) {
    for (const match of Array.from(text.matchAll(pattern))) {
      const amount = Number(match[1].replace(/,/g, ""));
      if (amount >= 100 && amount < 2_000_000) amounts.add(amount);
    }
  }
  return amounts.size === 1 ? Array.from(amounts)[0] : undefined;
}

export function parseDealerOdometer(
  value: unknown,
  unit?: unknown,
): number | undefined {
  const text = String(value ?? "").trim();
  const match = text.match(
    /^(\d{1,3}(?:,\d{3})+|\d{1,6})(?:\.\d+)?\s*(mi(?:les)?\.?|km)?$/i,
  );
  if (!match) return undefined;
  const raw = Number(match[1].replace(/,/g, ""));
  const units = String(match[2] || unit || "SMI")
    .toUpperCase()
    .replace(/\./g, "");
  if (!["MI", "MILES", "SMI", "KM", "KMT"].includes(units)) return undefined;
  const miles = Math.round(
    raw * (["KM", "KMT"].includes(units) ? 0.621371 : 1),
  );
  return miles >= 0 && miles < 1_000_000 ? miles : undefined;
}

export function dealerDetailMileage(
  $: CheerioAPI,
  odometer?: { value?: unknown; unitCode?: unknown },
): number | undefined {
  const structured = parseDealerOdometer(odometer?.value, odometer?.unitCode);
  if (structured !== undefined) return structured;
  let mileage: number | undefined;
  $(".leftview, .config-label, .d-title, th, dt").each((_, el) => {
    if (mileage !== undefined) return;
    if (!/^(?:mileage|odometer)\s*:?$/i.test($(el).text().trim())) return;
    mileage = parseDealerOdometer($(el).next().text().trim());
  });
  if (mileage !== undefined) return mileage;
  // Only a labelled odometer may be read from prose. Shipping distances and phone
  // numbers elsewhere on the page must never replace the vehicle's card mileage.
  const text = $.root().text().replace(/\s+/g, " ");
  const explicit = text.match(
    /\b(?:mileage|odometer)\s*:?\s*(\d{1,3}(?:,\d{3})+|\d{1,6})(?![\d,])(?:\s*(miles?\b|mi\b|km\b))?/i,
  );
  return explicit ? parseDealerOdometer(explicit[1], explicit[2]) : undefined;
}
