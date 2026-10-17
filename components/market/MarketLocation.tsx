"use client";

import { useEffect, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
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

export function MarketLocation({
  value,
  onChange,
  search,
}: {
  value: MarketLocationValue;
  onChange: (patch: Partial<MarketLocationValue>) => void;
  search?: { value: string; onChange: (value: string) => void };
}) {
  const { prefs } = usePreferences();
  const home = prefs.homeLocation;
  const [near, setNear] = useState(value.near);
  const [radius, setRadius] = useState(value.radius || "100");
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    setNear(value.near);
    setRadius(value.radius || "100");
  }, [value.near, value.radius]);
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
      aria-label="Location and radius"
      className="rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-2.5 sm:p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (near.trim()) searchArea(near);
          else if (value.lat) onChange({ radius });
        }}
        className={`grid grid-cols-[minmax(0,1fr)_8rem] items-end gap-2 sm:gap-3 ${search ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_8rem_auto] sm:grid-cols-2" : "sm:grid-cols-[minmax(0,1fr)_8rem_auto]"}`}
      >
        {search && (
          <label className="col-span-2 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-xs font-semibold text-[var(--t3)] sm:col-span-1 sm:grid-cols-1 sm:gap-0">
            Vehicle or VIN
            <input
              aria-label="Search make, model or VIN"
              placeholder="Make, model or VIN"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              className="field min-h-11 min-w-0 !w-full !py-2 !text-base sm:mt-1"
            />
          </label>
        )}
        <label className="min-w-0 text-xs font-semibold text-[var(--t3)]">
          <span className="mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            ZIP or city, state
          </span>
          <input
            id="market-search-location"
            aria-label="Search location"
            list="market-city-anchors"
            placeholder="ZIP or city, state"
            value={near}
            onChange={(event) => setNear(event.target.value)}
            maxLength={100}
            className="field min-h-11 !w-full !py-2 !text-base"
          />
        </label>
        <label className="text-xs font-semibold text-[var(--t3)]">
          Radius
          <select
            aria-label="Search radius"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
            className="field mt-1 min-h-11 !w-full !py-2 !text-base"
          >
            {[25, 50, 100, 150, 200, 250, 500, 1000].map((miles) => (
              <option key={miles} value={miles}>
                {miles.toLocaleString()} miles
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex items-center gap-2 lg:col-span-1">
          <button
            type="submit"
            aria-label="Search this area"
            className="min-h-11 shrink-0 rounded-lg bg-[var(--accent)] px-3 text-sm font-bold text-[var(--on-accent)]"
          >
            Search
          </button>
          <button
            type="button"
            disabled={locating}
            aria-label={locating ? "Locating" : "Use my location"}
            title={locating ? "Locating" : "Use my location"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--b1)] font-semibold disabled:opacity-50"
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
            />
          </button>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search area</span>
            <select
              aria-label="Search area"
              value={
                value.near || value.lat
                  ? home?.zip === value.near ||
                    (home?.city && `${home.city}, ${home.state}` === value.near)
                    ? "home"
                    : "nearby"
                  : value.states.length
                    ? "states"
                    : "nationwide"
              }
              className="field min-h-11 min-w-0 !w-full !py-2 !text-base"
              onChange={(event) => {
                if (event.target.value === "nationwide") {
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
                  if (place) searchArea(place, String(home.radiusMi || 100));
                  else
                    onChange({
                      near: "",
                      radius: "",
                      lat: "",
                      lng: "",
                      states: [home.state],
                    });
                } else if (event.target.value === "surrounding") {
                  setNear("");
                  setMessage("");
                  onChange({
                    near: "",
                    radius: "",
                    lat: "",
                    lng: "",
                    states: surroundingStates(home?.state || value.states[0]),
                  });
                }
              }}
            >
              <option value="nationwide">Nationwide</option>
              {(value.near || value.lat) && (
                <option value="nearby">Nearby</option>
              )}
              {value.states.length > 0 && (
                <option value="states">Selected states</option>
              )}
              {home && <option value="home">Saved home</option>}
              {(home?.state || value.states[0]) && (
                <option value="surrounding">Home + nearby states</option>
              )}
            </select>
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
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--t3)]">
        {value.near || value.lat
          ? `${value.radius || "100"} mi of ${value.near || "your location"} · approximate locations; vehicles without coordinates excluded.`
          : value.states.length
            ? `Searching ${value.states.join(", ")}. Add a ZIP or city for a radius search.`
            : "Nationwide · all collected states"}
      </p>
    </section>
  );
}
