"use client";

import React from "react";
import Link from "next/link";
import { Ico } from "./Ico";

// IconName is not exported from Ico, so mirror the accepted names here.
type IcoName = React.ComponentProps<typeof Ico>["name"];

interface EmptyStateProps {
  /** Icon from the shared Ico set */
  icon: IcoName;
  /** Short, calm title — e.g. "No vehicles yet" */
  title: string;
  /** One explanatory sentence */
  message: string;
  /** Optional single action */
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
}

/**
 * Calm, centered empty state — one icon, a short title, one line, and at most
 * one action. Intentional, not an error. Matches the warm token system.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-20 ${className}`}
    >
      {/* Icon — soft, warm chip */}
      <div
        className="w-16 h-16 rounded-[var(--r4)] flex items-center justify-center mb-5"
        style={{ background: "var(--s2)", color: "var(--t4)" }}
      >
        <Ico name={icon} size={28} />
      </div>

      <h2 className="text-lg font-bold mb-1.5" style={{ color: "var(--t1)" }}>
        {title}
      </h2>
      <p
        className="text-sm max-w-xs leading-relaxed"
        style={{ color: "var(--t4)" }}
      >
        {message}
      </p>

      {action && (action.href || action.onClick) && (
        <div className="mt-6">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex min-h-11 items-center gap-2 px-6 py-3 rounded-[var(--r3)] text-sm font-bold text-white border-none motion-safe:transition-transform motion-safe:hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
              style={{ background: "var(--grad)" }}
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex min-h-11 items-center gap-2 px-6 py-3 rounded-[var(--r3)] text-sm font-bold text-white border-none motion-safe:transition-transform motion-safe:active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue)]"
              style={{ background: "var(--grad)" }}
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
