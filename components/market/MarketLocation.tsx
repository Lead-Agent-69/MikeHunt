"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LocateFixed, MapPin, X } from "lucide-react";
import { MarketSearchBuilder } from "./MarketSearchBuilder";
import type { MarketSearchInterpretation } from "@/lib/market/parse-search";
import { usePreferences } from "@/hooks/usePreferences";
import { surroundingStates } from "@/lib/geo/bordering-states";
import { US_STATES } from "@/lib/geo/us-states";
import { validCoords } from "@/lib/geo/buyer-home";
import {
  AREA_RADIUS_STEPS,
  EMPTY_SEARCH_AREA,
  searchAreaMode,
  searchAreaLabel,
  type SearchAreaValue,
  type SearchAreaMode,
} from "@/lib/search/area-scope";

export type MarketLocationValue = SearchAreaValue;
const STATE_CODES = Object.keys(US_STATES).sort((a, b) =>
  US_STATES[a][0].localeCompare(US_STATES[b][0]),
);

export function MarketLocation({
  value,
  onChange,
  search,
}: {
  value: MarketLocationValue;
  onChange: (patch: MarketLocationValue) => void;
  search?: {
    value: string;
    onChange: (value: string) => void;
    onInterpret?: (
      filters: MarketSearchInterpretation["filters"],
      details: Record<string, string>,
    ) => void;
  };
}) {
  const { prefs } = usePreferences();
  const home = prefs.homeLocation;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SearchAreaMode>("nationwide");
  const [near, setNear] = useState("");
  const [radius, setRadius] = useState("100");
  const [pin, setPin] = useState<{ lat: string; lng: string } | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [stateQuery, setStateQuery] = useState("");
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const requestId = useRef(0);
  const radioName = useId();
  const scopeKey = JSON.stringify(value);
  useEffect(() => {
    requestId.current++;
    setLocating(false);
    if (!open) return;
    const applied = JSON.parse(scopeKey) as MarketLocationValue;
    setMode(searchAreaMode(applied));
    setNear(applied.near);
    setRadius(applied.radius || "100");
    setPin(
      validCoords(applied.lat, applied.lng)
        ? { lat: applied.lat, lng: applied.lng }
        : null,
    );
    setStates([...applied.states]);
    setStateQuery("");
    setMessage("");
  }, [open, scopeKey]);
  useEffect(
    () => () => {
      requestId.current++;
    },
    [],
  );
  const stopLocating = () => {
    requestId.current++;
    setLocating(false);
    setMessage("");
  };
  const changeMode = (next: SearchAreaMode) => {
    stopLocating();
    setMode(next);
  };
  const homePlace =
    home?.zip ||
    (home?.city && home.state ? `${home.city}, ${home.state}` : "");
  const city = /^(.+),\s*([A-Za-z]{2})$/.exec(near.trim());
  const validPlace =
    /^\d{5}$/.test(near.trim()) ||
    !!(city?.[1].trim() && US_STATES[city[2].toUpperCase()]);
  const validRadius =
    Number.isInteger(Number(radius)) &&
    Number(radius) >= 1 &&
    Number(radius) <= 1000;
  const canApply =
    !locating &&
    (mode === "nationwide" ||
      (mode === "states"
        ? states.length > 0
        : validRadius && (!!pin || validPlace)));
  const steps = Array.from(
    new Set([...AREA_RADIUS_STEPS, ...(validRadius ? [Number(radius)] : [])]),
  ).sort((a, b) => a - b);
  const draft: MarketLocationValue =
    mode === "nationwide"
      ? { ...EMPTY_SEARCH_AREA }
      : mode === "states"
        ? { ...EMPTY_SEARCH_AREA, states }
        : {
            ...EMPTY_SEARCH_AREA,
            near: pin ? "" : near.trim(),
            radius,
            lat: pin?.lat || "",
            lng: pin?.lng || "",
          };
  const applyArea = () => {
    if (!canApply) return;
    onChange(draft);
    setOpen(false);
  };
  const summary = searchAreaLabel(value);
  const anchor =
    (home?.state && US_STATES[home.state] ? home.state : states[0]) || "";
  return (
    <section
      aria-label="Vehicle search and area"
      className={`grid min-w-0 gap-2 rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-2 lg:p-3 ${search ? "lg:grid-cols-[minmax(0,1fr)_minmax(14rem,24rem)]" : ""}`}
    >
      {search && (
        <div className="relative min-w-0">
          <input
            id="market-vehicle-search"
            aria-label="Search make, model or VIN"
            placeholder="Make, model or VIN"
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            className={`field min-h-11 min-w-0 !w-full !py-2 !text-base ${search.onInterpret ? "!pr-28" : ""}`}
          />
          {search.onInterpret && (
            <MarketSearchBuilder
              location={value}
              home={home}
              onApply={search.onInterpret}
            />
          )}
        </div>
      )}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <button
            id="market-search-area-trigger"
            type="button"
            aria-label={`Search area: ${summary}`}
            title={summary}
            className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--b1)] bg-[var(--s0)] px-3 text-left text-sm font-semibold"
          >
            <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{summary}</span>
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60" />
          <Dialog.Content
            id="market-area-dialog"
            className="fixed inset-0 z-[91] flex h-dvh min-h-0 flex-col bg-[var(--s0)] text-[var(--t1)] shadow-xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-[var(--b1)]"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--b1)] px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]">
              <div>
                <Dialog.Title className="text-lg font-bold">
                  Search area
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[var(--t3)]">
                  Choose where to search. Changes apply together when you’re
                  ready.
                </Dialog.Description>
              </div>
              <Dialog.Close
                aria-label="Close search area"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--b1)]"
              >
                <X className="h-5 w-5" />
              </Dialog.Close>
            </header>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">
                  Search by
                </legend>
                <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-1">
                  {(
                    [
                      ["nationwide", "Nationwide"],
                      ["nearby", "Nearby"],
                      ["states", "States"],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--blue)] ${mode === key ? "bg-[var(--accent)] text-[var(--on-accent)]" : "text-[var(--t3)]"}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name={radioName}
                        value={key}
                        checked={mode === key}
                        onChange={() => changeMode(key)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {mode === "nationwide" && (
                <p className="rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-4 text-sm">
                  Search all collected states. No distance limit applies.
                </p>
              )}
              {mode === "nearby" && (
                <>
                  <label className="block text-sm font-semibold">
                    ZIP or city, state
                    <input
                      id="market-search-location"
                      aria-label="Search location"
                      placeholder="ZIP or city, state"
                      value={near}
                      maxLength={100}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyArea();
                        }
                      }}
                      onChange={(event) => {
                        stopLocating();
                        setPin(null);
                        setNear(event.target.value);
                      }}
                      className="field mt-2 min-h-11 !w-full !text-base"
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={locating}
                      onClick={() => {
                        stopLocating();
                        if (!navigator.geolocation) {
                          setMessage(
                            "Location is unavailable in this browser. Enter a ZIP or city and state.",
                          );
                          return;
                        }
                        const currentRequest = ++requestId.current;
                        setLocating(true);
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            if (currentRequest !== requestId.current) return;
                            setLocating(false);
                            const coords = validCoords(
                              position.coords.latitude,
                              position.coords.longitude,
                            );
                            if (!coords) {
                              setMessage(
                                "That location could not be used. Enter a ZIP or city and state.",
                              );
                              return;
                            }
                            setPin({
                              lat: String(coords.lat),
                              lng: String(coords.lng),
                            });
                            setNear("");
                          },
                          () => {
                            if (currentRequest !== requestId.current) return;
                            setLocating(false);
                            setMessage(
                              "Location could not be read. Enter a ZIP or city and state.",
                            );
                          },
                          { timeout: 10000, maximumAge: 300000 },
                        );
                      }}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-sm font-semibold disabled:opacity-50"
                    >
                      <LocateFixed
                        className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`}
                        aria-hidden="true"
                      />
                      {locating ? "Locating…" : "Use my location"}
                    </button>
                    {homePlace && (
                      <button
                        type="button"
                        onClick={() => {
                          stopLocating();
                          setPin(null);
                          setNear(homePlace);
                          setRadius(String(home?.radiusMi || 100));
                        }}
                        className="min-h-11 rounded-lg border border-[var(--b1)] px-3 text-sm font-semibold"
                      >
                        Use saved home
                      </button>
                    )}
                  </div>
                  {pin && (
                    <p
                      role="status"
                      className="text-sm font-semibold text-[var(--blue)]"
                    >
                      Using your current location. Apply to search around it.
                    </p>
                  )}
                  {!pin && !validPlace && (
                    <p className="text-sm text-[var(--t3)]">
                      Enter a five-digit ZIP code or a city and state, such as
                      St. Louis, MO.
                    </p>
                  )}
                  <label className="block text-sm font-semibold">
                    Distance from location{" "}
                    <span className="float-right font-bold">
                      {radius} miles
                    </span>
                    <input
                      aria-label="Search radius"
                      aria-valuetext={`${radius} miles`}
                      type="range"
                      min={0}
                      max={steps.length - 1}
                      step={1}
                      value={Math.max(0, steps.indexOf(Number(radius)))}
                      onChange={(event) =>
                        setRadius(String(steps[Number(event.target.value)]))
                      }
                      className="mt-2 min-h-11 w-full accent-[var(--blue)]"
                    />
                    <span
                      aria-hidden="true"
                      className="flex justify-between text-xs text-[var(--t3)]"
                    >
                      <span>5 mi</span>
                      <span>1,000 mi</span>
                    </span>
                  </label>
                  <p className="text-xs leading-relaxed text-[var(--t3)]">
                    A radius crosses state borders. Locations are approximate;
                    listings without coordinates cannot match a distance search.
                  </p>
                </>
              )}
              {mode === "states" && (
                <>
                  <p className="text-sm text-[var(--t3)]">
                    Search entire states with no distance limit.
                  </p>
                  {anchor && (
                    <button
                      type="button"
                      onClick={() => setStates(surroundingStates(anchor))}
                      className="min-h-11 rounded-lg border border-[var(--b1)] px-3 text-sm font-semibold"
                    >
                      {anchor} + surrounding states
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="min-w-0 flex-1 text-sm font-semibold">
                      Find a state
                      <input
                        aria-label="Find a state"
                        type="search"
                        value={stateQuery}
                        onChange={(event) => setStateQuery(event.target.value)}
                        className="field mt-2 min-h-11 !w-full !text-base"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setStates([])}
                      disabled={!states.length}
                      className="min-h-11 self-end rounded-lg px-3 text-sm font-semibold disabled:opacity-40"
                    >
                      Clear
                    </button>
                  </div>
                  <p className="text-xs text-[var(--t3)]">
                    {states.length} selected
                  </p>
                  <div className="grid grid-cols-1 gap-1 min-[360px]:grid-cols-2">
                    {STATE_CODES.filter((code) =>
                      `${code} ${US_STATES[code][0]}`
                        .toLowerCase()
                        .includes(stateQuery.trim().toLowerCase()),
                    ).map((code) => (
                      <label
                        key={code}
                        className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${states.includes(code) ? "border-[var(--blue)] bg-[var(--s2)]" : "border-[var(--b1)]"}`}
                      >
                        <input
                          type="checkbox"
                          checked={states.includes(code)}
                          onChange={() =>
                            setStates((current) =>
                              current.includes(code)
                                ? current.filter((state) => state !== code)
                                : [...current, code],
                            )
                          }
                          className="h-5 w-5 shrink-0 accent-[var(--blue)]"
                        />
                        {US_STATES[code][0]}
                        <span className="ml-auto text-xs text-[var(--t3)]">
                          {code}
                        </span>
                      </label>
                    ))}
                  </div>
                  {!STATE_CODES.some((code) =>
                    `${code} ${US_STATES[code][0]}`
                      .toLowerCase()
                      .includes(stateQuery.trim().toLowerCase()),
                  ) && (
                    <p role="status" className="text-sm text-[var(--t3)]">
                      No matching state.
                    </p>
                  )}
                  {!states.length && (
                    <p className="text-sm text-[var(--t3)]">
                      Choose at least one state, or switch to Nationwide.
                    </p>
                  )}
                </>
              )}
              {message && (
                <p
                  role="status"
                  className="text-sm font-semibold text-[var(--amber-d)]"
                >
                  {message}
                </p>
              )}
            </div>
            <footer className="shrink-0 space-y-3 border-t border-[var(--b1)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <p aria-live="polite" className="text-sm font-semibold">
                {mode === "states" && !states.length
                  ? "Choose states"
                  : searchAreaLabel(draft)}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Dialog.Close className="min-h-11 rounded-lg border border-[var(--b1)] px-3 text-sm font-bold">
                  Cancel
                </Dialog.Close>
                <button
                  type="button"
                  disabled={!canApply}
                  onClick={applyArea}
                  className="min-h-11 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-[var(--on-accent)] disabled:opacity-40"
                >
                  Apply area
                </button>
              </div>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
