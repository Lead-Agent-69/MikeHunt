"use client";

import React from "react";
import { Ico } from "./Ico";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: "alert-triangle" | "check-circle" | "refresh" | "car" | "settings";
  compact?: boolean;
}

/**
 * Friendly, reusable error state component.
 * Shows a warm-styled error card with optional retry action.
 */
export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  retryLabel = "Try Again",
  icon = "alert-triangle",
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-4 ${compact ? "py-8" : "py-14"} px-6 rounded-[var(--r4)] text-center`}
      style={{ background: "var(--rlo)", animation: "fadeUp 200ms ease-out" }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center"
        style={{
          background: "rgba(239,91,107,0.12)",
          border: "1px solid var(--rbd)",
        }}
      >
        <Ico name={icon} size={22} className="text-[var(--red)]" />
      </div>

      <div>
        <h3
          className={`font-bold text-[var(--t1)] ${compact ? "text-base" : "text-lg"} mb-1`}
        >
          {title}
        </h3>
        <p className="text-sm text-[var(--t3)] max-w-xs">{message}</p>
      </div>

      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 text-sm font-bold rounded-xl px-5 py-2.5 transition-all text-white border-none"
          style={{ background: "var(--grad)" }}
        >
          <Ico name="refresh" size={16} />
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/**
 * Inline error banner for smaller errors within a page section.
 */
export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-[var(--r2)] text-sm"
      style={{ background: "var(--rlo)", color: "var(--red)" }}
    >
      <Ico name="alert-triangle" size={16} className="shrink-0" />
      <span className="font-medium flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <Ico name="close" size={14} />
        </button>
      )}
    </div>
  );
}
