export const SAVED_PAGE_SIZE = 50;
export type SavedCursor = { savedAt: string | null; id: string };
export type SavedPage = {
  ownerId: string;
  rows: any[];
  nextCursor: string | null;
};

export function parseSavedCursor(value: string): SavedCursor {
  if (value.length > 200) throw new Error("Invalid saved cursor");
  const cursor = JSON.parse(value);
  if (
    !cursor ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      cursor.id,
    ) ||
    !(
      cursor.savedAt === null ||
      (typeof cursor.savedAt === "string" &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
          cursor.savedAt,
        ) &&
        Number.isFinite(Date.parse(cursor.savedAt)))
    )
  )
    throw new Error("Invalid saved cursor");
  return { id: cursor.id, savedAt: cursor.savedAt };
}

export function savedCollectionKey(
  ownerId: string,
  view: string,
  filter: string,
  cursor?: string | null,
) {
  const params = new URLSearchParams({ view, filter });
  if (cursor) params.set("cursor", cursor);
  return [`/api/saved-cars?${params}`, ownerId] as const;
}

export async function fetchSavedPage([url, ownerId]: readonly [
  string,
  string,
]): Promise<SavedPage> {
  const response = await fetch(url, {
    headers: { "X-Save-Owner": ownerId },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error("Your saved vehicles could not be loaded. Please retry.");
  const page = await response.json();
  if (
    !page ||
    page.ownerId !== ownerId ||
    !Array.isArray(page.rows) ||
    page.rows.length > SAVED_PAGE_SIZE ||
    page.rows.some(
      (row: any) => !row || typeof row.id !== "string" || !row.id,
    ) ||
    !(page.nextCursor === null || typeof page.nextCursor === "string")
  )
    throw new Error("Unconfirmed saved collection");
  if (page.nextCursor !== null) parseSavedCursor(page.nextCursor);
  return page;
}

export function savedGroup(status: string | null) {
  if (["price_drop", "price_increase", "ending_soon"].includes(status || ""))
    return "attention";
  if (["active", "watching"].includes(status || "")) return "active";
  if (status === "unavailable") return "gone";
  if (status === "acquired") return "acquired";
  return "other";
}
