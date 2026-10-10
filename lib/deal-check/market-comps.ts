// lib/deal-check/market-comps.ts
// Market value for Deal Check, from lib/scoring/comps-aggregate.ts instead of a plain average of
// active asks. A plain average grades an asking price against an average of asking prices, and the
// listing being checked can sit inside that average. Here:
//   • the listing being checked is never its own comp (deal id, source + source_deal_id, same VIN,
//     or the same listing URL that was pasted);
//   • completed sales beat asks (aggregateComps evidence ladder), asks get the ask→sold haircut;
//   • asks not seen live in ASK_COMP_WINDOW_DAYS (same 7-day window as draft #166) are dropped;
//   • fewer than 3 independent comps → value is null ("unknown"), never a number;
//   • title lanes never mix: a salvage/rebuilt/rebuildable vehicle is valued only on same-title comps,
//     a clean or unknown-title vehicle only on clean/unknown-title comps (dealCheckCompCategories).
//     Sold rows are classified from their headline (soldTitleCategory: clean only on an explicit
//     "clean title"), asking-price rows from deals.condition (titleCategory).

import {
  aggregateComps,
  ASK_TO_SOLD,
  isSelfComp,
  type CompAggregate,
  type CompObservation,
} from "@/lib/scoring/comps-aggregate";
import {
  soldTitleCategory,
  titleCategory,
  type TitleCategory,
} from "@/lib/deals/title-category";

/** Asks must have been seen live this recently to count (matches #166 market-value window). */
export const ASK_COMP_WINDOW_DAYS = 7;
/** Completed sales older than this are not a current price (matches market-value.ts). */
export const SOLD_COMP_WINDOW_DAYS = 180;
const DAY_MS = 86_400_000;

export interface DealCheckCompRow {
  id?: string | null;
  source?: string | null;
  source_deal_id?: string | null;
  source_url?: string | null;
  vin?: string | null;
  ask_price?: number | null;
  sold_price?: number | null;
  location_state?: string | null;
  year?: number | null;
  mileage?: number | null;
  last_seen_at?: string | null;
  sold_at?: string | null;
  /** Asking-price rows: deals.condition (clean_title, salvage_title, …). */
  condition?: string | null;
  /** Sold rows: the seller's headline (title evidence for soldTitleCategory). */
  title?: string | null;
}

export interface DealCheckTarget {
  id?: string | null;
  source?: string | null;
  sourceDealId?: string | null;
  vin?: string | null;
  url?: string | null;
  state?: string | null;
  /** Title of the vehicle being checked; null/unknown → the clean/unknown lane. */
  titleCategory?: TitleCategory | null;
}

export interface DealCheckMarket {
  aggregate: CompAggregate;
  /** Rows dropped because they are the vehicle/listing being checked. */
  excludedSelf: number;
  /** Rows dropped as stale (ask not seen in 7 days, sale older than 180 days or undated). */
  excludedStale: number;
  /** Rows dropped because their title lane differs from the vehicle's (salvage vs clean). */
  excludedTitle: number;
  /** Comp categories the vehicle was valued against. */
  titleLane: readonly TitleCategory[];
  /** Ask rows that survived self/stale/title exclusion, for the "other listings" panel. */
  askRows: DealCheckCompRow[];
}

/**
 * Comp categories that may value a vehicle of this title (same contract as lib/arbitrage
 * compCategoriesFor, without the discount fallback): salvage → salvage; rebuilt → rebuilt;
 * rebuildable → rebuildable + salvage (both unrepaired branded); clean / unknown → clean + unknown.
 */
export function dealCheckCompCategories(
  cat: TitleCategory | null | undefined,
): readonly TitleCategory[] {
  switch (cat) {
    case "salvage":
      return ["salvage"];
    case "rebuilt":
      return ["rebuilt"];
    case "rebuildable":
      return ["rebuildable", "salvage"];
    default:
      return ["clean", "unknown"];
  }
}

/** Title category of a comp row: sold rows by headline, asking-price rows by condition. */
export function dealCheckCompTitle(
  row: DealCheckCompRow,
  kind: "sold" | "ask",
): TitleCategory {
  if (kind === "ask" || row.condition) return titleCategory(row);
  return soldTitleCategory(row.title);
}

