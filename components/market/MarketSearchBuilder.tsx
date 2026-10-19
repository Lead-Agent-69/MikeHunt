"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import {
  parseMarketSearch,
  type MarketSearchInterpretation,
} from "@/lib/market/parse-search";
import type { MarketLocationValue } from "./MarketLocation";
import type { HomeLocation } from "@/lib/preferences/locations";

export function MarketSearchBuilder({
  location,
  home,
  onApply,
}: {
  location: MarketLocationValue;
  home?: HomeLocation | null;
  onApply: (
    filters: MarketSearchInterpretation["filters"],
    details: Record<string, string>,
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const parsed = useMemo(() => parseMarketSearch(query), [query]);
  const savedPlace =
    home?.zip ||
    (home?.city && home.state ? `${home.city}, ${home.state}` : "");
  const hasAppliedPlace = Boolean(
    location.near || (location.lat && location.lng),
  );
  const missingLocation = parsed.needsNearby && !hasAppliedPlace && !savedPlace;
  const canApply =
    !!parsed.labels.length && !parsed.blocked && !missingLocation;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Describe a vehicle search"
          title="Describe a search and preview its filters"
          className="absolute bottom-0 right-0 flex h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[var(--blue)] hover:bg-[var(--s2)]"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Describe
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60" />
        <Dialog.Content className="fixed inset-0 z-[91] flex h-dvh min-h-0 flex-col bg-[var(--s0)] text-[var(--t1)] shadow-xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-[var(--b1)]">
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--b1)] px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]">
            <div>
              <Dialog.Title className="text-lg font-bold">
                Describe a search
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--t3)]">
                Preview exact filters from your words before applying them.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close search preview"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--b1)]"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <label className="block text-sm font-semibold">
              What are you looking for?
              <textarea
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={300}
                rows={3}
                placeholder="Black Audi wagon, AWD, under $30k near me"
                className="field mt-2 !w-full resize-y !text-base"
              />
            </label>
            <p className="text-xs text-[var(--t3)]">
              Make, model, year, full-price budget, mileage, body style,
              powertrain, exterior color, ZIP or state.
            </p>
            {parsed.labels.length > 0 && (
              <section aria-label="Interpreted search filters">
                <h2 className="mb-2 text-sm font-bold">Filters to apply</h2>
                <ul className="flex flex-wrap gap-2">
                  {parsed.labels.map((label) => (
                    <li
                      key={label}
                      className="rounded-lg border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-sm"
                    >
                      {label}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {parsed.warnings.length > 0 && (
              <ul
                aria-label="Search interpretation notes"
                className="space-y-2 text-sm text-[var(--amber-d)]"
              >
                {parsed.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            {missingLocation && (
              <p
                role="status"
                className="text-sm font-semibold text-[var(--amber-d)]"
              >
                Add a ZIP or use the location control in Market before applying
                “near me.”
              </p>
            )}
            {query.trim() &&
              !parsed.labels.length &&
              !parsed.warnings.length && (
                <p role="status" className="text-sm text-[var(--t3)]">
                  No supported filters found. Try an explicit make, budget, year
                  or location.
                </p>
              )}
          </div>
          <footer className="shrink-0 space-y-2 border-t border-[var(--b1)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-xs text-[var(--t3)]">
              This replaces vehicle keywords and any make or model shown above.
              Other applied filters stay in place.
            </p>
            <button
              type="button"
              disabled={!canApply}
              className="min-h-11 w-full rounded-lg bg-[var(--blue)] px-4 text-sm font-bold text-white disabled:opacity-40"
              onClick={() => {
                if (!canApply) return;
                const filters = { ...parsed.filters };
                if (parsed.needsNearby) {
                  Object.assign(
                    filters,
                    hasAppliedPlace
                      ? {
                          near: location.near,
                          lat: location.lat,
                          lng: location.lng,
                        }
                      : { near: savedPlace, lat: "", lng: "" },
                  );
                  filters.states = [];
                  filters.radius ||=
                    location.radius || String(home?.radiusMi || 100);
                }
                onApply(filters, parsed.details);
                setOpen(false);
              }}
            >
              Apply search filters
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
