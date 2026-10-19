"use client";

import { useEffect, useState } from "react";
import { ChevronDown, LocateFixed, MapPin } from "lucide-react";
import { MarketSearchBuilder } from "./MarketSearchBuilder";
import type { MarketSearchInterpretation } from "@/lib/market/parse-search";
import { OPEN_MARKET_LOCATION_EVENT } from "@/lib/market/events";
import { usePreferences } from "@/hooks/usePreferences";
import { surroundingStates } from "@/lib/geo/bordering-states";
import { MISSOURI_SEARCH_MARKETS } from "@/lib/geo/missouri-markets";

export type MarketLocationValue = {
  near: string;
  radius: string;
  lat: string;
  lng: string;
  states: string[];
};

const RADIUS_STEPS = [5, 10, 25, 50, 75, 100, 150, 200, 250, 500, 1000];

export function MarketLocation({
  value,
  onChange,
  search,
}: {
  value: MarketLocationValue;
  onChange: (patch: Partial<MarketLocationValue>) => void;
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
  const [near, setNear] = useState(value.near);
  const [radius, setRadius] = useState(value.radius || "100");
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const areaLabel =
    value.near || value.lat
      ? `Within ${value.radius || "100"} mi of ${value.near || "your location"}`
      : value.states.length
        ? value.states.join(", ")
        : "Nationwide";

  useEffect(() => {
    setNear(value.near);
    setRadius(value.radius || "100");
  }, [value.near, value.radius]);

  useEffect(() => {
    const openLocation = () => {
      setLocationOpen(true);
      window.setTimeout(() => {
        const input = document.getElementById("market-search-location");
        input?.scrollIntoView?.({ block: "center", behavior: "instant" });
        input?.focus({ preventScroll: true });
      }, 0);
    };
    window.addEventListener(OPEN_MARKET_LOCATION_EVENT, openLocation);
    return () =>
      window.removeEventListener(OPEN_MARKET_LOCATION_EVENT, openLocation);
  }, []);

  const searchArea = (place: string, miles = radius) => {
    if (
      !/^\d{5}$/.test(place.trim()) &&
      !/^.+,\s*[A-Za-z]{2}$/.test(place.trim())
    ) {
      setMessage(
        "Enter a five-digit ZIP code or a city and state, such as St. Louis, MO.",
      );
      return;
    }
    setMessage("");
    setLocationOpen(false);
    onChange({
      near: place.trim(),
      radius: miles,
      lat: "",
      lng: "",
      states: [],
    });
  };

  return (
    <section
      aria-label="Search area"
      className="overflow-hidden rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-2 lg:p-3"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (near.trim()) searchArea(near);
          else if (value.lat) {
            onChange({ radius });
            setLocationOpen(false);
          }
        }}
        className={`grid min-w-0 grid-cols-1 items-end gap-2 lg:gap-3 ${search ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_7.5rem_auto]" : "lg:grid-cols-[minmax(0,1fr)_7.5rem_auto]"}`}
      >
        {search && (
          <div className="min-w-0 text-xs font-semibold text-[var(--t3)]">
            <label
              htmlFor="market-vehicle-search"
              className="sr-only lg:not-sr-only"
            >
              Vehicle or VIN
            </label>
            <div className="relative lg:mt-1">
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
          </div>
        )}
        <button
          type="button"
          aria-expanded={locationOpen}
          aria-controls="market-location-controls"
          onClick={() => setLocationOpen((open) => !open)}
          className="flex min-h-11 min-w-0 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-left text-sm lg:hidden"
        >
          <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <span className="sr-only">Search area: </span>
            {areaLabel}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 ${locationOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
        <div
          id="market-location-controls"
          className={`${locationOpen ? "grid" : "hidden"} min-w-0 gap-2 lg:contents`}
        >
          <label className="min-w-0 text-xs font-semibold text-[var(--t3)]">
            <span className="mb-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              Search location
            </span>
            <input
              id="market-search-location"
              aria-label="ZIP or city, state"
              list="market-city-anchors"
              placeholder="ZIP or city, state"
              value={near}
              onChange={(event) => setNear(event.target.value)}
              maxLength={100}
              className="field min-h-11 !w-full !py-2 !text-base"
            />
          </label>
          <div className="grid min-w-0 grid-cols-2 gap-2 lg:contents">
            <label className="min-w-0 text-xs font-semibold text-[var(--t3)]">
              <span className="mb-1 block">Within</span>
              <select
                aria-label="Distance from location"
                value={radius}
                onChange={(event) => setRadius(event.target.value)}
                className="field mt-1 min-h-11 !w-full !py-2 !text-base"
              >
                {!RADIUS_STEPS.includes(Number(radius)) && (
                  <option value={radius}>{radius} mi</option>
                )}
                {RADIUS_STEPS.map((miles) => (
                  <option key={miles} value={miles}>
                    {miles.toLocaleString()} mi
                  </option>
                ))}
              </select>
            </label>
            <div className="contents lg:grid lg:grid-cols-[minmax(9rem,1fr)_auto_auto] lg:items-end lg:gap-2">
              <button
                type="submit"
                aria-label="Apply search area"
                className="order-2 col-span-1 flex min-h-11 items-center justify-center rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-[var(--on-accent)]"
              >
                Apply area
              </button>
              <button
                type="button"
                disabled={locating}
                aria-label={locating ? "Locating" : "Use my location"}
                title={locating ? "Locating" : "Use my location"}
                className="order-3 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--b1)] px-3 font-semibold disabled:opacity-50 lg:w-11 lg:px-0"
                onClick={() => {
                  if (!navigator.geolocation) {
                    setMessage(
                      "Location is unavailable in this browser. Enter a ZIP code or city and state.",
                    );
                    return;
                  }
                  setLocating(true);
                  setMessage("");
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      onChange({
                        near: "",
                        lat: String(position.coords.latitude),
                        lng: String(position.coords.longitude),
                        radius,
                        states: [],
                      });
                      setLocating(false);
                      setLocationOpen(false);
                    },
                    () => {
                      setMessage(
                        "Location could not be read. Enter a ZIP code or city and state.",
                      );
                      setLocating(false);
                    },
                    { timeout: 10000, maximumAge: 300000 },
                  );
                }}
              >
                <LocateFixed
                  className={`h-4 w-4 ${locating ? "animate-pulse" : ""}`}
                  aria-hidden="true"
                />
                <span className="text-sm lg:sr-only">Use location</span>
              </button>
              <label className="order-1 min-w-0 text-xs font-semibold text-[var(--t3)]">
                <span className="mb-1 block">Search area</span>
                <select
                  aria-label="Search area shortcut"
                  value={
                    value.near || value.lat
                      ? home?.zip === value.near ||
                        (home?.city &&
                          `${home.city}, ${home.state}` === value.near)
                        ? "home"
                        : "nearby"
                      : value.states.length
                        ? "states"
                        : "nationwide"
                  }
                  className="field min-h-11 min-w-0 !w-full !py-2 !text-base"
                  onChange={(event) => {
                    if (event.target.value === "nationwide") {
                      setLocationOpen(false);
                      setNear("");
                      setMessage("");
                      onChange({
                        near: "",
                        radius: "",
                        lat: "",
                        lng: "",
                        states: [],
                      });
                    } else if (event.target.value === "home" && home) {
                      const place =
                        home.zip ||
                        (home.city ? `${home.city}, ${home.state}` : "");
                      if (place)
                        searchArea(place, String(home.radiusMi || 100));
                      else {
                        setLocationOpen(false);
                        onChange({
                          near: "",
                          radius: "",
                          lat: "",
                          lng: "",
                          states: [home.state],
                        });
                      }
                    } else if (event.target.value === "surrounding") {
                      setLocationOpen(false);
                      setNear("");
                      setMessage("");
                      onChange({
                        near: "",
                        radius: "",
                        lat: "",
                        lng: "",
                        states: surroundingStates(
                          home?.state || value.states[0],
                        ),
                      });
                    }
                  }}
                >
                  <option value="nationwide">Nationwide</option>
                  {(value.near || value.lat) && (
                    <option value="nearby">
                      Within {value.radius || radius || "100"} mi of{" "}
                      {value.near || "your location"}
                    </option>
                  )}
                  {value.states.length > 0 && (
                    <option value="states">Selected states</option>
                  )}
                  {home && <option value="home">Saved home area</option>}
                  {(home?.state || value.states[0]) && (
                    <option value="surrounding">Home + nearby states</option>
                  )}
                </select>
              </label>
            </div>
          </div>
          <label className="block text-xs font-semibold text-[var(--t3)] lg:hidden">
            Distance · {radius} mi
            <input
              type="range"
              aria-label="Adjust distance from location"
              aria-valuetext={`${radius} miles`}
              min={0}
              max={RADIUS_STEPS.length - 1}
              step={1}
              value={Math.max(0, RADIUS_STEPS.indexOf(Number(radius)))}
              onChange={(event) =>
                setRadius(String(RADIUS_STEPS[Number(event.target.value)]))
              }
              className="mt-1 min-h-11 w-full accent-[var(--blue)]"
            />
            <span className="flex justify-between text-[11px]">
              <span>5 mi</span>
              <span>100 mi</span>
              <span>1,000 mi</span>
            </span>
          </label>
        </div>
      </form>
      <datalist id="market-city-anchors">
        {MISSOURI_SEARCH_MARKETS.map((market) => (
          <option key={market.zip} value={`${market.city}, MO`}>
            {market.zip}
          </option>
        ))}
      </datalist>
      {message && (
        <p role="status" className="mt-1 text-xs text-[var(--t3)]">
          {message}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--t3)]">
        {value.near || value.lat
          ? `Within ${value.radius || "100"} mi of ${value.near || "your location"}. Location is approximate; vehicles without coordinates are excluded.`
          : value.states.length
            ? `Searching ${value.states.join(", ")}. Add a ZIP or city for a radius search.`
            : "Nationwide · all collected states"}
      </p>
    </section>
  );
}
