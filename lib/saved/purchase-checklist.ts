/**
 * /fleet "Purchase plan" checklist data path.
 *
 * Before: FlipDeskGate held the page on "Loading…" until /api/preferences resolved, and only then
 * mounted PurchasePipeline, which fetched /api/saved-cars — two serial auth'd lambda round trips
 * — and that GET returned `select("*")` (every saved snapshot JSON, images and analysis included)
 * with no row limit, though the checklist renders only id/status/tags/year/make/model.
 *
 * After: the gate preloads this key in parallel with preferences, and the checklist asks for the
 * slim `view=checklist` projection (bounded).
 */

export const PURCHASE_CHECKLIST_KEY =
  "/api/saved-cars?filter=all&view=checklist";

/** Upper bound on one saved-cars GET. A watchlist this big is far past what the page renders. */
export const SAVED_CARS_LIMIT = 500;

/** PostgREST projection for the checklist: no full snapshot JSON. */
export const CHECKLIST_SELECT =
  "id,deal_id,status,tags,saved_at,snapshot_year:snapshot->year,snapshot_make:snapshot->>make,snapshot_model:snapshot->>model";

export type PurchaseChecklistRow = {
  id: string;
  deal_id: string;
  status: string;
  tags?: string[];
  saved_at?: string | null;
  snapshot: { year?: number; make?: string; model?: string };
};

export function toChecklistRow(row: any): PurchaseChecklistRow {
  // Accept either the slim projection or a full row (fallback path).
  const snap = row?.snapshot || {};
  const year = row?.snapshot_year ?? snap.year;
  return {
    id: String(row?.id),
    deal_id: row?.deal_id,
    status: row?.status,
    tags: Array.isArray(row?.tags) ? row.tags : [],
    saved_at: row?.saved_at ?? null,
    snapshot: {
      year: year == null || year === "" ? undefined : Number(year),
      make: row?.snapshot_make ?? snap.make ?? undefined,
      model: row?.snapshot_model ?? snap.model ?? undefined,
    },
  };
}

export async function fetchPurchaseChecklist(
  url: string,
): Promise<PurchaseChecklistRow[]> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("We couldn't load your purchase checklist.");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("Unconfirmed saved vehicles");
  return rows;
}
