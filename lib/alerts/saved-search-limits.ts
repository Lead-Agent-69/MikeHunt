/**
 * Server-side limits for saved searches (Ren, saved-search grants hole).
 *
 * The database caps each user at MAX_SAVED_SEARCHES_PER_USER rows (trigger in
 * 20261010151000_saved_search_grants_bounds.sql). Every server job that fans out over
 * user_saved_searches (instant alerts in lib/scrapers/pipeline.ts, the daily digest from #317)
 * must also:
 *   1. read searches in a deterministic ORDER (user_id, created_at, id) — use SAVED_SEARCH_ORDER,
 *   2. process at most MAX_SAVED_SEARCHES_PER_USER per user (capSearchesPerUser), so rows that
 *      predate the trigger, or a service-role bug, can't flood one user's inbox / email / SMS,
 *   3. only act on an inbox row when its search belongs to the same user (rowsOwnedBySearchUser).
 */
export const MAX_SAVED_SEARCHES_PER_USER = 50;

/** Ordering for every server read of user_saved_searches. Apply in this order. */
export const SAVED_SEARCH_ORDER = ["user_id", "created_at", "id"] as const;

type SearchLike = { id: string; user_id: string; created_at?: string | null };

function cmp(a: string | null | undefined, b: string | null | undefined) {
  const x = a ?? "";
  const y = b ?? "";
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Keep the oldest `cap` searches per user (deterministic even if the query order was lost). */
export function capSearchesPerUser<T extends SearchLike>(
  searches: readonly T[],
  cap: number = MAX_SAVED_SEARCHES_PER_USER,
): T[] {
  const sorted = [...searches].sort(
    (a, b) =>
      cmp(a.user_id, b.user_id) ||
      cmp(a.created_at, b.created_at) ||
      cmp(a.id, b.id),
  );
  const perUser = new Map<string, number>();
  const out: T[] = [];
  for (const s of sorted) {
    if (!s.user_id) continue;
    const n = perUser.get(s.user_id) ?? 0;
    if (n >= cap) continue;
    perUser.set(s.user_id, n + 1);
    out.push(s);
  }
  return out;
}

/** Drop inbox rows whose search_id is unknown or belongs to a different user than the row. */
export function rowsOwnedBySearchUser<
  R extends { user_id: string; search_id: string | null },
>(rows: readonly R[], searches: readonly SearchLike[]): R[] {
  const owner = new Map(searches.map((s) => [s.id, s.user_id]));
  return rows.filter(
    (r) => r.search_id != null && owner.get(r.search_id) === r.user_id,
  );
}
