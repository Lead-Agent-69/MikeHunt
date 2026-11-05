"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { SlidersHorizontal } from "lucide-react";
import { VehicleSearchForm } from "./VehicleSearchForm";
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
      style={{ top: "var(--top-nav-height, 3.5rem)" }}
      className="fixed inset-x-0 top-14 z-20 border-b border-[var(--b1)] bg-[var(--s0)] px-3 py-2 shadow-lg sm:px-6"
      aria-label="Search and filters while browsing"
      role="region"
    >
      {visible && (
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <VehicleSearchForm
            value={value}
            onChange={onChange}
            disabled={disabled}
            label="Search vehicles while browsing"
            showSubmit={false}
            onSubmit={() => {
              onSubmit?.();
              root.current?.querySelector("input")?.blur();
            }}
          />
          <button
            type="button"
            ref={filterButtonRef}
            onClick={onFilters}
            disabled={disabled}
            aria-label="Open filters while browsing"
            aria-controls={panelId}
            aria-haspopup={panelId ? "dialog" : undefined}
            aria-expanded={panelId ? paused : undefined}
            className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-[var(--b2)] bg-[var(--s1)] px-4 text-sm font-semibold text-[var(--t1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
          >
            <SlidersHorizontal aria-hidden="true" className="h-4 w-4" /> Filters
            {filterCount > 0 && (
              <span className="rounded-full bg-[var(--accent)] px-1.5 text-xs text-[var(--on-accent)]">
                {filterCount}
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
