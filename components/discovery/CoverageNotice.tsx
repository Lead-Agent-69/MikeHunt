"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import type { DiscoverCoverage } from "@/lib/discovery/coverage";
import { coverageNotice } from "@/lib/discovery/coverage-notice";

/** Honest coverage note on Discover. Renders nothing unless coverage is thin or none. */
export function CoverageNotice({
  coverage,
}: {
  coverage: DiscoverCoverage | null | undefined;
}) {
  const notice = coverageNotice(coverage);
  if (!notice) return null;
  return (
    <div
      role="status"
      data-testid="coverage-notice"
      className="flex items-start gap-3 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s1)] px-4 py-3 text-sm"
    >
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t3)]" aria-hidden />
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
