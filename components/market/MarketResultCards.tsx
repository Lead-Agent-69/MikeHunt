"use client";

import Link from "next/link";
import { ArrowUpRight, MapPin, CircleAlert } from "lucide-react";
import { SourceBadge } from "@/components/shared/SourceBadge";
import type { TableRow } from "@/components/scan/DealTable";

export type MarketRow = TableRow & {
  priceLabel?: string;
  priceKind?: string;
  cashPriceConfirmed?: boolean;
  locationCity?: string;
  distanceMiles?: number | null;
  titleStatus?: string;
};

export function MarketResultCards({ rows }: { rows: MarketRow[] }) {
  return (
    <div
      className="grid grid-cols-1 gap-3 min-[640px]:grid-cols-2 xl:grid-cols-3"
      aria-label="Market vehicles"
    >
      {rows.map((row) => (
        <article
          key={row.id}
          className="min-w-0 overflow-hidden rounded-lg border border-[var(--b1)] bg-[var(--s1)]"
        >
          <Link
            href={`/deal/${encodeURIComponent(row.id)}`}
            className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={`Examine ${row.year} ${row.make} ${row.model}`}
          >
            <div className="aspect-[4/3] overflow-hidden bg-[var(--s2)]">
              {/* Source photography, never substitute a different vehicle. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.imageUrl}
                alt={`${row.year} ${row.make} ${row.model}`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          </Link>
          <div className="space-y-3 p-3">
            <SourceBadge source={row.source} sourceUrl={row.sourceUrl} />
            <h2 className="text-base font-semibold leading-snug text-[var(--t1)]">
              {row.year} {row.make} {row.model} {row.trim}
            </h2>
            <div>
              <p className="text-xl font-bold tabular-nums text-[var(--t1)]">
                {row.askPrice > 0
                  ? `$${row.askPrice.toLocaleString()}`
                  : "Price not reported"}
              </p>
              <p className="text-xs text-[var(--t3)]">
                {row.priceLabel || "Unverified advertised amount"}
              </p>
            </div>
            <p className="text-sm text-[var(--t2)]">
              {row.mileage != null
                ? `${row.mileage.toLocaleString()} miles`
                : "Mileage not reported"}{" "}
              · {row.titleStatus || "Title needs checking"}
            </p>
            <p className="flex items-center gap-1 text-xs text-[var(--t3)]">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {[row.locationCity, row.locationState]
                .filter(Boolean)
                .join(", ") || "Location not reported"}
              {row.distanceMiles != null
                ? ` · ${row.distanceMiles} mi straight-line`
                : ""}
            </p>
            {!row.cashPriceConfirmed && (
              <p className="flex items-start gap-1 text-xs text-[var(--t3)]">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Confirm the full purchase price; this amount may be a bid,
                payment or reference.
              </p>
            )}
            <Link
              href={`/deal/${encodeURIComponent(row.id)}`}
              className="flex min-h-11 items-center justify-between border-t border-[var(--b1)] pt-3 text-xs focus-visible:outline focus-visible:outline-2"
            >
              <span className="text-[var(--t3)]">Examine vehicle</span>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--accent)]" />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
