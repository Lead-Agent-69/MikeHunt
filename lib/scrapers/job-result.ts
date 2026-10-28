import type { ScrapeResult } from "@/types";

function count(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value!)) : 0;
}

export function summarizeScopedScrapeResults(results: ScrapeResult[]) {
  const successful = results.filter(
    (result) => result.success && !result.simulated,
  ).length;
  const simulated = results.filter((result) => result.simulated).length;
  return {
    total: results.length,
    successful,
    failed: results.length - successful - simulated,
    simulated,
    totalDeals: results.reduce(
      (sum, result) => sum + (result.simulated ? 0 : count(result.dealsFound)),
      0,
    ),
    totalSaved: results.reduce(
      (sum, result) => sum + (result.simulated ? 0 : count(result.dealsSaved)),
      0,
    ),
    totalDuration: results.reduce(
      (sum, result) => sum + count(result.duration),
      0,
    ),
    results,
  };
}

/** Customer status excludes runner metadata and provider error payloads. */
export function publicScopedScrapeSummary(
  result: Record<string, unknown> | null,
) {
  if (!result) return null;
  const rows = Array.isArray(result.results) ? result.results : [];
  return {
    total: count(result.total as number),
    successful: count(result.successful as number),
    failed: count(result.failed as number),
    totalDeals: count(result.totalDeals as number),
    totalSaved: count(result.totalSaved as number),
    totalDuration: count(result.totalDuration as number),
    results: rows.map((row) => ({
      source: typeof row?.source === "string" ? row.source : "unknown",
      success: row?.success === true,
      dealsFound: row?.simulated === true ? 0 : count(row?.dealsFound),
      dealsSaved: row?.simulated === true ? 0 : count(row?.dealsSaved),
      ...(row?.simulated === true ? { simulated: true } : {}),
      ...(typeof row?.persistenceVerified === "boolean"
        ? { persistenceVerified: row.persistenceVerified }
        : {}),
      duration: count(row?.duration),
      ...(row?.success === true
        ? {}
        : {
            error:
              "This source could not be checked. Try again later or choose another source.",
          }),
    })),
  };
}
