"use client";

import { useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { StatePicker } from "./StatePicker";
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
  const { prefs } = usePreferences();
  const [open, setOpen] = useState(false);
  const states =
    statesOverride || ((prefs as any).carsStates as string[] | undefined) || [];
  const label =
    states.length === 0
      ? "All states"
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
        title="Choose which states to see"
      >
        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
      <StatePicker
        open={open}
        onClose={() => setOpen(false)}
        onSaved={onChange}
      />
    </>
  );
}
