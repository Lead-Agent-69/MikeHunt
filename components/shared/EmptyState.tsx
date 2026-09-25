"use client";

import React from "react";
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
      style={{ animation: "fadeUp 260ms cubic-bezier(.16,1,.3,1) both" }}
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

      {action && (
        <div className="mt-6">
          {action.href ? (
            <a
              href={action.href}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--r3)] text-sm font-bold text-white border-none transition-transform"
              style={{ background: "var(--grad)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform =
                  "scale(1.03)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = "";
              }}
            >
              {action.label}
            </a>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--r3)] text-sm font-bold text-white border-none transition-transform active:scale-95"
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
