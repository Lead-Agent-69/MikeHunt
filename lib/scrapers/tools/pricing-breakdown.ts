// lib/scrapers/tools/pricing-breakdown.ts
// Extract a dealer site's line-item pricing (MSRP, discounts, fees, add-ons) from page HTML and flag
// when the listed price and the line items don't reconcile ("price gap"). Pure parsing — scrapers
// call this and store the result on deals.pricing_breakdown / price_gap_detected.

import * as cheerio from "cheerio";

export interface PriceLine {
  label: string;
  amount: number;
}

export interface PricingBreakdown {
  lines: PriceLine[];
  lineTotal: number | null;
  gap: number | null; // listed price minus reconciled total
}

function toAmount(text?: string): number | null {
  if (!text) return null;
  const m = text.replace(/[, ]/g, "").match(/-?\$?(\d{3,7})/);
  return m ? Number(m[1]) : null;
}

export function extractPricingBreakdown(
  html: string,
  listedPrice?: number,
): PricingBreakdown | null {
  const $ = cheerio.load(html);
  const lines: PriceLine[] = [];

  // Common dealer pricing-table patterns.
  $(
    '.price-breakdown tr, .pricing-table tr, [data-item="price-row"], .vdp-pricing tr, .payment-breakdown tr',
  ).each((_, el) => {
    const row = $(el);
    const label = row.find("td,th,div,span").first().text().trim();
    const valTxt = row.find("td,div,span").last().text().trim();
    const amount = toAmount(valTxt);
    if (label && amount != null && label.length < 60)
      lines.push({ label, amount });
  });

  if (lines.length < 2) return null;

  // Reconcile: sum of additive items (skip the "total" line).
  const additive = lines.filter(
    (l) => !/total|out the door|otd/i.test(l.label),
  );
  const lineTotal = additive.reduce((s, l) => s + l.amount, 0);
  const gap =
    listedPrice != null && lineTotal > 0 ? listedPrice - lineTotal : null;

  return { lines, lineTotal, gap };
}

// A meaningful gap (the listed price doesn't match the line items) worth flagging.
export function hasPriceGap(b: PricingBreakdown | null): boolean {
  return !!b && b.gap != null && Math.abs(b.gap) >= 250;
}
