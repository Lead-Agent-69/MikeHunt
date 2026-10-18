export type SourceCoverage = {
  counts: Record<string, number>;
  complete: boolean;
  accessReviewIds: string[];
};

/** Counts describe this indexed search, never a source's health or full inventory. */
export function sourceMatchLabel(
  id: string,
  coverage?: SourceCoverage,
  options: { busy?: boolean; error?: boolean } = {},
) {
  if (options.busy) return "Updating matches";
  if (options.error || !coverage) return "Count not verified";
  const count = coverage.counts[id] ?? 0;
  if (count > 0)
    return `${coverage.complete ? "" : "At least "}${count.toLocaleString()} indexed ${count === 1 ? "match" : "matches"}`;
  return coverage.complete ? "No matches in this search" : "Count incomplete";
}
