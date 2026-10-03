import { normalizeSourceId } from "@/lib/scrapers/source-index";

export type SourceLane =
  | "all"
  | "damaged"
  | "auction"
  | "private"
  | "clean-retail"
  | "government"
  | "parts"
  | "specialty";

export function laneForSource(source: {
  id?: string;
  type?: string;
}): SourceLane {
  const id = normalizeSourceId(source.id || "");
  if (
    [
      "govdeals",
      "publicsurplus",
      "municibid",
      "allsurplus",
      "gsa-auctions",
      "gsa_auctions",
    ].includes(id)
  ) {
    return "government";
  }
  if (
    [
      "copart",
      "iaa",
      "curated-dealers",
      "curated_dealers",
      "independent-dealer",
      "independent_dealer",
      "ae-of-miami",
      "damage-com",
      "dg-auto",
      "recar",
      "stjames-auto",
      "cas-miami",
      "salvagezone",
      "rebuilt-auto",
      "alpine-auto",
      "replica-auto",
    ].includes(id)
  ) {
    return "damaged";
  }
  if (["manheim", "adesa", "acv"].includes(id)) return "auction";
  if (
    [
      "craigslist",
      "facebook-marketplace",
      "facebook_marketplace",
      "offerup",
      "ebay-motors",
      "ebay_motors",
    ].includes(id)
  ) {
    return "private";
  }
  if (
    [
      "cars-com",
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "carvana",
    ].includes(id)
  ) {
    return "clean-retail";
  }
  if (
    source.type === "parts" ||
    id === "carparts-com" ||
    id === "carparts_com"
  ) {
    return "parts";
  }
  if (id === "autotempest") return "specialty";
  return "all";
}

export function scanHrefForSource(source: { id?: string; type?: string }) {
  const id = source.id || "";
  const lane = laneForSource(source);
  const params = new URLSearchParams();
  if (lane !== "all") params.set("lane", lane);
  if (id) params.set("source", id);
  params.set("sort", "profit");
  return `/scan?${params.toString()}`;
}
