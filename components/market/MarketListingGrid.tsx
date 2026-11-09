"use client";

import { useCallback, useState } from "react";
import type { MarketListing } from "@/lib/market/explorer";
import { MarketListingCard } from "./MarketListingCard";

const photoKey = (row: MarketListing) =>
  `${row.id}:${JSON.stringify(row.images)}`;

/** Browser access failures affect this view only, never the listing or Saved. */
export function MarketListingGrid({
  rows,
  flipDesk,
  children,
}: {
  rows: MarketListing[];
  flipDesk: boolean;
  children?: React.ReactNode;
}) {
  const [hidden, setHidden] = useState<Record<string, string>>({});
  const unavailable = useCallback((id: string, key: string) => {
    setHidden((prior) => (prior[id] === key ? prior : { ...prior, [id]: key }));
  }, []);
  const visible = rows
    .map((row) => ({ row, key: photoKey(row) }))
    .filter(({ row, key }) => hidden[row.id] !== key);
  const hiddenCount = rows.length - visible.length;
  return (
    <>
      {hiddenCount > 0 && (
        <div
          role="status"
          data-loaded-count={rows.length}
          data-displayed-count={rows.length - hiddenCount}
          data-photo-hidden-count={hiddenCount}
          className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3 rounded-lg border border-[var(--b1)] px-3 text-xs text-[var(--t2)]"
        >
          <p>
            {rows.length - hiddenCount} of {rows.length} loaded shown ·{" "}
            {hiddenCount}{" "}
            {hiddenCount === 1 ? "listing hidden" : "listings hidden"}: photos
            unavailable.
            <span className="sr-only">
              {" "}
              Matching totals include hidden listings. This browser failure does
              not change Saved or catalogue history.
            </span>
          </p>
          <button
            type="button"
            className="min-h-11 shrink-0 font-semibold text-[var(--blue)]"
            onClick={() => {
              setHidden({});
            }}
          >
            Try photos again
          </button>
        </div>
      )}
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns:
            "repeat(auto-fill, minmax(min(100%, 19rem), 1fr))",
        }}
      >
        {children}
        {visible.map(({ row, key }, index) => (
          <MarketListingCard
            key={key}
            photoKey={key}
            prioritizePhoto={index === 0}
            row={row}
            flipDesk={flipDesk}
            onPhotosUnavailable={unavailable}
          />
        ))}
      </div>
    </>
  );
}
