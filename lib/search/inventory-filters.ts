export function dbSourceValues(sourceId: string) {
  const id = sourceId.toLowerCase();
  const mapped: Record<string, string[]> = {
    publicsurplus: ["gov_auction"],
    govdeals: ["gov_auction"],
    allsurplus: ["gov_auction"],
    municibid: ["gov_auction"],
    gsa_auctions: ["gov_auction"],
    curated_dealers: ["independent_dealer"],
    "ae-of-miami": ["independent_dealer"],
    "damage-com": ["independent_dealer"],
    "dg-auto": ["independent_dealer"],
    recar: ["independent_dealer"],
    "stjames-auto": ["independent_dealer"],
    "cas-miami": ["independent_dealer"],
    salvagezone: ["independent_dealer"],
    "rebuilt-auto": ["independent_dealer"],
    "alpine-auto": ["independent_dealer"],
    "replica-auto": ["independent_dealer"],
    carparts_com: ["independent_dealer"],
  };
  return mapped[id] || [id];
}

export function uniqueDbSources(sourceIds: string[]) {
  return Array.from(new Set(sourceIds.flatMap(dbSourceValues)));
}

export function sellerTypeSourceValues(sellerType: string) {
  const type = sellerType.toLowerCase();
  if (type === "auction") {
    return ["copart", "iaa", "adesa", "manheim", "acv", "gov_auction"];
  }
  if (type === "dealer") {
    return [
      "independent_dealer",
      "craigslist_dealer",
      "carmax",
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "ebay_motors",
      "carvana",
      "vroom",
    ];
  }
  if (type === "private") {
    return ["craigslist", "facebook_marketplace", "offerup"];
  }
  return [];
}

export function sourceUrlNeedles(sourceId: string) {
  const id = sourceId.toLowerCase();
  const mapped: Record<string, string[]> = {
    publicsurplus: ["publicsurplus.com"],
    govdeals: ["govdeals.com"],
    allsurplus: ["allsurplus.com", "liquidityservices.com"],
    municibid: ["municibid.com"],
    gsa_auctions: ["gsaauctions.gov", "gsa.gov"],
    "ae-of-miami": ["aeofmiami.com"],
    "damage-com": ["damage.com"],
    "dg-auto": ["dgautollc.com"],
    recar: ["recar.com"],
    "stjames-auto": ["stjamesauto.com", "stjamesautoparts.com"],
    "cas-miami": ["casmiami.com"],
    salvagezone: ["salvagezone.com"],
    "rebuilt-auto": ["rebuiltauto.com"],
    "alpine-auto": ["alpineautogallery.com"],
    "replica-auto": ["replicaauto.com"],
  };
  return mapped[id] || [];
}

export function damagedLaneFilter() {
  return [
    "condition.in.(salvage_title,rebuilt_title,parts_only,fire,flood,hail,repairable)",
    "damage_type.ilike.%repairable%",
    "damage_type.ilike.%damage%",
    "damage_type.ilike.%collision%",
  ].join(",");
}

export function validateInventoryRanges(
  params: URLSearchParams,
): string | null {
  for (const [min, max, label] of [
    ["minPrice", "maxPrice", "Price"],
    ["minYear", "maxYear", "Year"],
    ["minMileage", "maxMileage", "Mileage"],
  ]) {
    const low = params.get(min);
    const high = params.get(max);
    for (const value of [low, high]) {
      if (
        value != null &&
        (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
      )
        return `${label} must be a non-negative whole number`;
    }
    if (high && Number(high) === 0 && label !== "Mileage")
      return `${label} maximum must be greater than zero`;
    if (low && high && Number(low) > Number(high))
      return `${label} minimum must not exceed maximum`;
  }
  return null;
}

export function applyVehicleDetails(query: any, params: URLSearchParams) {
  let scoped = query;
  for (const [key, column] of [
    ["damage", "damage_type"],
    ["body", "body_class"],
    ["trim", "trim"],
  ]) {
    const value = (params.get(key) || "")
      .replace(/[^a-zA-Z0-9 -]/g, "")
      .trim()
      .slice(0, 60);
    if (value && value !== "all") scoped = scoped.ilike(column, `%${value}%`);
  }
  for (const [key, column, values] of [
    ["fuelType", "fuel_type", ["Gas", "Diesel", "Hybrid", "Electric"]],
    ["transmission", "transmission", ["Automatic", "Manual"]],
    ["drivetrain", "drivetrain", ["AWD", "4WD", "FWD", "RWD"]],
  ] as const) {
    const value = params.get(key);
    if (values.some((allowed) => allowed === value))
      scoped = scoped.or(
        `${column}.ilike.%${value}%,options->>${key}.eq.${value}`,
      );
  }
  const keys = params.get("keys");
  if (keys === "yes" || keys === "no")
    scoped = scoped.eq("keys_present", keys === "yes");
  if (keys === "unknown") scoped = scoped.is("keys_present", null);
  if (params.get("buyNow") === "1") scoped = scoped.gt("buy_now_price", 0);
  return scoped;
}

export function applyInventoryLane(query: any, lane: string) {
  if (lane === "auction" || lane === "government")
    return query.in(
      "source",
      lane === "auction" ? sellerTypeSourceValues("auction") : ["gov_auction"],
    );
  if (lane === "private")
    return query.in("source", sellerTypeSourceValues("private"));
  if (lane === "clean-retail")
    return query.in("source", sellerTypeSourceValues("dealer"));
  if (lane === "parts") return query.eq("condition", "parts_only");
  if (lane === "damaged") return query.or(damagedLaneFilter());
  return query;
}
