"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { ArrowLeftRight, Truck } from "lucide-react";
import { SelectField } from "@/components/shared/Field";
import { US_STATES } from "@/lib/utils/titleRules";
import { useDealerId } from "@/hooks/useDealerId";
import { Skeleton } from "@/components/shared/Skeleton";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/usePreferences";
import { discoverHomeState } from "@/lib/discovery/home-state";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Route unavailable");
  return response.json();
};

function MovePageInner() {
  const { dealerId, loading: dealerLoading } = useDealerId();
  const searchParams = useSearchParams();
  const fromParam = (searchParams.get("from") || "").toUpperCase();
  const toParam = (searchParams.get("to") || "").toUpperCase();
  const [fromState, setFromState] = useState(
    US_STATES.includes(fromParam) ? fromParam : "",
  );
  const [toState, setToState] = useState(
    US_STATES.includes(toParam) ? toParam : "",
  );
  // No invented TX → CA default: origin comes from the deal (?from=) or the saved home
  // state; destination is the home state when moving a deal, otherwise the user picks it.
  const [routeTouched, setRouteTouched] = useState(false);
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const homeState = prefsLoading
    ? ""
    : discoverHomeState(prefs.homeLocation, prefs.carsState);
  const urlFrom = US_STATES.includes(fromParam) ? fromParam : "";
  useEffect(() => {
    if (routeTouched || prefsLoading || !homeState) return;
    if (urlFrom) {
      setToState((prev) => prev || homeState);
    } else {
      setFromState((prev) => prev || homeState);
    }
  }, [routeTouched, prefsLoading, homeState, urlFrom]);
  const { data, error, isLoading, mutate } = useSWR(
    dealerId && !dealerLoading && fromState && toState && fromState !== toState
      ? `/api/transport/quote?from=${fromState}&to=${toState}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300000 },
  );
  const validRoute =
    !error &&
    !isLoading &&
    data?.mode === "road" &&
    Number.isFinite(data?.miles) &&
    data.miles > 0 &&
    Number.isFinite(data?.quote) &&
    data.quote > 0 &&
    data.from === fromState &&
    data.to === toState;
  const stateOptions = [
    { value: "", label: "Choose state" },
    ...US_STATES.map((s) => ({ value: s, label: s })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24 md:pb-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--t1)]">
          <Truck className="h-5 w-5" aria-hidden="true" /> Transport planning
        </h1>
        <p className="mt-2 text-sm text-[var(--t3)]">
          Choose the pickup and destination states. Confirm vehicle condition
          and exact addresses with a carrier before booking.
        </p>
      </header>
      <section
        className="border-y border-[var(--b1)] py-5"
        aria-label="Transport route"
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <SelectField
              label="From State"
              options={stateOptions}
              value={fromState}
              onChange={(e) => {
                setRouteTouched(true);
                setFromState(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            aria-label="Swap states"
            title="Swap states"
            className="premium-focus mt-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[var(--b2)]"
            onClick={() => {
              setRouteTouched(true);
              setFromState(toState);
              setToState(fromState);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <SelectField
              label="To State"
              options={stateOptions}
              value={toState}
              onChange={(e) => {
                setRouteTouched(true);
                setToState(e.target.value);
              }}
            />
          </div>
        </div>
      </section>
      {dealerLoading || isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {!dealerLoading && !dealerId ? (
        <p role="status">Please sign in to plan transport.</p>
      ) : null}
      {!fromState || !toState ? (
        <p role="status" className="text-sm text-[var(--t3)]">
          Enter a route to see transport estimates.
        </p>
      ) : null}
      {fromState && toState && fromState === toState ? (
        <p role="status" className="text-sm text-[var(--t3)]">
          For a local move, ask a carrier for a quote using the exact pickup and
          delivery addresses. No local price has been calculated.
        </p>
      ) : null}
      {error || (data && !validRoute && !isLoading && fromState !== toState) ? (
        <div role="status" className="space-y-3 text-sm text-[var(--t3)]">
          <p>
            A reliable road route is unavailable. No transport price is
            confirmed.
          </p>
          <Button variant="outline" onClick={() => void mutate()}>
            Try again
          </Button>
        </div>
      ) : null}
      {validRoute ? (
        <section className="space-y-3" aria-label="Transport planning estimate">
          <h2 className="text-base font-semibold text-[var(--t1)]">
            Route planning estimate
          </h2>
          <p className="text-sm text-[var(--t3)]">
            {fromState} → {toState} · {Math.round(data.miles).toLocaleString()}{" "}
            road miles between state centers, not the vehicle and your address.
          </p>
          <div className="flex items-center justify-between gap-4 border-y border-[var(--b1)] py-4">
            <span className="text-sm text-[var(--t2)]">
              Open carrier planning estimate
            </span>
            <strong className="text-lg text-[var(--t1)]">
              ${Math.round(data.quote).toLocaleString()}
            </strong>
          </div>
          <p className="text-xs leading-relaxed text-[var(--t4)]">
            Model assumption: $0.78 per road mile plus $50, with a $150 minimum.
            This is not a carrier quote. Non-running vehicles, loading, exact
            addresses, timing, and availability can change the cost. No booking
            or delivery date is confirmed.
          </p>
        </section>
      ) : null}
      <section className="space-y-3 border-t border-[var(--b1)] pt-5">
        <h2 className="text-base font-semibold text-[var(--t1)]">
          Get a carrier quote
        </h2>
        <p className="text-sm text-[var(--t3)]">
          For self-drive, enclosed transport, or multi-vehicle loads, request a
          quote for your actual route and vehicle condition. No bundle savings
          have been verified.
        </p>
        <a
          href="https://www.uship.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="premium-focus inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)]"
          aria-label="Visit uShip (opens in a new tab)"
        >
          Visit uShip
        </a>
      </section>
      <section className="border-t border-[var(--b1)] pt-5">
        <h2 className="text-base font-semibold text-[var(--t1)]">
          Title and registration
        </h2>
        <p className="mt-2 text-sm text-[var(--t3)]">
          Title transfer eligibility has not been verified. Confirm the title
          brand, required documents, fees, and deadlines with the destination
          state's DMV before purchase.
        </p>
      </section>
    </div>
  );
}

export default function MovePage() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-40 max-w-3xl" />}>
      <MovePageInner />
    </Suspense>
  );
}
