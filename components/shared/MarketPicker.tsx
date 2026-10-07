"use client";

import { useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";

// Guided first-run: a new user with no saved market picks their state RIGHT HERE (not buried in Settings)
// and instantly sees deals near them. Saves the preference + calls onPick so the page repersonalizes
// without a round-trip. Shown only until a market is set. This is what turns the app's depth into a
// value-in-60-seconds first impression.

const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
];

export function MarketPicker({
  onPick,
  accent = "var(--brand)",
}: {
  onPick?: (state: string) => void;
  accent?: string;
}) {
  const { save } = usePreferences();
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const key = "carsState";
  const noun = "BUY deals";

  const choose = async (st: string) => {
    setVal(st);
    if (!st) return;
    setSaving(true);
    try {
      await save({ [key]: st });
      onPick?.(st);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-[var(--r3)] border p-4 flex flex-col sm:flex-row sm:items-center gap-3"
      style={{
        borderColor: accent,
        background: "color-mix(in srgb, " + accent + " 8%, var(--s0))",
      }}
    >
      <div className="text-2xl leading-none">📍</div>
      <div className="flex-1 min-w-0">
        <div className="font-black text-[var(--t1)]">Pick your market</div>
        <div className="text-xs text-[var(--t3)] mt-0.5">
          See {noun} in your home state from saved inventory — you can widen to nearby or nationwide
          anytime.
        </div>
      </div>
      <select
        value={val}
        disabled={saving}
        onChange={(e) => choose(e.target.value)}
        className="rounded-xl border border-[var(--b2)] bg-[var(--s0)] text-[var(--t1)] text-sm font-semibold px-3 py-2.5 min-w-[160px] focus:outline-none"
        aria-label="Choose your state"
      >
        <option value="">{saving ? "Saving…" : "Choose your state…"}</option>
        {US_STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
