import type { Deal } from "@/types";

const text = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Without a VIN, require exact vehicle identity, price and odometer, and a unique match. */
export function matchingDealerListing(
  row: Partial<Deal>,
  candidates: Partial<Deal>[],
): Partial<Deal> | null {
  const matches = candidates.filter((candidate) => {
    if (row.vin)
      return Boolean(candidate.vin) && text(row.vin) === text(candidate.vin);
    return (
      Boolean(
        row.year &&
        row.make &&
        row.model &&
        row.ask_price &&
        row.mileage != null,
      ) &&
      row.year === candidate.year &&
      text(row.make) === text(candidate.make) &&
      text(row.model) === text(candidate.model) &&
      row.ask_price === candidate.ask_price &&
      row.mileage === candidate.mileage
    );
  });
  const unique = new Map(
    matches.filter((row) => row.source_url).map((row) => [row.source_url, row]),
  );
  return unique.size === 1 ? Array.from(unique.values())[0] : null;
}
