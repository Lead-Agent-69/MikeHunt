"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronDown, Columns2 } from "lucide-react";
import { vendorIdentity } from "@/lib/sources/vendor-identity";

export type ComparablePoint = {
  key: string;
  id?: string;
  x: number;
  y: number;
  me: boolean;
  name: string;
  source?: string;
  location?: string;
  priceLabel: string;
};
const uuid = (value?: string) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function ComparableInspector({
  point,
  points,
  onSelect,
  dealId,
}: {
  point?: ComparablePoint;
  points: ComparablePoint[];
  onSelect: (key: string) => void;
  dealId: string;
}) {
  if (!point) return null;
  const canOpen = uuid(point.id) && point.id !== dealId;
  const canCompare = canOpen && uuid(dealId);
  return (
    <div className="mt-4 w-full border-t border-[var(--b1)] pt-4 min-w-0 space-y-3">
      <label className="block text-xs font-semibold text-[var(--t2)]">
        Selected vehicle
        <div className="relative mt-1">
          <select
            value={point.key}
            onChange={(event) => onSelect(event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] pl-2 pr-9 text-sm text-[var(--t1)]"
          >
            {points.map((candidate) => (
              <option key={candidate.key} value={candidate.key}>
                {candidate.me ? "This vehicle: " : ""}
                {candidate.name} &#183; {currency.format(candidate.y)} &#183;{" "}
                {candidate.x.toLocaleString()} mi
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--t2)]"
          />
        </div>
      </label>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="min-w-0"
      >
        <p className="text-sm font-bold break-words text-[var(--t1)]">
          {point.name}
          {point.me ? " \u00b7 this vehicle" : ""}
        </p>
        <p className="text-xs text-[var(--t3)] break-words">
          {point.priceLabel}:{" "}
          <span className="font-semibold text-[var(--t1)]">
            {currency.format(point.y)}
          </span>{" "}
          &#183; {point.x.toLocaleString()} mi
        </p>
        {point.source && (
          <p className="text-xs text-[var(--t3)] break-words">
            {vendorIdentity(point.source).label}
            {point.location ? ` \u00b7 ${point.location}` : ""}
          </p>
        )}
      </div>
      {canOpen && (
        <div className="flex flex-wrap gap-2">
          <Link
            prefetch={false}
            href={`/deal/${point.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r2)] border border-[var(--b2)] px-3 text-xs font-semibold text-[var(--t1)]"
          >
            <ArrowUpRight size={15} aria-hidden="true" />
            Open vehicle
          </Link>
          {canCompare && (
            <Link
              prefetch={false}
              href={`/compare?ids=${dealId},${point.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r2)] border border-[var(--b2)] px-3 text-xs font-semibold text-[var(--t1)]"
            >
              <Columns2 size={15} aria-hidden="true" />
              Compare with this vehicle
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
