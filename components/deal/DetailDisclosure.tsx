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
      className="scroll-mt-36 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)]"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary
        ref={heading}
        className="interactive-surface flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 p-4 marker:hidden md:p-5 [&::-webkit-details-marker]:hidden"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-base font-black text-[var(--t1)]">
            {title}
          </h2>
          <p className="mt-1 text-sm text-[var(--t4)]">{summary}</p>
        </div>
        <span className="flex max-w-24 shrink-0 items-center gap-1 text-xs font-bold text-[var(--blue)] sm:max-w-36">
          <span>{expanded ? "Close section" : actionLabel}</span>
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
