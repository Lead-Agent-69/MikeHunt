"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { observeScrollReveal } from "@/lib/ui/observe-scroll-reveal";

/** One small browsing control; existing filters remain the source of truth. */
export function ScrollSearchBar({
  anchorRef,
  value,
  onChange,
  onSubmit,
  onFilters,
  filterButtonRef,
  filterCount = 0,
  disabled = false,
  paused = false,
  panelId,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  onFilters: () => void;
  filterButtonRef?: RefObject<HTMLButtonElement>;
  filterCount?: number;
  disabled?: boolean;
  paused?: boolean;
  panelId?: string;
}) {
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const currentVisible = useRef(false);
  useEffect(() => {
    if (disabled) {
      currentVisible.current = false;
      setVisible(false);
      return;
    }
    if (paused || !anchorRef.current) return;
    return observeScrollReveal(
      anchorRef.current,
      (next) => {
        currentVisible.current = next;
        setVisible(next);
      },
      () =>
        !!root.current?.contains(document.activeElement) &&
        !!document.activeElement?.matches(
          'input, textarea, select, [contenteditable="true"]',
        ),
      currentVisible.current,
    );
  }, [anchorRef, disabled, paused]);
  return (
    <div
      ref={root}
      hidden={!visible}
      data-scroll-search-bar
      className="fixed inset-x-0 top-14 z-20 border-b border-[var(--b1)] bg-[var(--s0)] px-3 py-2 shadow-lg sm:px-6"
      aria-label="Search and filters while browsing"
      role="region"
    >
      {visible && (
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <form
            role="search"
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit?.();
              root.current?.querySelector("input")?.blur();
            }}
          >
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--t3)]"
            />
            <input
              type="search"
              aria-label="Search vehicles while browsing"
              placeholder="Make, model or VIN"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              disabled={disabled}
              enterKeyHint="search"
              autoComplete="off"
              className="min-h-11 w-full min-w-0 rounded-xl border border-[var(--b1)] bg-[var(--s1)] py-2 pl-9 pr-3 text-base text-[var(--t1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
            />
          </form>
          <button
            type="button"
            ref={filterButtonRef}
            onClick={onFilters}
            disabled={disabled}
            aria-label="Open filters while browsing"
            aria-controls={panelId}
            aria-haspopup={panelId ? "dialog" : undefined}
            aria-expanded={panelId ? paused : undefined}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-[var(--b1)] bg-[var(--s1)] px-3 text-sm font-bold text-[var(--t1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" /> Filters
            {filterCount > 0 && (
              <span className="rounded-full bg-[var(--blue)] px-1.5 text-xs text-white">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
