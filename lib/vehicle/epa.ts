// Free EPA fuel-economy data (fueleconomy.gov) — no key. Two-step: year/make/model → trim options →
// MPG for the first matching trim. Pure parser + best-effort fetch. Approximate at the trim level.

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; json: () => Promise<any> }>;

const JSON_HEADERS = { headers: { Accept: "application/json" } };

export interface FuelEconomy {
  city: number | null;
  highway: number | null;
  combined: number | null;
}

function mpg(v: any): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Parse a fueleconomy.gov vehicle record into city/highway/combined MPG. */
export function parseFuelEconomy(d: any): FuelEconomy {
  return {
    city: mpg(d?.city08),
    highway: mpg(d?.highway08),
    combined: mpg(d?.comb08),
  };
}

export async function getFuelEconomy(
  make: string,
  model: string,
  year: number,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<FuelEconomy | null> {
  if (!make || !model || !year) return null;
  try {
    const res1 = await fetchImpl(
      `https://www.fueleconomy.gov/ws/rest/vehicle/menu/options?year=${year}&make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`,
      JSON_HEADERS,
    );
    if (!res1.ok) return null;
    const b1 = await res1.json();
    const items = Array.isArray(b1?.menuItem)
      ? b1.menuItem
      : b1?.menuItem
        ? [b1.menuItem]
        : [];
    const id = items[0]?.value;
    if (!id) return null;
    const res2 = await fetchImpl(
      `https://www.fueleconomy.gov/ws/rest/vehicle/${id}`,
      JSON_HEADERS,
    );
    if (!res2.ok) return null;
    const fe = parseFuelEconomy(await res2.json());
    return fe.city || fe.highway || fe.combined ? fe : null;
  } catch {
    return null;
  }
}
