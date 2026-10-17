"use client";

import React from "react";
import { BarChart3, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Mono } from "@/components/shared/Mono";
import type {
  MarketFacetCount,
  MarketFacets,
  MarketPriceMileageCell,
  MarketRangeBand,
} from "@/lib/market/explorer";

export type MarketFacetKey =
  | "make"
  | "model"
  | "year"
  | "body"
  | "fuelType"
  | "transmission"
  | "drivetrain"
  | "condition"
  | "source"
  | "color"
  | "sellerType"
  | "assemblyCountry"
  | "availability"
  | "freshness"
  | "priceKind"
  | "priceAvailability"
  | "mileageAvailability";

export type MarketFacetSelection = Partial<
  Record<MarketFacetKey, string | string[]>
> & {
  priceMin?: string;
  priceMax?: string;
  mileageMin?: string;
  mileageMax?: string;
};

type Props = {
  facets?: MarketFacets;
  total: number;
  busy?: boolean;
  selected: MarketFacetSelection;
  onFacetSelect: (key: MarketFacetKey, value: string) => void;
  onMatrixSelect: (
    priceFrom: number,
    priceTo: number | null,
    mileageFrom: number,
    mileageTo: number | null,
  ) => void;
};

const TABS = [
  "Price & miles",
  "Vehicle",
  "Powertrain",
  "Auction",
  "Sources",
  "Evidence",
] as const;
type Tab = (typeof TABS)[number];

function selectionCount(...values: (string | string[] | undefined)[]): number {
  return values.reduce<number>(
    (count, value) =>
      count + (Array.isArray(value) ? value.length : value ? 1 : 0),
    0,
  );
}

