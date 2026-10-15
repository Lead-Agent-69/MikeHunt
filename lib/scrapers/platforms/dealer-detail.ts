import type { CheerioAPI } from "cheerio";

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
