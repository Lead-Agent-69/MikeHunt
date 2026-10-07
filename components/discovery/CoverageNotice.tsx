"use client";

import Link from "next/link";
import { Info, Radar } from "lucide-react";
import type { DiscoverCoverage } from "@/lib/discovery/coverage";
import { coverageNotice } from "@/lib/discovery/coverage-notice";
import { usePreferences } from "@/hooks/usePreferences";
import { isLocationDemandWarming } from "@/lib/preferences/kick-location-demand";

/** Honest coverage note on Discover. Renders nothing unless coverage is thin/none (or scanning). */
export function CoverageNotice({
  coverage,
}: {
  coverage: DiscoverCoverage | null | undefined;
}) {
  const { prefs } = usePreferences();
  const warming = isLocationDemandWarming(prefs);
  const notice = coverageNotice(coverage, {
    scanning: warming.scanning,
    states: warming.states.length ? warming.states : coverage?.states,
  });
  if (!notice) return null;
  const Icon = notice.tone === "scanning" ? Radar : Info;
  return (
    <div
      role="status"
      data-testid="coverage-notice"
      data-tone={notice.tone}
      className="flex items-start gap-3 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s1)] px-4 py-3 text-sm"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t3)]" aria-hidden />
      <div className="min-w-0">
        <p className="font-bold text-[var(--t1)]">{notice.headline}</p>
        <p className="mt-0.5 text-[var(--t3)]">{notice.detail}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
          <Link href="/settings" className="text-[var(--t2)] underline">
            Add search locations in Settings
          </Link>
          <Link href="/searches" className="text-[var(--t2)] underline">
            Save a search and get alerts
          </Link>
        </div>
      </div>
    </div>
  );
}
