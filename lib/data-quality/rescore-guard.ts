// lib/data-quality/rescore-guard.ts
// Rescore paths (app/api/admin/rescore, scripts/rescore-*.ts) must never put profit, verdict or max bid
// back on a sanity-flagged row (20261010210000: flagged rows are kept but never scored). A row is
// skipped when its stored quality_flags is non-empty OR the pure ingest check flags it now, so the
// guard also holds before the column exists on hosted and for flags (make_unknown) that are only set
// on the next re-ingest. Pure, no I/O.

import { isQualityFlagged, qualityFlags } from "@/lib/data-quality/sanity";

export interface RescoreRow {
  quality_flags?: readonly string[] | null;
  ask_price?: number | null;
  mileage?: number | null;
  year?: number | null;
  vin?: string | null;
  make?: string | null;
  source?: string | null;
  auction_end_at?: string | null;
}

/** Reasons this row must not be rescored. Empty = rescore is allowed. */
export function rescoreSkipReasons(
  row: RescoreRow,
  now: Date = new Date(),
): string[] {
  if (isQualityFlagged(row.quality_flags)) return [...row.quality_flags!];
  return qualityFlags(
    {
      ask_price: row.ask_price,
      mileage: row.mileage,
      year: row.year,
      vin: row.vin,
      make: row.make,
      source: row.source,
      auction_end_at: row.auction_end_at,
    },
    now,
  );
}

export function shouldSkipRescore(row: RescoreRow, now?: Date): boolean {
  return rescoreSkipReasons(row, now).length > 0;
}
