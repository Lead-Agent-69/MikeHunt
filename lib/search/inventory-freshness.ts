import { STALE_AFTER_HOURS } from "@/lib/deals/freshness";

export const INVENTORY_FRESHNESS_OPTIONS = [
  {
    value: "3",
    days: 3,
    label: "Fresh",
    shortLabel: "3 days",
    description: "Observed within the last 3 days",
  },
  {
    value: "7",
    days: 7,
    label: "Recent",
    shortLabel: "7 days",
    description: "Recently checked; confirm availability with the seller",
  },
  {
    value: "30",
    days: 30,
    label: "Archive",
    shortLabel: "30 days",
    description: "Research history; recheck before relying on the listing",
  },
] as const;

export type InventoryFreshnessValue =
  (typeof INVENTORY_FRESHNESS_OPTIONS)[number]["value"];

const SUPPORTED_OBSERVED_DAYS = new Set([1, 3, 7, 30]);

/** Accept old one-day links while keeping the primary product at 3, 7 and 30 days. */
export function inventoryObservedDays(value: unknown): number | undefined {
  const days = Number(value);
  return SUPPORTED_OBSERVED_DAYS.has(days) ? days : undefined;
}

export function inventoryFreshnessValue(
  value: unknown,
): InventoryFreshnessValue {
  const days = inventoryObservedDays(value);
  if (days === 7) return "7";
  if (days === 30) return "30";
  return "3";
}

export function inventoryFreshnessOption(value: unknown) {
  const selected = inventoryFreshnessValue(value);
  return INVENTORY_FRESHNESS_OPTIONS.find(
    (option) => option.value === selected,
  )!;
}

export const DEFAULT_INVENTORY_FRESHNESS_DAYS = STALE_AFTER_HOURS / 24;
