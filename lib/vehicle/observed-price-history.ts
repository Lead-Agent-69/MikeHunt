import { readJsonCapped } from "./deadline";

/** Price-history bodies are a few KB; refuse anything past 2 MB (cancelled mid-stream). */
export const OBSERVED_PRICES_MAX_BYTES = 2 * 1024 * 1024;

export type ObservedPrice = { price: number; observedAt: string };

export function normalizeObservedPrices(value: unknown): ObservedPrice[] {
  const records = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "history" in value
      ? (value as { history: unknown }).history
      : [];
  if (!Array.isArray(records)) return [];
  const points = new Map<number, ObservedPrice>();
  for (const row of records) {
    if (!row || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const price =
      typeof raw.price === "number" || typeof raw.price === "string"
        ? Number(raw.price)
        : NaN;
    const date = raw.observedAt ?? raw.observed_at ?? raw.created_at;
    const at = typeof date === "string" ? Date.parse(date) : NaN;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(at)) continue;
    points.set(at, { price, observedAt: new Date(at).toISOString() });
  }
  return Array.from(points.entries())
    .sort(([a], [b]) => a - b)
    .map(([, point]) => point);
}

export async function fetchObservedPrices(
  url: string,
): Promise<ObservedPrice[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Price history unavailable");
  const data: unknown = await readJsonCapped(
    response,
    OBSERVED_PRICES_MAX_BYTES,
  );
  if (
    !Array.isArray(data) &&
    !(
      data &&
      typeof data === "object" &&
      "history" in data &&
      Array.isArray(data.history)
    )
  ) {
    throw new Error("Price history unavailable");
  }
  return normalizeObservedPrices(data);
}
