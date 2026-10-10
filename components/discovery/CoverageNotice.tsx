"use client";

import Link from "next/link";
import { Info, RotateCcw } from "lucide-react";
import type { DiscoverCoverage } from "@/lib/discovery/coverage";
import { coverageNotice } from "@/lib/discovery/coverage-notice";
import { usePreferences } from "@/hooks/usePreferences";
import { isLocationDemandWarming } from "@/lib/preferences/location-demand-warming";

/** Honest coverage note on Discover. Renders nothing unless coverage is thin/none (or scanning). */
export function CoverageNotice({
  coverage,
  onRetry,
  isRefreshing = false,
}: {
  coverage: DiscoverCoverage | null | undefined;
  onRetry?: () => void;
  isRefreshing?: boolean;
}) {
  const { prefs } = usePreferences();
  const warming = isLocationDemandWarming(prefs);
  const notice = coverageNotice(coverage, {
    scanning: warming.scanning,
    states: warming.states.length ? warming.states : coverage?.states,
  });
  if (!notice) return null;
  return (
    <div
      role="status"
      data-testid="coverage-notice"
      data-tone={notice.tone}
      className="flex items-start gap-3 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s1)] px-4 py-3 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t3)]" aria-hidden />
      <div className="min-w-0">
        <p className="font-bold text-[var(--t1)]">{notice.headline}</p>
        <details
          className="mt-1 text-[var(--t2)]"
          open={notice.tone === "unavailable" ? true : undefined}
        >
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
            About these results
          </summary>
          <p className="pb-2 text-sm">{notice.detail}</p>
        </details>
        {notice.tone === "unavailable" ? (
          onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={isRefreshing}
              aria-busy={isRefreshing}
              className="inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[var(--blue)] disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {isRefreshing ? "Refreshing results" : "Try again"}
            </button>
          )
        ) : (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
            <Link
              href="/settings"
              className="inline-flex min-h-11 items-center text-[var(--t2)] underline"
            >
              Change search area
            </Link>
            <Link
              href="/searches"
              className="inline-flex min-h-11 items-center text-[var(--t2)] underline"
            >
              Get match alerts
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
