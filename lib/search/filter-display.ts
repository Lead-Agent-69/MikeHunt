import { humanizeEnumLabel, sourceMeta } from "@/lib/sources/source-meta";

const ENUM_LABELS = new Set([
  "Title",
  "Lane",
  "Availability",
  "Seller",
  "Drive",
  "Damage",
  "Body",
  "Fuel",
  "Transmission",
  "Verdict",
]);

export function filterDisplayValue(label: string, value: string): string {
  if (label === "Source") return sourceMeta(value).label;
  return ENUM_LABELS.has(label) ? humanizeEnumLabel(value) : value;
}
