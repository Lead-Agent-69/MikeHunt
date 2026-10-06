"use client";

import React from "react";
import useSWR from "swr";
import { Truck, Route } from "lucide-react";

type TransportQuote = {
  miles?: number;
  driveTime?: string;
  quote?: number;
  mode?: "road" | "estimate";
  error?: string;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => (r.ok ? r.json() : null));

/**
 * Transport for a listing, from where it sits to the buyer's home state.
 * Shows numbers only when /api/transport/quote returns a road-routed quote
 * (mode "road"). Otherwise it says to get a transport quote, with no figures.
 * It never makes up mileage, tax rates or DMV fees.
 */
export function FreightAndTaxCalculator({
  buyState,
  homeState,
}: {
  buyState?: string | null;
  homeState?: string | null;
}) {
  const from = buyState?.trim().toUpperCase() || "";
  const to = homeState?.trim().toUpperCase() || "";
  const crossState = Boolean(from && to && from !== to);
  const { data, isLoading } = useSWR<TransportQuote | null>(
    crossState
      ? `/api/transport/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const roadQuote =
    data &&
    data.mode === "road" &&
    typeof data.quote === "number" &&
    typeof data.miles === "number"
      ? data
      : null;

  return (
    <div
      className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6"
      data-testid="transport-quote"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-[#5b9bef] to-[var(--purple)]">
          <Truck className="w-5 h-5" aria-hidden />
        </div>
        <h3 className="text-lg font-black text-[var(--t1)]">Transport</h3>
      </div>

      {roadQuote ? (
        <div className="space-y-2 text-sm text-[var(--t3)]">
          <div className="flex items-center gap-2 font-bold text-[var(--t1)]">
            {from} <Route className="w-4 h-4 text-[var(--t4)]" aria-hidden />{" "}
            {to}
          </div>
          <div className="flex justify-between">
            <span>Road distance</span>
            <span className="font-bold text-[var(--t1)]">
              {Math.round(roadQuote.miles!).toLocaleString()} mi
              {roadQuote.driveTime ? ` · ${roadQuote.driveTime}` : ""}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Transport quote</span>
            <span className="font-bold text-[var(--t1)]">
              ${roadQuote.quote!.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-[var(--t4)]">
            Based on road distance between state centers. Confirm with a carrier
            before you buy. Taxes and title fees depend on your state and are
            not included.
          </p>
        </div>
      ) : (
        <div className="text-sm text-[var(--t3)]">
          <p className="font-bold text-[var(--t1)] mb-1">
            Get a transport quote
          </p>
          <p>
            {isLoading
              ? "Checking road distance…"
              : !to
                ? "Set your home state in Settings, then ask a carrier for a quote to where you live."
                : !from
                  ? "This listing has no location yet. Ask the seller where it is, then get a carrier quote."
                  : !crossState
                    ? "This listing is in your home state. Pickup cost depends on the exact address."
                    : `Ask a carrier for a quote from ${from} to ${to}. Taxes and title fees depend on your state.`}
          </p>
        </div>
      )}
    </div>
  );
}
