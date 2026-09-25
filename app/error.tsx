"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Ico } from "@/components/shared/Ico";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Actually report the error (the copy below promises "this has been logged") so it shows in monitoring.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--s1)]">
      <div className="glass-panel max-w-md w-full p-6 md:p-8 text-center space-y-6">
        <div
          className="w-16 h-16 mx-auto rounded-full flex items-center justify-center"
          style={{
            background: "rgba(239,91,107,0.12)",
            border: "1px solid var(--rbd)",
          }}
        >
          <Ico name="alert-triangle" size={32} className="text-[var(--red)]" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-[var(--t1)]">
            Something went wrong
          </h2>
          <p className="text-sm text-[var(--t3)]">
            We encountered an unexpected error. This has been logged and we'll
            look into it.
          </p>
        </div>

        {process.env.NODE_ENV === "development" && (
          <details className="text-left">
            <summary className="cursor-pointer text-xs font-bold text-[var(--t4)] uppercase tracking-wider mb-2">
              Error Details
            </summary>
            <div
              className="rounded-[var(--r2)] p-3 text-xs font-mono text-[var(--t3)] overflow-auto max-h-40"
              style={{ background: "var(--s2)" }}
            >
              <div className="text-[var(--red)] font-bold mb-1">
                {error.name}: {error.message}
              </div>
              {error.digest && (
                <div className="text-[var(--t4)] mb-1">
                  Digest: {error.digest}
                </div>
              )}
              <pre className="whitespace-pre-wrap text-[10px] opacity-70">
                {error.stack}
              </pre>
            </div>
          </details>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="flex items-center justify-center gap-2 text-sm font-bold rounded-xl px-5 py-2.5 transition-all text-white border-none min-h-[44px]"
            style={{ background: "var(--grad)" }}
          >
            <Ico name="refresh" size={16} />
            Try Again
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            className="flex items-center justify-center gap-2 text-sm font-semibold rounded-xl px-5 py-2.5 transition-all border-none min-h-[44px]"
            style={{ background: "var(--s2)", color: "var(--t2)" }}
          >
            <Ico name="car" size={16} />
            Go Home
          </button>
        </div>

        <p className="text-xs text-[var(--t4)]">
          If this problem persists,{" "}
          <a
            href="mailto:support@dealerhunt.com"
            className="text-[var(--amber)] hover:underline font-medium"
          >
            contact support
          </a>
        </p>
      </div>
    </div>
  );
}
