"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { US_STATES } from "@/lib/utils/titleRules";
import { usePreferences } from "@/hooks/usePreferences";
import {
  MAX_SEARCH_LOCATIONS,
  effectiveHome,
  effectiveSearchLocations,
} from "@/lib/preferences/locations";
import {
  RADIUS_OPTIONS_MI,
  addSearchLocation,
  homeLocationFromForm,
  homeLocationPatch,
  locationLabel,
  removeSearchLocation,
  searchLocationsPatch,
  type LocationFormInput,
} from "@/lib/preferences/location-form";

const fieldCls =
  "rounded-lg bg-[var(--s1)] border border-[var(--b2)] text-[var(--t1)] text-sm font-semibold px-3 py-2 min-h-11 focus:outline-none focus:border-[var(--b3)]";

const EMPTY_FORM: LocationFormInput = {
  state: "",
  city: "",
  zip: "",
  radiusMi: "",
};

function LocationFields({
  idPrefix,
  value,
  onChange,
  stateLabel,
}: {
  idPrefix: string;
  value: LocationFormInput;
  onChange: (next: LocationFormInput) => void;
  stateLabel: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-[var(--t3)]">{stateLabel}</span>
        <select
          id={`${idPrefix}-state`}
          className={fieldCls}
          value={value.state}
          onChange={(e) => onChange({ ...value, state: e.target.value })}
        >
          <option value="">Choose…</option>
          {US_STATES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-[var(--t3)]">City</span>
        <input
          id={`${idPrefix}-city`}
          className={fieldCls}
          value={value.city || ""}
          maxLength={60}
          placeholder="Optional"
          onChange={(e) => onChange({ ...value, city: e.target.value })}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-[var(--t3)]">ZIP</span>
        <input
          id={`${idPrefix}-zip`}
          className={fieldCls}
          value={value.zip || ""}
          inputMode="numeric"
          maxLength={5}
          placeholder="Optional"
          onChange={(e) =>
            onChange({ ...value, zip: e.target.value.replace(/\D/g, "") })
          }
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-[var(--t3)]">Radius</span>
        <select
          id={`${idPrefix}-radius`}
          className={fieldCls}
          value={String(value.radiusMi || "")}
          onChange={(e) => onChange({ ...value, radiusMi: e.target.value })}
        >
          <option value="">Whole state</option>
          {RADIUS_OPTIONS_MI.map((mi) => (
            <option key={mi} value={mi}>
              {mi} mi
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * Home location (where you live) and search locations (markets you add on purpose) are separate
 * prefs: prefs.homeLocation and prefs.searchLocations[]. Legacy carsState / carsStates are mirrored
 * on every save so older readers (nav chip, feed scope) stay consistent.
 */
export function LocationPrefs() {
  const { prefs, save } = usePreferences();
  const home = useMemo(() => effectiveHome(prefs) || null, [prefs]);
  const search = useMemo(() => effectiveSearchLocations(prefs), [prefs]);

  const [homeForm, setHomeForm] = useState<LocationFormInput>(EMPTY_FORM);
  const [addForm, setAddForm] = useState<LocationFormInput>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const homeKey = home ? JSON.stringify(home) : "";
  useEffect(() => {
    setHomeForm(
      home
        ? {
            state: home.state,
            city: home.city || "",
            zip: home.zip || "",
            radiusMi: home.radiusMi ? String(home.radiusMi) : "",
          }
        : EMPTY_FORM,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey]);

  const run = async (patch: Parameters<typeof save>[0], ok: string) => {
    setBusy(true);
    try {
      await save(patch);
      toast.success(ok);
      return true;
    } catch {
      toast.error("Could not save. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveHome = async () => {
    const built = homeLocationFromForm(homeForm);
    if ("error" in built) return toast.error(built.error);
    await run(homeLocationPatch(built.home, search), "Home location saved");
  };

  const clearHome = async () => {
    await run(homeLocationPatch(null, search), "Home location cleared");
  };

  const addMarket = async () => {
    const next = addSearchLocation(search, addForm, home);
    if ("error" in next) return toast.error(next.error);
    if (
      await run(searchLocationsPatch(home, next.list), "Search location added")
    )
      setAddForm(EMPTY_FORM);
  };

  const removeMarket = async (id: string) => {
    await run(
      searchLocationsPatch(home, removeSearchLocation(search, id)),
      "Search location removed",
    );
  };

  return (
    <div className="flex flex-col gap-6" data-testid="location-prefs">
      <section aria-labelledby="home-location-heading">
        <h3
          id="home-location-heading"
          className="text-sm font-black text-[var(--t1)]"
        >
          Home location
        </h3>
        <p className="mt-1 mb-3 text-[12px] text-[var(--t4)]">
          The state you live in. Listings there come first.
          {home ? ` Currently ${locationLabel(home)}.` : " Not set yet."}
        </p>
        <LocationFields
          idPrefix="home"
          value={homeForm}
          onChange={setHomeForm}
          stateLabel="Home state"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveHome}
            disabled={busy}
            className="min-h-11 rounded-lg px-4 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "var(--grad)" }}
          >
            Save home
          </button>
          {home && (
            <button
              type="button"
              onClick={clearHome}
              disabled={busy}
              className="min-h-11 rounded-lg border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t2)] hover:bg-[var(--s2)] disabled:opacity-60"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      <section
        aria-labelledby="search-locations-heading"
        className="border-t border-[var(--b1)] pt-5"
      >
        <h3
          id="search-locations-heading"
          className="text-sm font-black text-[var(--t1)]"
        >
          Search locations
        </h3>
        <p className="mt-1 mb-3 text-[12px] text-[var(--t4)]">
          Other markets you want to shop, up to {MAX_SEARCH_LOCATIONS}. Deals
          there include travel or shipping in the math.
        </p>
        {search.length > 0 ? (
          <ul
            className="mb-3 flex flex-wrap gap-2"
            aria-label="Search locations"
          >
            {search.map((loc) => (
              <li
                key={loc.id}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--b2)] bg-[var(--s1)] py-1 pl-3 pr-1 text-[13px] font-semibold text-[var(--t2)]"
              >
                {locationLabel(loc)}
                <button
                  type="button"
                  onClick={() => removeMarket(loc.id)}
                  disabled={busy}
                  aria-label={`Remove ${locationLabel(loc)}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--t4)] hover:bg-[var(--s2)] hover:text-[var(--t1)]"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-[12px] font-semibold text-[var(--t3)]">
            No extra markets yet. You will see listings in your home state only.
          </p>
        )}
        {search.length < MAX_SEARCH_LOCATIONS && (
          <>
            <LocationFields
              idPrefix="search"
              value={addForm}
              onChange={setAddForm}
              stateLabel="State"
            />
            <button
              type="button"
              onClick={addMarket}
              disabled={busy}
              className="mt-3 min-h-11 rounded-lg border border-[var(--b2)] px-4 text-sm font-bold text-[var(--t1)] hover:bg-[var(--s2)] disabled:opacity-60"
            >
              Add search market
            </button>
          </>
        )}
      </section>
    </div>
  );
}
