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
  opts: { pageSize?: number; max?: number; concurrency?: number } = {},
): Promise<T[]> {
  const pageSize = Math.max(1, opts.pageSize ?? 1000);
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const concurrency = Number.isFinite(opts.concurrency)
    ? Math.max(1, Math.min(4, Math.floor(opts.concurrency!)))
    : 1;
  const out: T[] = [];
  for (let start = 0; start < max; start += pageSize * concurrency) {
    const ranges = Array.from({ length: concurrency }, (_, offset) => {
      const from = start + offset * pageSize;
      return { from, to: Math.min(from + pageSize, max) - 1 };
    }).filter(({ from }) => from < max);
    const results = await Promise.all(
      ranges.map(({ from, to }) => page(from, to)),
    );
    // A failed page cannot masquerade as a complete count or market summary.
    for (const result of results) if (result.error) throw result.error;
    for (let i = 0; i < results.length; i++) {
      const data = results[i].data;
      if (!data?.length) return out;
      out.push(...data);
      if (data.length < ranges[i].to - ranges[i].from + 1) return out;
    }
  }
  return out;
}
