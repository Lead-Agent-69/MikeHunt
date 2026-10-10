"use client";

import { ArrowUpRight } from "lucide-react";
import { marketHandoff } from "@/lib/search/market-handoff";

export function MarketSearchHandoff({ query }: { query: string }) {
  const handoff = marketHandoff(new URLSearchParams(query));
  return (
    <section
      aria-label="Wider market search"
      className="space-y-2 border-y border-[var(--b2)] py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--t1)]">
          Check the wider market
        </h2>
        <a
          href={handoff.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--blue)]"
          aria-label="Search AutoTempest (opens in a new tab)"
        >
          Search AutoTempest{" "}
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <p className="text-xs text-[var(--t3)]">
        External results are separate from our indexed inventory. Confirm
        availability and details with the seller.
      </p>
      <details className="break-words text-xs text-[var(--t3)]">
        <summary className="min-h-9 cursor-pointer py-2 font-semibold text-[var(--t2)]">
          {handoff.location} ·{" "}
          {handoff.reapply.length
            ? `${handoff.reapply.length} ${handoff.reapply.length === 1 ? "filter" : "filters"} not transferred`
            : "Search criteria carried over"}
        </summary>
        <p className="py-1">
          {handoff.carried.length
            ? handoff.carried.join(" · ")
            : "No vehicle or range filters selected."}
        </p>
        {handoff.reapply.length > 0 && (
          <p className="py-1">Not transferred: {handoff.reapply.join(" · ")}</p>
        )}
        <p className="py-1">
          Make, model and trim use word matching. Review the destination
          filters; matching rules and source coverage differ. A reference ZIP
          sets the selected state or US search, not your personal location.
        </p>
      </details>
      <div className="flex flex-wrap gap-x-5 text-xs font-semibold text-[var(--t2)]">
        <a
          href="https://www.copart.com/vehicleFinder"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1"
          aria-label="Copart auction filters (opens in a new tab)"
        >
          Copart auction filters{" "}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <a
          href="https://visor.vin/search/filters"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1"
          aria-label="Visor market filters (opens in a new tab)"
        >
          Visor market filters{" "}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <span className="self-center font-normal text-[var(--t4)]">
          Copart and Visor open without transferred filters.
        </span>
      </div>
    </section>
  );
}
