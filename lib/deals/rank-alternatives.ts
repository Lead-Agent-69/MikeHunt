import { isAuctionSource } from "@/lib/deal-terms";
import { isWithinAuctionWindow } from "@/lib/search/live-auction-window";
import { dealLane } from "@/lib/discovery/categorize";

export type AlternativeRow = {
  id: string;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  ask_price?: number | null;
  mileage?: number | null;
  condition?: string | null;
  damage_type?: string | null;
  source?: string | null;
  vin?: string | null;
  active?: boolean;
  last_seen_at?: string | null;
  auction_end_at?: string | null;
  location_state?: string | null;
};

const normalize = (value?: string | null) =>
  (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const risky = (row: AlternativeRow) =>
  ["salvage", "repairable"].includes(dealLane(row)) ||
  /salvage|rebuilt|parts|repairable|flood|junk|wreck|non.runner/.test(
    row.condition?.toLowerCase() || "",
  );
const positive = (value?: number | null): value is number =>
  value != null && Number.isFinite(value) && value > 0;

/** Fit precedes price: a cheaper bid or damaged car is not a cheaper retail alternative. */
export function rankAlternatives<T extends AlternativeRow>(
  base: AlternativeRow,
  candidates: T[],
  now = Date.now(),
) {
  const auction = isAuctionSource(base.source);
  const seenIds = new Set<string>();
  const seenVins = new Set<string>();
  return candidates
    .filter((row) => {
      const seen = Date.parse(row.last_seen_at || "");
      return (
        row.id !== base.id &&
        row.active === true &&
        Number.isFinite(seen) &&
        seen <= now + 60_000 &&
        seen >= now - 7 * 86400000 &&
        isWithinAuctionWindow(row, now) &&
        normalize(row.make) === normalize(base.make) &&
        !!normalize(base.model) &&
        normalize(row.model) === normalize(base.model) &&
        (!base.vin || !row.vin || normalize(base.vin) !== normalize(row.vin)) &&
        auction === isAuctionSource(row.source) &&
        (risky(base) || !risky(row)) &&
        (!base.year || !row.year || Math.abs(row.year - base.year) <= 2) &&
        positive(row.ask_price) &&
        (auction ||
          !positive(base.ask_price) ||
          (row.ask_price >= base.ask_price * 0.6 &&
            row.ask_price <= base.ask_price * 1.4))
      );
    })
    .map((row) => {
      const matchReasons = ["Same make and model"];
      let score = 0;
      if (base.year && row.year) {
        score += Math.abs(row.year - base.year) * 4;
        matchReasons.push(
          row.year === base.year ? "Same year" : "Within two model years",
        );
      } else score += 12;
      const priceDifference =
        !auction && positive(base.ask_price) && positive(row.ask_price)
          ? row.ask_price - base.ask_price
          : undefined;
      if (priceDifference != null) {
        score += (Math.abs(priceDifference) / base.ask_price!) * 20;
        if (priceDifference < 0)
          matchReasons.push(
            `$${Math.abs(priceDifference).toLocaleString("en-US")} lower asking price`,
          );
        else if (priceDifference > 0)
          matchReasons.push(
            `$${priceDifference.toLocaleString("en-US")} higher asking price`,
          );
        else if (priceDifference === 0) matchReasons.push("Same asking price");
      }
      if (base.location_state && row.location_state === base.location_state) {
        score -= 2;
        matchReasons.push("Same state");
      }
      if (positive(base.mileage) && positive(row.mileage)) {
        score += Math.min(Math.abs(row.mileage - base.mileage) / 10000, 6);
        if (row.mileage < base.mileage)
          matchReasons.push("Lower reported mileage");
      }
      if (!row.condition) score += 3;
      score += ((now - Date.parse(row.last_seen_at!)) / 86400000) * 0.2;
      return { row, score, matchReasons, priceDifference };
    })
    .sort((a, b) => a.score - b.score || a.row.id.localeCompare(b.row.id))
    .filter(({ row }) => {
      const vin = normalize(row.vin);
      if (seenIds.has(row.id) || (vin && seenVins.has(vin))) return false;
      seenIds.add(row.id);
      if (vin) seenVins.add(vin);
      return true;
    })
    .slice(0, 12);
}
