"use client";

import React from "react";
import { ChevronDown } from "lucide-react";

/** Mount expensive tools only when opened. Repeated checklist requests reopen and focus them. */
export function DetailDisclosure({
  eyebrow,
  title,
  summary,
  actionLabel = "View details",
  request = 0,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  actionLabel?: string;
  request?: number;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const details = React.useRef<HTMLDetailsElement>(null);
  const heading = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    if (!request || !details.current) return;
    details.current.open = true;
    setExpanded(true);
    heading.current?.focus({ preventScroll: true });
    details.current.scrollIntoView({ block: "start" });
  }, [request]);

  return (
    <details
      ref={details}
      name="vehicle-research-sections"
      className="browse-panel scroll-mt-36"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary
        ref={heading}
        className="premium-focus flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[inherit] p-4 transition-colors hover:bg-[var(--s1)] marker:hidden md:gap-4 md:p-5 [&::-webkit-details-marker]:hidden"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--t3)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--t1)]">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--t3)]">
            {summary}
          </p>
        </div>
        <span className="flex min-h-9 w-9 shrink-0 items-center justify-center gap-1 rounded-full bg-[var(--accent-surface)] text-xs font-semibold text-[var(--blue)] sm:w-auto sm:max-w-36 sm:px-3">
          <span className="sr-only sm:not-sr-only">
            {expanded ? "Close section" : actionLabel}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 ${expanded ? "rotate-180" : ""}`}
          />
        </span>
      </summary>
      {expanded ? (
        <div className="border-t border-[var(--b1)] p-4 md:p-5">{children}</div>
      ) : null}
    </details>
  );
}
