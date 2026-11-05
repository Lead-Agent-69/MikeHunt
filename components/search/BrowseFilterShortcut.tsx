"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { inventoryScopeLabel } from "@/lib/search/inventory-view-scope";
import { DEFAULT_RADIUS_MI } from "@/lib/search/zip-radius-scope";
import { observeScrollReveal } from "@/lib/ui/observe-scroll-reveal";

/** Secondary views return to the same search with the complete filters already open. */
export function BrowseFilterShortcut({
  query,
  current,
}: {
  query: string;
  current?: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!anchor.current) return;
    return observeScrollReveal(
      anchor.current,
      setVisible,
      () => !!floating.current?.contains(document.activeElement),
    );
  }, []);
  const params = new URLSearchParams(query);
  const summary = [
    params.get("q") ||
      [params.get("makes"), params.get("model")].filter(Boolean).join(" ") ||
      "Vehicles",
    params.get("near")
      ? `Within ${params.get("radius") || DEFAULT_RADIUS_MI} mi of ${params.get("near")}`
      : inventoryScopeLabel(params),
  ].join(" · ");
  const filterCount = [
    "minPrice",
    "maxPrice",
    "maxMileage",
    "minMileage",
    "minYear",
    "maxYear",
    "sources",
    "titleType",
    "conditions",
    "categories",
  ].filter((key) => !!params.get(key)).length;
  params.set("filters", "open");
  const href = `/market?${params}`;
  const control = (
    <Link
      href={href}
      prefetch={false}
      className="feedback-control inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--b1)] bg-[var(--s1)] px-4 text-sm font-semibold text-[var(--t1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
      title="Open this search's full filters in Results"
    >
      <SlidersHorizontal size={17} aria-hidden="true" /> Search &amp; filters
      {filterCount > 0 && (
        <span className="rounded-full bg-[var(--accent-surface)] px-1.5 text-xs text-[var(--blue)]">
          {filterCount}
        </span>
      )}
    </Link>
  );
  return (
    <>
      <div ref={anchor}>{control}</div>
      {visible && (
        <div
          ref={floating}
          role="region"
          aria-label="Refine search while browsing"
          style={{ top: "var(--top-nav-height, 3.5rem)" }}
          className="fixed inset-x-0 top-14 z-20 flex justify-center border-b border-[var(--b1)] bg-[var(--s0)] px-3 py-2 shadow-lg"
        >
          {current === "/feed" ? (
            <div className="flex w-full max-w-3xl items-center gap-2">
              <div className="mr-auto min-w-0 pl-1">
                <span className="block text-xs font-bold text-[var(--t1)]">
                  Feed
                </span>
                <span
                  className="block truncate text-xs text-[var(--t3)]"
                  title={summary}
                >
                  {summary}
                </span>
              </div>
              <Link
                href={`/market?${query}`}
                prefetch={false}
                className="feedback-control inline-flex min-h-11 items-center rounded-xl px-2 text-sm font-semibold text-[var(--t2)]"
              >
                Results
              </Link>
              {control}
            </div>
          ) : (
            control
          )}
        </div>
      )}
    </>
  );
}
