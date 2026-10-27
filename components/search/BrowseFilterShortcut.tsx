"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { observeScrollReveal } from "@/lib/ui/observe-scroll-reveal";

/** Secondary views return to the same search with the complete filters already open. */
export function BrowseFilterShortcut({ query }: { query: string }) {
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
  params.set("filters", "open");
  const href = `/market?${params}`;
  const control = (
    <Link
      href={href}
      prefetch={false}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--b1)] bg-[var(--s1)] px-4 text-sm font-semibold text-[var(--t1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
      title="Open this search's full filters in Results"
    >
      <SlidersHorizontal size={17} aria-hidden="true" /> Search &amp; filters
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
          className="fixed inset-x-0 top-14 z-20 flex justify-center border-b border-[var(--b1)] bg-[var(--s0)] px-3 py-2 shadow-lg"
        >
          {control}
        </div>
      )}
    </>
  );
}
