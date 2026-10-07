"use client";

import { useState, useCallback } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { StatePicker } from "./StatePicker";
import {
  effectiveHome,
  effectiveSearchLocations,
} from "@/lib/preferences/locations";
import { legacyStatesMirror } from "@/lib/preferences/location-form";
import { MapPin } from "lucide-react";

// The nav/feed chip that shows the current state scope ("MO +1" / "All states") and opens the picker.
// onChange fires with the new state list so the host surface can re-scope its content immediately.
export function MyStatesButton({
  onChange,
  className,
  statesOverride,
}: {
  onChange?: (states: string[]) => void;
  className?: string;
  statesOverride?: string[];
}) {
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const defaultMarket = prefs.buyerScope?.state || prefs.carsState;
  // URL scope first, then the saved carsStates mirror, then the #66 home + search locations
  // (prefs written without the legacy mirror), then the single default market.
  const hasLocationPrefs =
    prefs.homeLocation != null || Array.isArray(prefs.searchLocations);
  const states =
    statesOverride ||
    prefs.carsStates ||
    (hasLocationPrefs
      ? legacyStatesMirror(
          effectiveHome(prefs),
          effectiveSearchLocations(prefs),
        )
      : undefined) ||
    (defaultMarket && defaultMarket.toUpperCase() !== "NATIONWIDE"
      ? [defaultMarket]
      : []);
  const label =
    states.length === 0
      ? prefsLoading
        ? "…"
        : "All states"
      : states.length === 1
        ? states[0]
        : `${states[0]} +${states.length - 1}`;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ||
          "interactive-surface premium-focus inline-flex items-center gap-1.5 rounded-full border border-[var(--b1)] bg-[var(--s0)] px-3.5 py-2 text-[13px] font-bold text-[var(--t2)] shadow-[var(--shadow2)] hover:text-[var(--t1)]"
        }
        title={
          states.length === 0
            ? "Listings in all states"
            : `Listings in ${states.join(", ")}`
        }
        aria-label={`Choose location: ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{ minHeight: 44, minWidth: 44 }}
      >
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
      <StatePicker
        open={open}
        onClose={close}
        initialStates={states}
        onSaved={onChange}
      />
    </>
  );
}
