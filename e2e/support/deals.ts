import type { APIRequestContext } from "@playwright/test";

type Picked = { id: string; title: string; hasHistory: boolean };
let cached: Picked | null = null; // per worker: keeps /api/deals under its 60/min rate limit

/** Finds an active deal with >=2 observed prices (for the price-history panel), else any deal. */
export async function pickDeal(request: APIRequestContext): Promise<Picked> {
  if (cached) return cached;
  const res = await request.get("/api/deals?limit=15&sortBy=lastSeenAt");
  if (!res.ok()) throw new Error(`/api/deals -> ${res.status()}`);
  const { deals } = (await res.json()) as {
    deals: { id: string; title: string }[];
  };
  if (!deals?.length)
    throw new Error("no active deals; seed the local DB first");
  const histories = await Promise.all(
    deals.map(async (d) => {
      const ph = await request
        .get(`/api/deals/${d.id}/price-history`)
        .catch(() => null);
      const body = ph && ph.ok() ? await ph.json().catch(() => null) : null;
      return Array.isArray(body) && body.length >= 2;
    }),
  );
  const i = histories.findIndex(Boolean);
  cached =
    i >= 0
      ? { ...deals[i], hasHistory: true }
      : { ...deals[0], hasHistory: false };
  return cached;
}
