"use client";

import React from "react";

/** Mount expensive tools only when opened. Repeated checklist requests reopen and focus them. */
export function DetailDisclosure({
  eyebrow,
  title,
  summary,
  request = 0,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
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
        <span className="shrink-0 text-xs font-black text-[var(--blue)]">
          {expanded ? "Hide" : "Examine"}
        </span>
      </summary>
      {expanded ? (
        <div className="border-t border-[var(--b1)] p-4 md:p-5">{children}</div>
      ) : null}
    </details>
  );
}
