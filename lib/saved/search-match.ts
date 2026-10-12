import { reportedAcquisitionPrice } from "@/lib/deals/acquisition-price";
import { titleCategoryDetail } from "@/lib/deals/title-category";
import { dealLane } from "@/lib/discovery/categorize";
import { withinMiles } from "@/lib/geo/distance";
import { hasReportedRepairRisk } from "@/lib/intelligence/repair-risk";

type Search = {
  is_active?: boolean;
  make?: string | null;
  model?: string | null;
  state?: string | null;
  lane?: string | null;
  seller_type?: string | null;
  title_type?: string | null;
  min_year?: number | null;
  max_year?: number | null;
  max_price?: number | null;
  target_profit?: number | null;
  require_go?: boolean;
  max_distance_miles?: number | null;
};
type Coordinates = { lat?: number | null; lng?: number | null };
type Listing = Coordinates & {
  make?: string | null;
  model?: string | null;
  year?: number | null;
  location_state?: string | null;
  source?: string;
  seller_type?: string | null;
  condition?: string | null;
  damage_type?: string | null;
  options?: Record<string, any> | null;
  ask_price?: unknown;
  metadata?: Record<string, unknown> | null;
  true_net_profit?: number | null;
  deal_verdict?: string | null;
};
const text = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const positive = (value: unknown) =>
  value != null && Number.isFinite(Number(value)) && Number(value) > 0;

/** Explicit seller evidence wins. Mixed marketplaces are not proof of seller type. */
function sellerType(deal: Listing) {
  const reported = text(deal.seller_type || deal.options?.sellerType);
  if (["dealer", "private", "auction"].includes(reported)) return reported;
  if (dealLane(deal) === "auction") return "auction";
  if (
    ["independent_dealer", "craigslist_dealer", "carvana", "carmax"].includes(
      text(deal.source),
    )
  )
    return "dealer";
  return "unknown";
}

/** Missing evidence cannot satisfy a saved constraint or trigger a targeted alert. */
export function matchesSavedSearch(
  deal: Listing,
  search: Search,
  home?: Coordinates,
) {
  if (search.is_active === false) return false;
  for (const field of [
    "min_year",
    "max_year",
    "max_price",
    "target_profit",
    "max_distance_miles",
  ] as const) {
    const value = search[field];
    if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0))
      return false;
  }
  for (const field of ["make", "model"] as const)
    if (text(search[field]) && text(search[field]) !== text(deal[field]))
      return false;
  if (text(search.state) && text(search.state) !== text(deal.location_state))
    return false;
  if (
    search.min_year != null &&
    (!positive(deal.year) || Number(deal.year) < Number(search.min_year))
  )
    return false;
  if (
    search.max_year != null &&
    (!positive(deal.year) || Number(deal.year) > Number(search.max_year))
  )
    return false;
  if (search.max_price != null) {
    const price = reportedAcquisitionPrice(deal);
    if (!positive(price) || price > Number(search.max_price)) return false;
  }
  if (
    search.target_profit != null &&
    (!Number.isFinite(deal.true_net_profit) ||
      Number(deal.true_net_profit) < Number(search.target_profit))
  )
    return false;
  if (search.require_go && text(deal.deal_verdict) !== "go") return false;
  const seller = sellerType(deal);
  if (
    search.seller_type &&
    search.seller_type !== "all" &&
    text(search.seller_type) !== seller
  )
    return false;
  if (
    search.title_type &&
    search.title_type !== "all" &&
    text(search.title_type) !== titleCategoryDetail(deal).category
  )
    return false;
  const lane = text(search.lane);
  if (lane && lane !== "all") {
    const risk = hasReportedRepairRisk(deal.condition, deal.damage_type);
    const matchesLane =
      lane === "auction"
        ? dealLane(deal) === "auction"
        : lane === "government"
          ? text(deal.source) === "gov_auction" ||
            [
              "govdeals",
              "publicsurplus",
              "allsurplus",
              "municibid",
              "gsa",
              "gsa_auctions",
            ].includes(text(deal.source))
          : lane === "clean-retail"
            ? seller === "dealer" && !risk
            : lane === "private"
              ? seller === "private"
              : lane === "parts"
                ? deal.condition === "parts_only"
                : lane === "damaged"
                  ? risk
                  : false;
    if (!matchesLane) return false;
  }
  if (
    search.max_distance_miles != null &&
    Number(search.max_distance_miles) > 0 &&
    (!home || !withinMiles(home, deal, Number(search.max_distance_miles)))
  )
    return false;
  return true;
}
