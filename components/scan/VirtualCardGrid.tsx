"use client";

// Windowed card grid for /scan. At 5,000 listings the plain grid kept every card in the DOM
// (≈120 nodes per card, 50k+ nodes after a few pages). This renders only the rows near the
// viewport, using the window as the scroller so the page, sticky header and load-more sentinel
// behave exactly as before.
//
// - Columns follow the same Tailwind breakpoints as the old grid classes (sm 640 / lg 1024 / xl 1280).
// - a11y: one role="list" with role="listitem" cards carrying aria-posinset / aria-setsize, so a
//   screen reader still hears "12 of 384". Row wrappers are role="none".
// - Focus: the row holding document.activeElement is always kept mounted, so tabbing or a screen
//   reader cursor never loses focus to an unmount while the page scrolls.
// - Motion: only the first screen (ANIMATED_CARDS) animates in, once. Virtualized rows remount as
//   you scroll, and re-running entrance animations on them would flicker.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import {
  defaultRangeExtractor,
  useWindowVirtualizer,
} from "@tanstack/react-virtual";
import type { Range } from "@tanstack/react-virtual";

export type GridDensity = "compact" | "comfortable" | string;

export const ANIMATED_CARDS = 12;

/** Column count for a viewport width, mirroring the previous Tailwind grid classes. */
export function columnsFor(width: number, density: GridDensity): number {
  if (density === "compact") {
    if (width >= 1280) return 5;
    if (width >= 1024) return 4;
    if (width >= 640) return 3;
    return 2;
  }
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

/** Card row height guess before measuring (measured heights replace it on mount). */
export function estimateRowHeight(width: number, density: GridDensity): number {
  if (density === "compact") return 520;
  return width < 640 ? 880 : 780;
}

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 120,
      damping: 18,
      delay: 0.05 + i * 0.06,
    },
  }),
};

interface VirtualCardGridProps<T> {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  density?: GridDensity;
  label?: string;
  /** For tests / SSR: the viewport to assume before the window is measured. */
  initialViewport?: { width: number; height: number };
  overscan?: number;
}

export function VirtualCardGrid<T>({
  items,
  getKey,
  renderItem,
  density = "comfortable",
  label = "Search results",
  initialViewport,
  overscan = 2,
}: VirtualCardGridProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(
    () =>
      initialViewport?.width ??
      (typeof window === "undefined" ? 1280 : window.innerWidth),
  );
  const [scrollMargin, setScrollMargin] = useState(0);
  // Row that currently holds keyboard / AT focus; it is never unmounted.
  const focusedRow = useRef<number | null>(null);
  // Entrance animation: only the first screen of the first batch, and only the first time each of
  // those cards mounts (a row that scrolls out and back in renders at rest).
  const firstBatch = useRef<Set<string> | null>(null);
  if (firstBatch.current === null && items.length) {
    firstBatch.current = new Set(items.slice(0, ANIMATED_CARDS).map(getKey));
  }
  const settled = useRef(new Set<string>());

  const cols = columnsFor(viewportWidth, density);
  const rowCount = Math.ceil(items.length / cols);
  const gap = density === "compact" ? 10 : 16;

  useIsoLayoutEffect(() => {
    const measure = () => {
      setViewportWidth(window.innerWidth);
      const el = listRef.current;
      if (el) setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const rangeExtractor = useCallback((range: Range) => {
    const base = defaultRangeExtractor(range);
    const f = focusedRow.current;
    if (f != null && f < range.count && !base.includes(f)) {
      return [...base, f].sort((a, b) => a - b);
    }
    return base;
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimateRowHeight(viewportWidth, density),
    overscan,
    gap,
    scrollMargin,
    rangeExtractor,
    initialRect: initialViewport,
  });

  // Column count changes re-flow rows, so cached row heights are stale.
  useEffect(() => {
    virtualizer.measure();
  }, [cols, virtualizer]);

  const rows = virtualizer.getVirtualItems();

  return (
    <div
      ref={listRef}
      role="list"
      aria-label={label}
      data-testid="scan-virtual-grid"
      data-columns={cols}
      onFocus={(e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-row]",
        );
        focusedRow.current = row ? Number(row.dataset.row) : null;
      }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!next || !listRef.current?.contains(next))
          focusedRow.current = null;
      }}
      style={{ position: "relative", height: virtualizer.getTotalSize() }}
    >
      {rows.map((row) => {
        const start = row.index * cols;
        const slice = items.slice(start, start + cols);
        return (
          <div
            key={row.key}
            role="none"
            data-row={row.index}
            data-index={row.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              gap,
            }}
          >
            {slice.map((item, j) => {
              const index = start + j;
              const key = getKey(item);
              const animate =
                !!firstBatch.current?.has(key) && !settled.current.has(key);
              return (
                <motion.div
                  key={key}
                  role="listitem"
                  aria-posinset={index + 1}
                  aria-setsize={items.length}
                  data-card-index={index}
                  custom={index}
                  variants={CARD_VARIANTS}
                  initial={animate ? "hidden" : false}
                  animate="show"
                  onAnimationComplete={() => settled.current.add(key)}
                >
                  {renderItem(item, index)}
                </motion.div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
