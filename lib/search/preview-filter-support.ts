const unsupportedFilters = [
  "damage",
  "body",
  "trim",
  "fuelType",
  "transmission",
  "keys",
  "availability",
  "drivetrain",
  "verdict",
  "category",
  "minProfit",
  "madeInUsa",
  "buyNow",
  "dealers",
  "dealerSourceIds",
] as const;

export const previewFilterMessage =
  "Source previews can't verify all of these filters yet. Existing inventory search still uses them; adjust the filters to preview additional vehicles.";

export function unsupportedPreviewFilters(params: URLSearchParams) {
  return unsupportedFilters.filter((key) => {
    const value = params.get(key)?.trim();
    return value && !["all", "any", "0", "false"].includes(value);
  });
}
