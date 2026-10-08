export type InventoryFilterField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date";
  options?: readonly { value: string; label: string }[];
};
const options = (...values: string[]) =>
  values.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));
const reported = [
  { value: "yes", label: "Reported yes" },
  { value: "no", label: "Reported no" },
  { value: "unknown", label: "Not reported" },
];
export const INVENTORY_DETAIL_GROUPS: {
  label: string;
  fields: InventoryFilterField[];
}[] = [
  {
    label: "Vehicle specifications",
    fields: [
      {
        key: "body",
        label: "Body style",
        options: options(
          "Sedan",
          "SUV",
          "Pickup",
          "Coupe",
          "Convertible",
          "Van",
          "Wagon",
          "Motorcycle",
        ),
      },
      { key: "trim", label: "Trim" },
      {
        key: "fuelType",
        label: "Fuel",
        options: options("Gas", "Diesel", "Hybrid", "Electric"),
      },
      {
        key: "transmission",
        label: "Transmission",
        options: options("Automatic", "Manual"),
      },
      {
        key: "drivetrain",
        label: "Drivetrain",
        options: options("AWD", "4WD", "FWD", "RWD"),
      },
      { key: "color", label: "Exterior color" },
      { key: "engine", label: "Engine" },
    ],
  },
  {
    label: "Condition & auction",
    fields: [
      {
        key: "damage",
        label: "Damage",
        options: options(
          "front",
          "rear",
          "side",
          "hail",
          "flood",
          "fire",
          "mechanical",
          "rollover",
          "frame",
          "undercarriage",
          "roof",
          "vandalism",
          "stripped",
        ),
      },
      { key: "keys", label: "Keys present", options: reported },
      { key: "runDrive", label: "Run & drive reported", options: reported },
      {
        key: "buyNow",
        label: "Buy now",
        options: [{ value: "1", label: "Available" }],
      },
      { key: "minBuyNow", label: "Buy now price from ($)", type: "number" },
      { key: "maxBuyNow", label: "Buy now price to ($)", type: "number" },
      {
        key: "auctionFrom",
        label: "Auction end date from (UTC)",
        type: "date",
      },
      { key: "auctionTo", label: "Auction end date to (UTC)", type: "date" },
    ],
  },
  {
    label: "Location & listing evidence",
    fields: [
      { key: "city", label: "City" },
      { key: "zip", label: "ZIP code" },
      {
        key: "hasVin",
        label: "VIN",
        options: [
          { value: "yes", label: "Reported" },
          { value: "no", label: "Not reported" },
        ],
      },
      {
        key: "hasPhotos",
        label: "Photos",
        options: [
          { value: "yes", label: "Available" },
          { value: "no", label: "Not reported" },
        ],
      },
      {
        key: "seenWithin",
        label: "Last observed",
        options: [
          { value: "1", label: "Past 24 hours" },
          { value: "7", label: "Past 7 days" },
          { value: "30", label: "Past 30 days" },
        ],
      },
    ],
  },
];
export const SCAN_EXTRA_KEYS = [
  "color",
  "engine",
  "runDrive",
  "minBuyNow",
  "maxBuyNow",
  "auctionFrom",
  "auctionTo",
  "city",
  "zip",
  "hasVin",
  "hasPhotos",
  "seenWithin",
];
export const INVENTORY_DETAIL_FIELDS = INVENTORY_DETAIL_GROUPS.flatMap(
  (group) => group.fields,
);

export function hasAuctionDetailFilters(params: URLSearchParams) {
  return (
    params.get("buyNow") === "1" ||
    ["minBuyNow", "maxBuyNow", "auctionFrom", "auctionTo"].some((key) =>
      Boolean(params.get(key)),
    )
  );
}

export function readInventoryDetails(
  params: URLSearchParams,
  keys = INVENTORY_DETAIL_FIELDS.map((field) => field.key),
) {
  return Object.fromEntries(
    keys
      .map((key) => [key, params.get(key) || ""])
      .filter(([, value]) => value && value !== "all"),
  );
}

export function validateExtendedFilters(
  params: URLSearchParams,
): string | null {
  for (const field of INVENTORY_DETAIL_FIELDS) {
    const value = params.get(field.key);
    if (!value || value === "all") continue;
    if (
      field.options &&
      !field.options.some((option) => option.value === value)
    )
      return `Choose a valid ${field.label.toLowerCase()}`;
    if (
      field.type === "number" &&
      (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))
    )
      return `${field.label} must be a non-negative whole number`;
    if (
      field.type === "date" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString().slice(0, 10) !== value)
    )
      return `${field.label} must be a valid date`;
  }
  if (params.get("zip") && !/^\d{5}$/.test(params.get("zip")!))
    return "ZIP code must contain five digits";
  if (params.get("maxBuyNow") === "0")
    return "Buy now price maximum must be greater than zero";
  if (
    params.has("minBuyNow") &&
    params.has("maxBuyNow") &&
    Number(params.get("minBuyNow")) > Number(params.get("maxBuyNow"))
  )
    return "Buy now price minimum must not exceed maximum";
  if (
    params.get("auctionFrom") &&
    params.get("auctionTo") &&
    params.get("auctionFrom")! > params.get("auctionTo")!
  )
    return "Auction date from must not exceed date to";
  return null;
}

export function applyExtendedFilters(
  query: any,
  params: URLSearchParams,
  now = Date.now(),
) {
  let q = query;
  for (const [key, column] of [
    ["color", "color"],
    ["engine", "engine"],
    ["city", "location_city"],
  ]) {
    const value = (params.get(key) || "")
      .replace(/[^a-zA-Z0-9 .-]/g, "")
      .trim()
      .slice(0, 60);
    if (value && value !== "all") q = q.ilike(column, `%${value}%`);
  }
  if (params.get("zip")) q = q.eq("location_zip", params.get("zip"));
  const runDrive = params.get("runDrive");
  if (runDrive === "unknown") q = q.is("run_drive", null);
  else if (runDrive === "yes" || runDrive === "no")
    q = q.eq("run_drive", runDrive === "yes");
  for (const [key, method] of [
    ["minBuyNow", "gte"],
    ["maxBuyNow", "lte"],
  ]) {
    if (params.has(key))
      q = q
        .gt("buy_now_price", 0)
        [method]("buy_now_price", Number(params.get(key)));
  }
  if (params.get("auctionFrom"))
    q = q.gte("auction_end_at", `${params.get("auctionFrom")}T00:00:00.000Z`);
  if (params.get("auctionTo")) {
    const nextDay = new Date(`${params.get("auctionTo")}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    q = q.lt("auction_end_at", nextDay.toISOString());
  }
  const vin = params.get("hasVin");
  if (vin === "yes") q = q.not("vin", "is", null).neq("vin", "");
  else if (vin === "no") q = q.or('vin.is.null,vin.eq.""');
  const photos = params.get("hasPhotos");
  if (photos === "yes") q = q.not("images", "is", null).neq("images", "{}");
  else if (photos === "no") q = q.or("images.is.null,images.eq.{}");
  const days = Number(params.get("seenWithin"));
  if ([1, 7, 30].includes(days))
    q = q.gte("last_seen_at", new Date(now - days * 86400000).toISOString());
  return q;
}
