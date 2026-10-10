import { STATE_SEED_ZIPS } from "@/lib/geo";

const RANGE_FIELDS = {
  minPrice: ["minprice", "Minimum price"],
  maxPrice: ["maxprice", "Maximum price"],
  minYear: ["minyear", "Minimum year"],
  maxYear: ["maxyear", "Maximum year"],
  minMileage: ["minmiles", "Minimum mileage"],
  maxMileage: ["maxmiles", "Maximum mileage"],
} as const;

const INTERNAL_KEYS = new Set([
  "sort",
  "limit",
  "offset",
  "scope",
  "buyerMode",
  "buyingFor",
]);
const LABELS: Record<string, string> = {
  source: "Sources",
  makes: "Multiple makes",
  sellerType: "Seller type",
  titleType: "Title",
  lane: "Inventory lane",
  damage: "Damage",
  fuelType: "Fuel",
  drivetrain: "Drivetrain",
  keys: "Keys",
  runDrive: "Run & drive",
  buyNow: "Buy now",
  dealers: "Dealers",
  dealerSourceIds: "Dealer sources",
  minProfit: "Minimum profit",
  verdict: "Verdict",
  availability: "Availability",
  category: "Category",
  madeInUsa: "Made in USA",
  pricePolicy: "Price availability",
  mileagePolicy: "Mileage availability",
};

function active(value: string | null): value is string {
  return Boolean(value?.trim() && !["all", "any"].includes(value));
}

export function marketHandoff(params: URLSearchParams) {
  const target = new URL("https://www.autotempest.com/results");
  const carried: string[] = [];
  const consumed = new Set<string>();
  const add = (
    key: string,
    targetKey: string,
    label: string,
    value: string,
  ) => {
    target.searchParams.set(targetKey, value);
    consumed.add(key);
    carried.push(`${label}: ${value}`);
  };

  // Use the destination's explicit custom make/model fields, not guessed model slugs.
  for (const key of ["make", "model"] as const) {
    const value = params.get(key);
    if (!active(value)) continue;
    add(key, `${key}_kw`, key === "make" ? "Make words" : "Model words", value);
  }
  for (const [key, [targetKey, label]] of Object.entries(RANGE_FIELDS)) {
    const value = params.get(key);
    if (active(value) && /^\d+$/.test(value)) add(key, targetKey, label, value);
  }
  for (const [key, targetKey, label] of [
    ["q", "keywords", "Keywords"],
    ["trim", "trim_kw", "Trim words"],
  ]) {
    const value = params.get(key);
    if (active(value)) add(key, targetKey, label, value);
  }
  const transmission = params.get("transmission");
  const transmissionValue = transmission?.toLowerCase();
  if (transmissionValue === "automatic" || transmissionValue === "manual") {
    add(
      "transmission",
      "transmission",
      "Transmission",
      transmissionValue === "manual" ? "man" : "auto",
    );
  }
  const body = params.get("body");
  const bodyValue = body?.toLowerCase();
  const supportedBodies = [
    "sedan",
    "suv",
    "coupe",
    "convertible",
    "wagon",
    "hatchback",
    "minivan",
    "van",
    "truck",
    "pickup",
  ];
  if (bodyValue && supportedBodies.includes(bodyValue)) {
    add(
      "body",
      "bodystyle",
      "Body style",
      bodyValue === "pickup" ? "truck" : bodyValue,
    );
  }

  const state = params.get("state")?.toUpperCase();
  const stateZip = state && STATE_SEED_ZIPS[state];
  // Nationwide searches still require a reference ZIP on AutoTempest; it is not the user's location.
  target.searchParams.set("zip", stateZip || "66601");
  target.searchParams.set("localization", stateZip ? "state" : "country");
  target.searchParams.set("radius", "any");
  if (stateZip) consumed.add("state");

  const reapply = Array.from(params.entries())
    .filter(
      ([key, value]) =>
        active(value) && !consumed.has(key) && !INTERNAL_KEYS.has(key),
    )
    .map(([key, value]) => `${LABELS[key] || key}: ${value}`);

  return {
    href: target.toString(),
    carried,
    reapply,
    location: stateZip ? `Statewide: ${state}` : "Nationwide: US",
  };
}
