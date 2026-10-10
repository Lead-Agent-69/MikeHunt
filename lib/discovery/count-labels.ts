/**
 * One vocabulary for the inventory counts buyers see side by side.
 *
 * May's MO pass saw 245 vs 290 vs 246 and read it as a bug. They are three different counts:
 * - Discover `uniqueVehicles` (245): listings that pass the FULL buyer scope, with the same VIN on
 *   several sites merged into one vehicle.
 * - Discover `totalListings`, Scan `total` and Today's ready-source rows (246): the same scoped
 *   listings, before that cross-site VIN merge.
 * - Discover `marketListings` (290): every active listing in the state under the price ceiling,
 *   BEFORE the remaining profile filters (lane, seller type, title, makes, dealers).
 *
 * Labels say "vehicles" only for VIN-merged counts and "listings" for everything else.
 */

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function discoverMatchLabel(input: {
  uniqueVehicles: number;
  totalListings?: number | null;
  previewMode?: boolean;
}): string {
  const vehicles = Number(input.uniqueVehicles) || 0;
  if (input.previewMode)
    return `${plural(vehicles, "vehicle", "vehicles")} in preview`;
  const listings = Number(input.totalListings) || 0;
  const base = plural(vehicles, "matching vehicle", "matching vehicles");
  if (listings > vehicles) {
    const merged = listings - vehicles;
    return `${base} · ${plural(listings, "listing", "listings")} (${plural(merged, "duplicate", "duplicates")} across sites merged)`;
  }
  return base;
}

export function marketListingsContext(input: {
  marketListings?: number | null;
  totalListings?: number | null;
  placeName: string;
}): string | null {
  const market = Number(input.marketListings) || 0;
  const scoped = Number(input.totalListings) || 0;
  if (!(market > scoped)) return null;
  return `${plural(market, "active listing", "active listings")} in ${input.placeName} under your price ceiling, before your other filters narrow it to ${plural(scoped, "listing", "listings")}.`;
}

/** Today's source-proof sentence counts listings (not VIN-merged vehicles). */
export function todaySourceProofLabel(input: {
  readySources: number;
  rows: number;
  photos: number;
  quality: number;
}): string {
  return `${plural(input.readySources, "source", "sources")} can return matching cars now: ${plural(input.rows, "matching listing", "matching listings")}, ${input.photos.toLocaleString()} photo-backed, ${input.quality}/100 average detail quality.`;
}
