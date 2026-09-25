// lib/db/paginate.ts
//
// One shared fix for the recurring PostgREST 1000-row cap. A single Supabase/PostgREST response is capped
// (this project caps at 1000), so any reader that needs the whole set must page with `.range()`. That loop
// was hand-written (subtly differently) in lib/housing/store.ts and lib/data/deals-service.ts and MISSING
// in several API routes (e.g. deals/map silently dropped everything past 1000). This centralizes it.
//
// Usage — pass a factory that builds the SAME query for a given [from,to] range:
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from("deals").select("...").eq("active", true).order("x").range(from, to),
//   { max: 5000 });

export interface PageResult<T> {
  data: T[] | null;
  error: unknown;
}

/**
 * Fetch every row across PostgREST's per-response cap by paging `.range(from,to)` until a short page.
 * `pageSize` defaults to 1000 (the cap). `max` bounds the total pulled (default unbounded). Throws on error.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  opts: { pageSize?: number; max?: number } = {},
): Promise<T[]> {
  const pageSize = Math.max(1, opts.pageSize ?? 1000);
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const out: T[] = [];
  for (let from = 0; from < max; from += pageSize) {
    const to = Math.min(from + pageSize, max) - 1;
    const { data, error } = await page(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < to - from + 1) break; // short page → done
  }
  return out;
}
