"use client";

// Segment error boundary for the DealerHunt (cars) app. Catches errors within the dashboard content so
// the nav/shell stays intact and the user recovers IN PLACE (retry) instead of a full-page reset. Reports
// to Sentry.

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="glass-panel max-w-sm w-full p-6 text-center space-y-4">
        <div className="text-3xl">⚠️</div>
        <div>
          <h2 className="text-lg font-bold text-[var(--t1)]">
            This view hit a snag
          </h2>
          <p className="text-sm text-[var(--t3)] mt-1">
            It’s been logged. Your session and the rest of the app are fine —
            try again.
          </p>
        </div>
        <button
          onClick={() => reset()}
          className="text-sm font-bold rounded-xl px-5 py-2.5 text-white border-none min-h-[44px]"
          style={{ background: "var(--grad)" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
