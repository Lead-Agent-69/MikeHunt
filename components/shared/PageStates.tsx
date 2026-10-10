"use client";

import React from "react";
import { Ico } from "./Ico";
import { Skeleton } from "./Skeleton";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

/**
 * The one loading / empty / error kit for app pages.
 *
 * - Loading: <LoadingState label="Loading alerts" /> (skeleton + visible label,
 *   announced once through role="status").
 * - Empty:   <EmptyState …/> from ./EmptyState — calm, not an error.
 * - Error:   <ErrorState …/> from ./ErrorState for a section or page that
 *   could not load, or <InlineError …/> when content below still renders
 *   (e.g. device-saved items while the server request failed).
 *
 * Retry buttons always read "Try again". Copy stays with each page: never
 * describe stored rows as "live".
 */
export { EmptyState } from "./EmptyState";
export { ErrorState } from "./ErrorState";

type LoadingVariant = "rows" | "cards" | "block";

export function LoadingState({
  label,
  variant = "rows",
  count = 3,
  className = "",
}: {
  /** Short visible + announced text, e.g. "Loading alerts". */
  label: string;
  variant?: LoadingVariant;
  count?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="page-loading"
      className={`py-6 ${className}`}
    >
      {variant === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-40 min-h-0" />
          ))}
        </div>
      ) : variant === "block" ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-2">
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-14 ${i === count - 1 ? "w-3/4" : "w-full"}`}
            />
          ))}
        </div>
      )}
      <p className="mt-3 text-center text-sm text-[var(--t3)]">{label}</p>
    </div>
  );
}

/**
 * Error notice that sits above content which still renders. Same tone as
 * ErrorState, one line, optional "Try again".
 */
export function InlineError({
  message,
  onRetry,
  retryLabel = "Try again",
  testId,
  className = "",
}: {
  message: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[var(--r2)] border border-[var(--rbd)] bg-[var(--rlo)] px-4 py-3 text-sm text-[var(--t2)] ${className}`}
    >
      <span className="flex min-w-0 flex-1 items-start gap-2">
        <Ico
          name="alert-triangle"
          size={16}
          className="mt-0.5 shrink-0 text-[var(--red)]"
        />
        <span>
          {typeof message === "string"
            ? userFacingErrorMessage(message, message)
            : message}
        </span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-4 text-xs font-black text-[var(--t2)]"
        >
          <Ico name="refresh" size={14} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
