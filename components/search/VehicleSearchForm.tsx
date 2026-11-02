"use client";

import { Search } from "lucide-react";

/** The same controlled search field at arrival and when returning while scrolling. */
export function VehicleSearchForm({
  value,
  onChange,
  onSubmit,
  disabled = false,
  label = "Search all vehicle inventory",
  showSubmit = true,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  label?: string;
  showSubmit?: boolean;
}) {
  return (
    <form
      role="search"
      aria-label={`${label} form`}
      className="flex min-w-0 flex-1 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    >
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--t3)]"
        />
        <input
          type="search"
          aria-label={label}
          placeholder="Make, model or VIN"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          enterKeyHint="search"
          autoComplete="off"
          className="feedback-input min-h-12 w-full min-w-0 rounded-full border border-[var(--b2)] bg-[var(--s1)] py-2 pl-11 pr-4 text-base text-[var(--t1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        />
      </div>
      {showSubmit && (
        <button
          type="submit"
          disabled={disabled}
          className="feedback-action min-h-12 shrink-0 rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Search
        </button>
      )}
    </form>
  );
}
