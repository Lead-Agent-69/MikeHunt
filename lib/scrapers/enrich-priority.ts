// Which listings get the (capped) detail-fetch budget first. Enrichment pulls VIN/mileage/photos
// from each listing's detail page but is bounded per run, so we spend it on the deals most likely to
// be a profitable GO — newer + underpriced — which are also the ones most likely to actually carry a
// VIN. Cheap heuristic over the search-card fields only (year + price + make); no market lookup.

const POPULAR_MAKES = new Set([
  "ford",
  "chevrolet",
  "toyota",
  "honda",
  "ram",
  "gmc",
  "jeep",
  "nissan",
  "subaru",
  "dodge",
]);

export function enrichPriority(
  deal: {
    year?: number | null;
    ask_price?: number | null;
    make?: string | null;
  },
  // Makes the dealer has actually profited on (lowercased) — closes the learning loop so the
  // enrichment budget favors segments that make money. Empty/omitted → pure static heuristic.
  profitableMakes?: Set<string>,
): number {
  const year = Number(deal.year) || 0;
  const price = Number(deal.ask_price) || 0;
  if (!year || !price) return 0; // incomplete → lowest priority

  const nowYear = new Date().getFullYear();
  const age = Math.max(0, nowYear - year);
  let score = 0;

  // Flip sweet spot — too cheap is junk, too dear ties up capital.
  if (price >= 2500 && price <= 25000) score += 40;
  // Newer holds value and is likelier to list a VIN.
  if (age <= 6) score += 25;
  else if (age <= 12) score += 12;

  // Underpriced vs a crude age-based expected value → the actual deal signal.
  const expected = Math.max(3000, 32000 - age * 2200);
  if (price < expected * 0.6) score += 35;
  else if (price < expected * 0.8) score += 18;

  if (deal.make && POPULAR_MAKES.has(deal.make.toLowerCase())) score += 8;

  // Learned signal: this make has actually made the dealer money → enrich it first.
  if (deal.make && profitableMakes?.has(deal.make.toLowerCase())) score += 30;

  return score;
}
