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
      className="rounded-2xl border border-[var(--b1)] bg-[var(--s1)] p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (near.trim()) searchArea(near);
          else if (value.lat) onChange({ radius });
        }}
        className={`grid items-end gap-3 ${search ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_8rem_auto] sm:grid-cols-2" : "sm:grid-cols-[minmax(0,1fr)_8rem_auto]"}`}
      >
        {search && (
          <label className="min-w-0 text-xs font-semibold text-[var(--t3)]">
            Vehicle or VIN
            <input
              aria-label="Search make, model or VIN"
              placeholder="Make, model or VIN"
              value={search.value}
              onChange={(event) => search.onChange(event.target.value)}
              className="field mt-1 min-h-11 !w-full"
            />
          </label>
        )}
        <label className="min-w-0 text-xs font-semibold text-[var(--t3)]">
          <span className="mb-1 flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            ZIP code or city, state
          </span>
          <input
            aria-label="Search location"
            list="market-city-anchors"
            placeholder="ZIP or city, state"
            value={near}
            onChange={(event) => setNear(event.target.value)}
            maxLength={100}
            className="field min-h-11 !w-full"
          />
        </label>
        <label className="text-xs font-semibold text-[var(--t3)]">
          Radius
          <select
            aria-label="Search radius"
            value={radius}
            onChange={(event) => setRadius(event.target.value)}
            className="field mt-1 min-h-11 !w-full"
          >
            {[25, 50, 100, 150, 200, 250, 500, 1000].map((miles) => (
              <option key={miles} value={miles}>
                {miles.toLocaleString()} miles
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-[var(--blue)] px-4 text-xs font-bold text-white"
        >
          Search this area
        </button>
      </form>
      <datalist id="market-city-anchors">
        {MISSOURI_SEARCH_MARKETS.map((market) => (
          <option key={market.zip} value={`${market.city}, MO`}>
            {market.zip}
          </option>
        ))}
      </datalist>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <button
          type="button"
          disabled={locating}
          className="inline-flex min-h-11 items-center gap-1 font-semibold disabled:opacity-50"
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
          <LocateFixed className="h-3 w-3" />
          {locating ? "Locating…" : "Use my location"}
        </button>
        {home && (
          <button
            type="button"
            className="min-h-11 font-semibold"
            onClick={() => {
              const place =
                home.zip || (home.city ? `${home.city}, ${home.state}` : "");
              if (place) searchArea(place, String(home.radiusMi || 100));
              else
                onChange({
                  near: "",
                  radius: "",
                  lat: "",
                  lng: "",
                  states: [home.state],
                });
            }}
          >
            Saved home · {home.city || home.zip || home.state}
          </button>
        )}
        {(home?.state || value.states[0]) && (
          <button
            type="button"
            className="min-h-11 font-semibold"
            onClick={() =>
              onChange({
                near: "",
                radius: "",
                lat: "",
                lng: "",
                states: surroundingStates(home?.state || value.states[0]),
              })
            }
          >
            Home + surrounding states
          </button>
        )}
        <button
          type="button"
          className="min-h-11 font-semibold"
          onClick={() => {
            setNear("");
            setMessage("");
            onChange({ near: "", radius: "", lat: "", lng: "", states: [] });
          }}
        >
          Nationwide
        </button>
      </div>
      {message && (
        <p role="status" className="mt-1 text-xs text-[var(--t3)]">
          {message}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--t3)]">
        {value.near || value.lat
          ? `Within ${value.radius || "100"} miles of ${value.near || "your location"}. Radius searches cross state lines; listings without coordinates are excluded. Distances use approximate source locations.`
          : value.states.length
            ? `Searching ${value.states.join(", ")}. Add a ZIP or city for a radius search.`
            : "Searching all states. Set a location for nearby inventory, or choose states in the filters."}
      </p>
    </section>
  );
}
