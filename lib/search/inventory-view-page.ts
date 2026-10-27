import { cached } from "@/lib/cache";
import { hasVehicleCategoryQuery } from "@/lib/discovery/for-you-rank";
import { CATEGORY_PROJECTION, matchingCategoryIds } from "./category-inventory";

/** Classify the complete scoped inventory before display pagination, just as Scan does.
 * Every query is fresh: PostgREST builders mutate their projection/range/filter state.
 * The caller supplies the same radius, source, eligibility and stable ordering each time.
 */
export function inventoryViewPage(
  build: (columns: string, params: URLSearchParams) => any,
  params: URLSearchParams,
  columns: string,
  cachePartition?: string,
) {
  const query = params.get("q") || "";
  if (!hasVehicleCategoryQuery(query))
    return (from: number, to: number) => build(columns, params).range(from, to);

  const scope = new URLSearchParams(params);
  scope.delete("q");
  const key = new URLSearchParams(params);
  for (const name of ["offset", "limit", "page", "pageSize"]) key.delete(name);
  key.sort();
  let pending: Promise<string[]> | undefined;
  const load = () =>
    matchingCategoryIds(
      (from, to) => build(CATEGORY_PROJECTION, scope).range(from, to),
      query,
    );
  const ids = () =>
    (pending ??= cachePartition
      ? cached(
          `view-category:${cachePartition}:${key}`,
          15_000,
          load,
          undefined,
          {
            prefix: "view-category:",
            maxEntries: 40,
          },
        )
      : load());
  return async (from: number, to: number) => {
    const selected = (await ids()).slice(from, to + 1);
    const rows: any[] = [];
    // Bound URL length as well as the response size; a map can request 1,000 IDs.
    for (let start = 0; start < selected.length; start += 100) {
      const batch = selected.slice(start, start + 100);
      const result = await build(columns, scope)
        .in("id", batch)
        .range(0, batch.length - 1);
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
    }
    return { data: rows, error: null };
  };
}
