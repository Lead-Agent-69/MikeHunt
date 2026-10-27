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
  const [attempt, setAttempt] = useState(0);
  const unavailable = useCallback(
    (id: string) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row)
        setHidden((prior) =>
          prior[id] === photoKey(row)
            ? prior
            : { ...prior, [id]: photoKey(row) },
        );
    },
    [rows],
  );
  const hiddenCount = rows.filter(
    (row) => hidden[row.id] === photoKey(row),
  ).length;
  return (
    <>
      {hiddenCount > 0 && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--b1)] p-3 text-sm text-[var(--t2)]"
        >
          <p>
            {hiddenCount}{" "}
            {hiddenCount === 1 ? "listing hidden" : "listings hidden"}: photos
            could not load. Matching totals include these listings; Saved is
            unchanged.
          </p>
          <button
            type="button"
            className="min-h-11 rounded-lg border border-[var(--b1)] px-3 font-semibold"
            onClick={() => {
              setHidden({});
              setAttempt((value) => value + 1);
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
        {rows
          .filter((row) => hidden[row.id] !== photoKey(row))
          .map((row) => (
            <MarketListingCard
              key={`${photoKey(row)}:${attempt}`}
              row={row}
              flipDesk={flipDesk}
              onPhotosUnavailable={unavailable}
            />
          ))}
      </div>
    </>
  );
}
