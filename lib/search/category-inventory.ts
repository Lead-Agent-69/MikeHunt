import { rowMatchesBuyerQuery } from "@/lib/discovery/for-you-rank";

export const CATEGORY_PROJECTION =
  "id,title,year,make,model,trim,condition,damage_type,location_city,location_state";

/** Classify the complete scoped projection before slicing, never just one display page. */
export async function matchingCategoryIds(
  load: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Array<{
      id: string;
      make?: string;
      model?: string;
      title?: string;
    }> | null;
    error: unknown;
  }>,
  query: string,
  maxRows = 20000,
): Promise<string[]> {
  const matches: string[] = [];
  const chunk = 1000;
  for (let from = 0; from < maxRows; from += chunk) {
    const { data, error } = await load(from, from + chunk - 1);
    if (error) throw error;
    const rows = data || [];
    matches.push(
      ...rows
        .filter((row) => rowMatchesBuyerQuery(row, query))
        .map((row) => row.id),
    );
    if (rows.length < chunk) return matches;
  }
  // Refuse an incomplete count instead of silently stranding remaining inventory.
  throw new Error(
    "Vehicle category search exceeds its safe scope. Narrow the selected markets.",
  );
}
