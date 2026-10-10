"use client";

import { useState } from "react";

/**
 * Thumbs up/down on one alert match. Saving a rating does not change matching by itself; ratings
 * feed the precision suggestion shown on /searches for the search that produced this match.
 */
export function AlertFeedback({
  alertId,
  initial,
  hasSearch,
}: {
  alertId: string;
  initial: number | null;
  hasSearch: boolean;
}) {
  const [value, setValue] = useState<number | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rate(next: 1 | -1) {
    const target = value === next ? 0 : next;
    const prev = value;
    setValue(target === 0 ? null : target);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/alerts/${encodeURIComponent(alertId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: target }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setValue(prev);
      setError("Rating not saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-semibold disabled:opacity-50";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--t4)]">
      <span id={`fb-${alertId}`}>Good match?</span>
      <div
        role="group"
        aria-labelledby={`fb-${alertId}`}
        className="flex gap-2"
      >
        <button
          type="button"
          disabled={busy}
          aria-pressed={value === 1}
          aria-label="Good match"
          onClick={() => rate(1)}
          className={`${btn} ${value === 1 ? "border-[var(--green)] text-[var(--green)]" : "border-[var(--b2)] text-[var(--t2)]"}`}
        >
          <span aria-hidden="true">👍</span>
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={value === -1}
          aria-label="Not a good match"
          onClick={() => rate(-1)}
          className={`${btn} ${value === -1 ? "border-[var(--red)] text-[var(--red)]" : "border-[var(--b2)] text-[var(--t2)]"}`}
        >
          <span aria-hidden="true">👎</span>
        </button>
      </div>
      {hasSearch && (
        <span>
          Your ratings can suggest a tighter or looser setting for this search.
        </span>
      )}
      {error && (
        <span role="alert" className="text-[var(--red)]">
          {error}
        </span>
      )}
    </div>
  );
}
