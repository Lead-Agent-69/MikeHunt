"use client";

import { Info, RotateCcw } from "lucide-react";
import {
  sourceAvailabilityNotice,
  type SourceAvailability,
} from "@/lib/search/source-availability";

export function SearchSourceNotice({
  onRetry,
  ...evidence
}: {
  sources?: SourceAvailability[];
  error?: boolean;
  loading?: boolean;
  configured?: boolean;
  onRetry: () => void;
}) {
  const notice = sourceAvailabilityNotice(evidence);
  if (!notice) return null;
  return (
    <aside
      role="status"
      aria-label="Source coverage"
      className="flex items-start gap-3 border-y border-[var(--b1)] py-3 text-sm"
    >
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t3)]"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{notice.title}</p>
        <p className="mt-1 text-xs text-[var(--t3)]">{notice.detail}</p>
        {notice.retry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--blue)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Recheck coverage
          </button>
        )}
      </div>
    </aside>
  );
}
