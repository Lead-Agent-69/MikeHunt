"use client";

import { ArrowDown, ArrowUpRight } from "lucide-react";
import { marketHandoffs } from "@/lib/search/market-handoff";

type Handoff = ReturnType<typeof marketHandoffs>[number];

export function MarketSearchShortcut({ query }: { query: string }) {
  if (!marketHandoffs(new URLSearchParams(query)).length) return null;
  return (
    <a
      href="#wider-market-search"
      className="inline-flex min-h-11 w-fit items-center gap-2 text-xs font-semibold text-[var(--blue)]"
    >
      More marketplaces <ArrowDown className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function MarketLink({ handoff }: { handoff: Handoff }) {
  const reviewCount = handoff.reapply.length + handoff.unconfirmed.length;
  return (
    <li className="min-w-0 border-b border-[var(--b1)] py-2 last:border-b-0">
      <a
        href={handoff.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 max-w-full items-center gap-2 break-words text-sm font-semibold text-[var(--blue)]"
        aria-label={`Search ${handoff.label} (opens in a new tab)`}
      >
        {handoff.label}
        <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
      </a>
      <p className="break-words text-xs text-[var(--t3)]">{handoff.location}</p>
      <details className="break-words text-xs text-[var(--t3)]">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold text-[var(--t2)]">
          {reviewCount
            ? `${reviewCount} ${reviewCount === 1 ? "filter" : "filters"} to confirm`
            : "Search criteria"}
        </summary>
        <p className="py-1">
          Transferred:{" "}
          {handoff.carried.length
            ? handoff.carried.join(" · ")
            : "No vehicle or range filters selected."}
        </p>
        {handoff.reapply.length > 0 && (
          <p className="py-1">Not transferred: {handoff.reapply.join(" · ")}</p>
        )}
        {handoff.unconfirmed.length > 0 && (
          <p className="py-1">
            Confirm at destination: {handoff.unconfirmed.join(" · ")}
          </p>
        )}
        <p className="py-1">
          Matching rules and distance options vary. Confirm vehicle details with
          the seller.
        </p>
      </details>
    </li>
  );
}

export function MarketSearchHandoff({ query }: { query: string }) {
  const handoffs = marketHandoffs(new URLSearchParams(query));
  const visible = handoffs.slice(0, 3);
  const more = handoffs.slice(3);
  if (!handoffs.length) return null;
  return (
    <section
      id="wider-market-search"
      tabIndex={-1}
      aria-label="Wider market search"
      className="scroll-mt-24 space-y-2 border-y border-[var(--b2)] py-3"
    >
      <h2 className="text-sm font-bold text-[var(--t1)]">
        Search more marketplaces
      </h2>
      <p className="text-xs text-[var(--t3)]">
        External results are separate from our indexed inventory.
      </p>
      <ul className="grid min-w-0 grid-cols-1 gap-x-6 sm:grid-cols-3">
        {visible.map((handoff) => (
          <MarketLink key={handoff.id} handoff={handoff} />
        ))}
      </ul>
      {more.length > 0 && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-[var(--t2)]">
            {more.length} more marketplaces
          </summary>
          <ul className="grid min-w-0 grid-cols-1 gap-x-6 sm:grid-cols-3">
            {more.map((handoff) => (
              <MarketLink key={handoff.id} handoff={handoff} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
