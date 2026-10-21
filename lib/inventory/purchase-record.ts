import { actualAmount, uuid } from "@/lib/outcomes/ledger";
import { listingPhotos } from "@/lib/search/customer-inventory";

const moneyFields = {
  purchasePrice: "purchase_price",
  auctionFee: "auction_fee",
  transportCost: "transport_cost",
  repairCost: "repair_cost",
  reconCost: "recon_cost",
  titleFee: "title_fee",
  holdingCost: "holding_cost",
  otherCosts: "other_costs",
  listPrice: "list_price",
  marketValue: "market_value",
} as const;
const textFields = {
  vin: 17,
  make: 100,
  model: 150,
  trim: 150,
  condition: 100,
  purchasedFrom: 500,
  purchasedCity: 150,
  purchasedState: 100,
  notes: 5000,
} as const;

/** Validate actual purchase input before any database writes. Unknowns stay unknown. */
export function validatePurchase(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { error: "Send a JSON object." } as const;
  const body = input as Record<string, unknown>;
  if (!uuid(body.id))
    return {
      error: "A valid purchase record id is required for safe retries.",
    } as const;
  if (body.dealId != null && !uuid(body.dealId))
    return { error: "Invalid source listing id." } as const;
  if (body.stage != null && body.stage !== "acquired")
    return {
      error:
        "New purchases must start at Acquired. Record later stages in Pipeline.",
    } as const;
  const purchaseDate = body.purchaseDate;
  const purchasedAt =
    typeof purchaseDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)
      ? Date.parse(`${purchaseDate}T00:00:00.000Z`)
      : NaN;
  if (
    !Number.isFinite(purchasedAt) ||
    new Date(purchasedAt).toISOString().slice(0, 10) !== purchaseDate ||
    purchasedAt > Date.now() ||
    purchaseDate! < "1886-01-01"
  )
    return {
      error: "Enter the actual purchase date, today or earlier.",
    } as const;
  const amounts: Record<string, number | null> = {};
  for (const [key, column] of Object.entries(moneyFields)) {
    const optionalReference = key === "listPrice" || key === "marketValue";
    if (body[key] === undefined && key !== "purchasePrice") {
      amounts[column] = optionalReference ? null : 0;
      continue;
    }
    if (optionalReference && body[key] === null) {
      amounts[column] = null;
      continue;
    }
    const amount =
      typeof body[key] === "number" ? actualAmount(body[key]) : null;
    if (amount === null)
      return {
        error: `Enter a non-negative ${key.replace(/([A-Z])/g, " $1").toLowerCase()} with at most two decimal places (maximum $100,000,000).`,
      } as const;
    amounts[column] = amount;
  }
  const texts: Record<string, string> = {};
  for (const [key, max] of Object.entries(textFields)) {
    const value = body[key];
    if (
      value != null &&
      (typeof value !== "string" || value.trim().length > max)
    )
      return {
        error: `Check the ${key.replace(/([A-Z])/g, " $1").toLowerCase()} field.`,
      } as const;
    texts[key] = typeof value === "string" ? value.trim() : "";
  }
  texts.vin = texts.vin.toUpperCase();
  if (texts.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(texts.vin))
    return { error: "Enter a 17-character VIN or leave it unknown." } as const;
  const year = body.year ?? 0;
  if (
    typeof year !== "number" ||
    !Number.isInteger(year) ||
    (year !== 0 && (year < 1886 || year > new Date().getUTCFullYear() + 2))
  )
    return { error: "Check the vehicle year or leave it unknown." } as const;
  if (!body.dealId && !texts.vin && !(texts.make && texts.model))
    return {
      error:
        "Provide a source listing, VIN, or make and model to identify this purchase.",
    } as const;
  if (
    body.photos != null &&
    (!Array.isArray(body.photos) ||
      body.photos.length > 100 ||
      body.photos.some(
        (url: unknown) =>
          typeof url !== "string" ||
          !/^https?:\/\//i.test(url) ||
          url.length > 4000,
      ))
  )
    return { error: "Check the purchase photos." } as const;
  if (
    body.listedPlatforms != null &&
    (!Array.isArray(body.listedPlatforms) ||
      body.listedPlatforms.length > 25 ||
      body.listedPlatforms.some(
        (name: unknown) => typeof name !== "string" || name.length > 100,
      ))
  )
    return { error: "Check the listed platforms." } as const;
  return {
    value: {
      id: body.id.toLowerCase(),
      dealId:
        typeof body.dealId === "string" ? body.dealId.toLowerCase() : null,
      year,
      purchasedAt: new Date(purchasedAt).toISOString(),
      texts,
      amounts,
      photos: listingPhotos(body.photos, 100),
      listedPlatforms: (body.listedPlatforms ?? []) as string[],
    },
  } as const;
}

export type PurchaseInput = NonNullable<
  ReturnType<typeof validatePurchase>["value"]
>;

/** Do not overwrite a saved purchase, including after a lost acknowledgement. */
export function samePurchase(row: Record<string, any>, input: PurchaseInput) {
  return (
    row.id === input.id &&
    String(row.floor_date).slice(0, 10) === input.purchasedAt.slice(0, 10) &&
    (row.deal_id ?? null) === input.dealId &&
    Object.entries(input.amounts).every(([key, value]) =>
      value === null ? row[key] == null : Number(row[key] ?? 0) === value,
    ) &&
    (row.condition || "unknown") === (input.texts.condition || "unknown") &&
    (!input.texts.vin || row.vin === input.texts.vin) &&
    (!input.year || row.year === input.year) &&
    ["make", "model"].every(
      (key) =>
        !input.texts[key] ||
        String(row[key]).toLowerCase() === input.texts[key].toLowerCase(),
    )
  );
}

/** Store only an opaque retry id, scoped to the account and listing in this tab. */
export function purchaseRetryId(ownerId: string, listingKey: string) {
  const key = `purchase-record:v1:${ownerId}:${listingKey}`;
  try {
    const saved = sessionStorage.getItem(key);
    if (uuid(saved)) return saved;
  } catch {
    /* A blocked store still allows retries within the mounted form. */
  }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(key, id);
  } catch {
    /* See above. */
  }
  return id;
}