function normVin(v?: string | null): string {
  const s = String(v || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return s.length === 17 ? s : "";
}

function normUrl(v?: string | null): string {
  try {
    const u = new URL(String(v || "").trim());
    if (!["http:", "https:"].includes(u.protocol)) return "";
    u.hash = "";
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return "";
  }
}

/** Same physical vehicle or same listing as the one being checked. */
export function isSameVehicleOrListing(
  row: DealCheckCompRow,
  target: DealCheckTarget,
): boolean {
  const vin = normVin(target.vin);
  if (vin && normVin(row.vin) === vin) return true;
  const url = normUrl(target.url);
  return !!url && normUrl(row.source_url) === url;
}

function fresh(stamp: string | null | undefined, days: number, now: number) {
  const t = Date.parse(stamp || "");
  return Number.isFinite(t) && t <= now + 60_000 && t >= now - days * DAY_MS;
}

/**
 * Market value for one checked vehicle. `askRows` are active `deals` rows already filtered to
 * retail asking-price evidence; `soldRows` (optional) are completed sales with `sold_price`.
 */
export function dealCheckMarketValue(input: {
  target: DealCheckTarget;
  askRows?: readonly DealCheckCompRow[] | null;
  soldRows?: readonly DealCheckCompRow[] | null;
  now?: number;
}): DealCheckMarket {
  const now = input.now ?? Date.now();
  const { target } = input;
  let excludedSelf = 0;
  let excludedStale = 0;
  let excludedTitle = 0;
  const lane = dealCheckCompCategories(target.titleCategory);
  const comps: CompObservation[] = [];
  const keptAsks: DealCheckCompRow[] = [];

  const consider = (row: DealCheckCompRow, kind: "sold" | "ask") => {
    const price = Number(kind === "sold" ? row.sold_price : row.ask_price);
    if (!(Number.isFinite(price) && price > 0)) return;
    if (isSameVehicleOrListing(row, target)) {
      excludedSelf++;
      return;
    }
    if (!lane.includes(dealCheckCompTitle(row, kind))) {
      excludedTitle++;
      return;
    }
    const stamp = kind === "sold" ? row.sold_at : row.last_seen_at;
    if (
      !fresh(
        stamp,
        kind === "sold" ? SOLD_COMP_WINDOW_DAYS : ASK_COMP_WINDOW_DAYS,
        now,
      )
    ) {
      excludedStale++;
      return;
    }
    comps.push({
      price,
      kind,
      state: row.location_state ?? null,
      year: row.year ?? null,
      mileage: row.mileage ?? null,
      observedAt: stamp ?? null,
      id: row.id ?? null,
      source: row.source ?? null,
      sourceDealId: row.source_deal_id ?? null,
    });
    if (kind === "ask") keptAsks.push(row);
  };
  for (const r of input.soldRows || []) consider(r, "sold");
  for (const r of input.askRows || []) consider(r, "ask");

  // Staleness is already applied above with per-kind windows, so no maxAgeDays here.
  const aggregate = aggregateComps(
    {
      id: target.id,
      source: target.source,
      sourceDealId: target.sourceDealId,
      state: target.state,
    },
    comps,
  );
  const compTarget = {
    id: target.id,
    source: target.source,
    sourceDealId: target.sourceDealId,
  };
  return {
    aggregate,
    excludedSelf: excludedSelf + aggregate.excludedSelf,
    excludedStale,
    excludedTitle,
    titleLane: lane,
    askRows: keptAsks.filter(
      (r) =>
        !isSelfComp(
          {
            price: 1,
            kind: "ask",
            id: r.id,
            source: r.source,
            sourceDealId: r.source_deal_id,
          },
          compTarget,
        ),
    ),
  };
}

/** Plain-language description of where the value came from (shown under the number). */
export function marketBasisLabel(a: CompAggregate): string | null {
  if (a.value == null) return null;
  const where = a.scope === "state" && a.state ? ` in ${a.state}` : "";
  return a.kind === "sold"
    ? `Median of ${a.n} recent completed sales${where}.`
    : `Median of ${a.n} active asking prices${where}, less ${Math.round((1 - ASK_TO_SOLD) * 100)}% for the usual gap between asking and selling price.`;
}

export const MARKET_UNKNOWN_REASON =
  "Market value unknown: fewer than 3 comparable listings or sales besides this vehicle.";