export function MarketFacetStudio({
  facets,
  total,
  busy = false,
  selected,
  onFacetSelect,
  onMatrixSelect,
}: Props) {
  const [open, setOpen] = React.useState(true);
  const [tab, setTab] = React.useState<Tab>("Price & miles");
  const makes = (facets?.topMakes || []).map(({ make, n }) => ({
    value: make,
    n,
  }));
  const tabCounts: Record<Tab, number> = {
    "Price & miles": selectionCount(
      selected.priceMin,
      selected.priceMax,
      selected.mileageMin,
      selected.mileageMax,
    ),
    Vehicle: selectionCount(
      selected.make,
      selected.model,
      selected.year,
      selected.body,
      selected.color,
    ),
    Powertrain: selectionCount(
      selected.fuelType,
      selected.transmission,
      selected.drivetrain,
    ),
    Auction: selectionCount(
      selected.condition,
      selected.availability,
      selected.priceKind,
    ),
    Sources: selectionCount(
      selected.source,
      selected.sellerType,
      selected.freshness,
      selected.assemblyCountry,
    ),
    Evidence: selectionCount(
      selected.priceAvailability,
      selected.mileageAvailability,
    ),
  };

  return (
    <section
      aria-label="Smart market filters"
      aria-busy={busy}
      className="overflow-hidden rounded-2xl border border-[var(--b1)] bg-[var(--s1)]"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--s2)] text-[var(--blue)]">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[var(--t1)]">
            Smart filter studio
          </span>
          <span className="block text-[11px] text-[var(--t4)]">
            {busy
              ? "Updating live facets…"
              : `Explore live facets from ${total.toLocaleString()} matching listings`}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[var(--t4)] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-[var(--b1)]">
          <div
            role="tablist"
            aria-label="Market filter categories"
            className="flex gap-1 overflow-x-auto border-b border-[var(--b1)] px-3 py-2"
          >
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={tab === name}
                onClick={() => setTab(name)}
                className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold transition-colors ${
                  tab === name
                    ? "bg-[var(--s2)] text-[var(--blue)]"
                    : "text-[var(--t3)] hover:bg-[var(--s2)]"
                }`}
              >
                <span>{name}</span>
                {tabCounts[name] > 0 && (
                  <span className="ml-1.5 rounded-full bg-[var(--blue)] px-1.5 py-0.5 text-[9px] leading-none text-white">
                    {tabCounts[name]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="p-3 md:p-4">
            {tab === "Price & miles" && (
              <PriceMileageMatrix
                priceBands={facets?.priceBands || []}
                mileageBands={facets?.mileageBands || []}
                cells={facets?.priceMileageMatrix || []}
                selected={selected}
                onSelect={onMatrixSelect}
              />
            )}

            {tab === "Vehicle" && (
              <FacetGrid>
                <FacetCard
                  title="Manufacturer"
                  entries={makes}
                  active={selected.make}
                  onSelect={(value) => onFacetSelect("make", value)}
                />
                <FacetCard
                  title="Model"
                  entries={facets?.topModels || []}
                  active={selected.model}
                  onSelect={(value) => onFacetSelect("model", value)}
                />
                <FacetCard
                  title="Model year"
                  entries={facets?.years || []}
                  active={selected.year}
                  onSelect={(value) => onFacetSelect("year", value)}
                />
                {!!facets?.bodyClasses?.length && (
                  <FacetCard
                    title="Body style"
                    entries={facets.bodyClasses}
                    active={selected.body}
                    onSelect={(value) => onFacetSelect("body", value)}
                  />
                )}
                {!!facets?.colors?.length && (
                  <FacetCard
                    title="Exterior color"
                    entries={facets.colors}
                    active={selected.color}
                    onSelect={(value) => onFacetSelect("color", value)}
                  />
                )}
              </FacetGrid>
            )}

            {tab === "Powertrain" && (
              <FacetGrid>
                {!!facets?.fuelTypes?.length && (
                  <FacetCard
                    title="Fuel"
                    entries={facets.fuelTypes}
                    active={selected.fuelType}
                    onSelect={(value) => onFacetSelect("fuelType", value)}
                  />
                )}
                {!!facets?.transmissions?.length && (
                  <FacetCard
                    title="Transmission"
                    entries={facets.transmissions}
                    active={selected.transmission}
                    onSelect={(value) => onFacetSelect("transmission", value)}
                  />
                )}
                {!!facets?.drivetrains?.length && (
                  <FacetCard
                    title="Drivetrain"
                    entries={facets.drivetrains}
                    active={selected.drivetrain}
                    onSelect={(value) => onFacetSelect("drivetrain", value)}
                  />
                )}
                {!facets?.fuelTypes?.length &&
                  !facets?.transmissions?.length &&
                  !facets?.drivetrains?.length && (
                    <FacetUnavailable label="Powertrain details" />
                  )}
              </FacetGrid>
            )}

            {tab === "Auction" && (
              <FacetGrid>
                <FacetCard
                  title="Title & condition"
                  entries={facets?.conditions || []}
                  active={selected.condition}
                  onSelect={(value) => onFacetSelect("condition", value)}
                />
                {!!facets?.availability?.length && (
                  <FacetCard
                    title="Availability"
                    entries={facets.availability}
                    active={selected.availability}
                    onSelect={(value) => onFacetSelect("availability", value)}
                  />
                )}
                <FacetCard
                  title="Price type"
                  entries={facets?.priceKinds || []}
                  active={selected.priceKind}
                  onSelect={(value) => onFacetSelect("priceKind", value)}
                />
              </FacetGrid>
            )}

            {tab === "Sources" && (
              <FacetGrid>
                <FacetCard
                  title="Source"
                  entries={facets?.sources || []}
                  active={selected.source}
                  onSelect={(value) => onFacetSelect("source", value)}
                />
                <FacetCard
                  title="Seller type"
                  entries={Object.entries(facets?.sellerTypes || {}).map(
                    ([value, n]) => ({ value, n }),
                  )}
                  active={selected.sellerType}
                  onSelect={(value) => onFacetSelect("sellerType", value)}
                />
                <FacetCard
                  title="Recently observed"
                  entries={facets?.freshness || []}
                  active={selected.freshness}
                  onSelect={(value) => onFacetSelect("freshness", value)}
                  format={(value) =>
                    value === "1" ? "Past 24 hours" : `Past ${value} days`
                  }
                />
                {!!facets?.assemblyCountries?.length && (
                  <FacetCard
                    title="Assembly country"
                    entries={facets.assemblyCountries}
                    active={selected.assemblyCountry}
                    onSelect={(value) =>
                      onFacetSelect("assemblyCountry", value)
                    }
                  />
                )}
              </FacetGrid>
            )}

            {tab === "Evidence" && (
              <EvidenceCard
                total={total}
                missingPrice={facets?.missingPrice || 0}
                missingMileage={facets?.missingMileage || 0}
                mapped={facets?.mapped || 0}
                priceKinds={facets?.priceKinds || []}
                selected={selected}
                onSelect={onFacetSelect}
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function FacetGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
  );
}

function FacetUnavailable({ label }: { label: string }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-[var(--b1)] bg-[var(--s0)] p-4 text-center">
      <div>
        <p className="text-xs font-bold text-[var(--t2)]">{label}</p>
        <p className="mt-1 text-[11px] text-[var(--t4)]">
          No source has reported these fields in the current scope yet.
        </p>
      </div>
    </div>
  );
}

function FacetCard({
  title,
  entries,
  active,
  onSelect,
  format = formatFacet,
}: {
  title: string;
  entries: MarketFacetCount[];
  active?: string | string[];
  onSelect: (value: string) => void;
  format?: (value: string) => string;
}) {
  const max = Math.max(...entries.map((entry) => entry.n), 1);
  const isActive = (value: string) =>
    Array.isArray(active) ? active.includes(value) : active === value;
  return (
    <div className="rounded-xl border border-[var(--b1)] bg-[var(--s0)] p-3">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3
          className="h-3.5 w-3.5 text-[var(--t4)]"
          aria-hidden="true"
        />
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t2)]">
          {title}
        </h3>
      </div>
      {entries.length ? (
        <div className="space-y-1">
          {entries.map((entry) => {
            const selected = isActive(entry.value);
            return (
              <button
                key={entry.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelect(entry.value)}
                className={`group relative flex min-h-9 w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-2.5 text-left text-xs ${
                  selected
                    ? "ring-1 ring-inset ring-[var(--blue)]"
                    : "hover:bg-[var(--s2)]"
                }`}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-[var(--blue)] transition-[width,opacity]"
                  style={{
                    width: `${Math.max(4, (entry.n / max) * 100)}%`,
                    opacity: selected ? 0.2 : 0.08,
                  }}
                  aria-hidden="true"
                />
                <span className="relative min-w-0 truncate font-medium text-[var(--t2)]">
                  {format(entry.value)}
                </span>
                <Mono className="relative shrink-0 text-[10px] text-[var(--t4)]">
                  {entry.n.toLocaleString()}
                </Mono>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="grid min-h-24 place-items-center text-center text-xs text-[var(--t4)]">
          No reported evidence in this scope
        </p>
      )}
    </div>
  );
}

function PriceMileageMatrix({
  priceBands,
  mileageBands,
  cells,
  selected,
  onSelect,
}: {
  priceBands: MarketRangeBand[];
  mileageBands: MarketRangeBand[];
  cells: MarketPriceMileageCell[];
  selected: MarketFacetSelection;
  onSelect: Props["onMatrixSelect"];
}) {
  const max = Math.max(...cells.map((cell) => cell.n), 1);
  const lookup = new Map(
    cells.map((cell) => [`${cell.priceFrom}:${cell.mileageFrom}`, cell]),
  );
  if (!priceBands.length || !mileageBands.length) {
    return (
      <div className="grid min-h-72 place-items-center rounded-xl border border-[var(--b1)] bg-[var(--s0)] text-xs text-[var(--t4)]">
        Price and mileage evidence is not available yet.
      </div>
    );
  }
  return (
    <div className="min-w-0 rounded-xl border border-[var(--b1)] bg-[var(--s0)] p-3 md:p-4">
      <div className="mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t2)]">
          Price × mileage
        </h3>
        <p className="mt-1 text-[10px] text-[var(--t4)]">
          Select a cell to filter both ranges. Cells use reported advertised
          price and mileage; unreported values stay separate.
        </p>
      </div>
      <div className="overflow-x-auto pb-1">
        <div
          className="grid min-w-[42rem] gap-1"
          style={{
            gridTemplateColumns: `7.5rem repeat(${mileageBands.length}, minmax(4.25rem, 1fr))`,
          }}
        >
          <div className="px-1 py-2 text-[9px] font-semibold uppercase tracking-wide text-[var(--t5)]">
            Price ↓ / miles →
          </div>
          {mileageBands.map((band) => (
            <div
              key={band.from}
              className="px-1 py-2 text-center text-[9px] font-semibold text-[var(--t4)]"
            >
              {band.label}
            </div>
          ))}
          {priceBands.flatMap((priceBand) => {
            const row: React.ReactNode[] = [
              <div
                key={`label-${priceBand.from}`}
                className="flex min-h-11 items-center px-1 text-[10px] font-semibold text-[var(--t3)]"
              >
                {priceBand.label}
              </div>,
            ];
            for (const mileageBand of mileageBands) {
              const cell = lookup.get(
                `${priceBand.from}:${mileageBand.from}`,
              ) || {
                priceFrom: priceBand.from,
                priceTo: priceBand.to,
                mileageFrom: mileageBand.from,
                mileageTo: mileageBand.to,
                n: 0,
              };
              const active =
                selected.priceMin === String(cell.priceFrom) &&
                selected.priceMax ===
                  (cell.priceTo == null ? "" : String(cell.priceTo)) &&
                selected.mileageMin === String(cell.mileageFrom) &&
                selected.mileageMax ===
                  (cell.mileageTo == null ? "" : String(cell.mileageTo));
              row.push(
                <button
                  key={`${priceBand.from}-${mileageBand.from}`}
                  type="button"
                  disabled={!cell.n}
                  aria-pressed={active}
                  aria-label={`${priceBand.label}, ${mileageBand.label}: ${cell.n} listings`}
                  onClick={() =>
                    onSelect(
                      cell.priceFrom,
                      cell.priceTo,
                      cell.mileageFrom,
                      cell.mileageTo,
                    )
                  }
                  className={`relative min-h-11 overflow-hidden rounded-md border text-[10px] font-bold tabular-nums transition-transform enabled:hover:scale-[1.03] disabled:text-[var(--t5)] ${
                    active
                      ? "border-[var(--blue)] ring-1 ring-[var(--blue)]"
                      : "border-[var(--b1)]"
                  }`}
                >
                  <span
                    className="absolute inset-0 bg-[var(--blue)]"
                    style={{
                      opacity: cell.n ? 0.08 + (cell.n / max) * 0.48 : 0,
                    }}
                    aria-hidden="true"
                  />
                  <span className="relative">
                    {cell.n ? cell.n.toLocaleString() : "—"}
                  </span>
                </button>,
              );
            }
            return row;
          })}
        </div>
      </div>
    </div>
  );
}

function EvidenceCard({
  total,
  missingPrice,
  missingMileage,
  mapped,
  priceKinds,
  selected,
  onSelect,
}: {
  total: number;
  missingPrice: number;
  missingMileage: number;
  mapped: number;
  priceKinds: MarketFacetCount[];
  selected: MarketFacetSelection;
  onSelect: Props["onFacetSelect"];
}) {
  return (
    <div className="rounded-xl border border-[var(--b1)] bg-[var(--s0)] p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--t2)]">
        Evidence coverage
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <EvidenceStat label="Listings" value={total} />
        <EvidenceStat label="Mapped" value={mapped} />
      </div>
      <div className="mt-3 space-y-2">
        <button
          type="button"
          aria-pressed={selected.priceAvailability === "unknown"}
          onClick={() => onSelect("priceAvailability", "unknown")}
          className="flex min-h-10 w-full items-center justify-between rounded-lg border border-[var(--b1)] px-3 text-xs"
        >
          <span>Price not reported</span>
          <Mono className="text-[var(--t4)]">
            {missingPrice.toLocaleString()}
          </Mono>
        </button>
        <button
          type="button"
          aria-pressed={selected.mileageAvailability === "unknown"}
          onClick={() => onSelect("mileageAvailability", "unknown")}
          className="flex min-h-10 w-full items-center justify-between rounded-lg border border-[var(--b1)] px-3 text-xs"
        >
          <span>Mileage not reported</span>
          <Mono className="text-[var(--t4)]">
            {missingMileage.toLocaleString()}
          </Mono>
        </button>
      </div>
      <div className="mt-4 border-t border-[var(--b1)] pt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--t4)]">
          Reported price type
        </p>
        <div className="flex flex-wrap gap-1.5">
          {priceKinds.slice(0, 6).map((entry) => (
            <button
              key={entry.value}
              type="button"
              aria-pressed={selected.priceKind === entry.value}
              onClick={() => onSelect("priceKind", entry.value)}
              className="min-h-9 rounded-full border border-[var(--b1)] px-2.5 text-[10px] font-semibold aria-pressed:border-[var(--blue)] aria-pressed:text-[var(--blue)]"
            >
              {formatFacet(entry.value)} · {entry.n.toLocaleString()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EvidenceStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--s2)] p-3">
      <Mono className="block text-base font-black text-[var(--t1)]">
        {value.toLocaleString()}
      </Mono>
      <span className="text-[10px] text-[var(--t4)]">{label}</span>
    </div>
  );
}

function formatFacet(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
