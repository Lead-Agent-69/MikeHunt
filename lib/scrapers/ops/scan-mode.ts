/**
 * Incremental vs full-scan per source. Incremental runs let adapters skip pages that are unchanged
 * since last time (HTTP 304 via ETag/Last-Modified, or the same content hash); a full rescan every
 * `fullRescanHours` (default 24, SCRAPER_FULL_RESCAN_HOURS) re-reads everything so last_seen_at keeps
 * advancing and nothing is demoted as stale by mistake (demotion is at 30 days).
 *
 * Off by default (every source runs full, exactly as before). Opt in per source with registry
 * `polite.incremental: true`, or SCRAPER_INCREMENTAL_SOURCES=a,b (or "all").
 */
import type { ScanMode } from "./run-telemetry";
import { sourceTuning } from "./source-breaker";
import { normalizeExemptId } from "../polite/robots-exempt";

export function incrementalEnabled(
  sourceId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const list = String(env.SCRAPER_INCREMENTAL_SOURCES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.includes("all")) return true;
  if (list.map(normalizeExemptId).includes(normalizeExemptId(sourceId)))
    return true;
  return sourceTuning(sourceId).incremental === true;
}

export function fullRescanHours(
  sourceId: string,
  env: Record<string, string | undefined> = process.env,
): number {
  const t = sourceTuning(sourceId).fullRescanHours;
  const e = Number(env.SCRAPER_FULL_RESCAN_HOURS);
  const h = t ?? (Number.isFinite(e) && e > 0 ? e : 24);
  return Math.min(24 * 14, Math.max(1, h));
}

export function decideScanMode(
  sourceId: string,
  lastFullScanAt: string | null | undefined,
  now: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): ScanMode {
  if (!incrementalEnabled(sourceId, env)) return "full";
  const last = lastFullScanAt ? Date.parse(lastFullScanAt) : NaN;
  if (!Number.isFinite(last)) return "full";
  return now - last >= fullRescanHours(sourceId, env) * 3_600_000
    ? "full"
    : "incremental";
}
