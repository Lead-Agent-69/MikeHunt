"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  US_STATES,
  stateName,
  nearestState,
  nearbyStates,
} from "@/lib/geo/us-states";
import { usePreferences } from "@/hooks/usePreferences";
import { Check, MapPin, Plus, X } from "lucide-react";

// "My States" — the location-aware, multi-state curation control. Apple-clean sheet with a spring entrance,
// a drag handle, selected-state tokens, a "Suggested" quick-add row (your location + nearby + most stock),
// and a searchable grid where every state shows its LIVE inventory count. Saves carsStates.

const ALL_CODES = Object.keys(US_STATES).sort((a, b) =>
  stateName(a).localeCompare(stateName(b)),
);

export function StatePicker({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved?: (states: string[]) => void;
}) {
  const { prefs, save } = usePreferences();
  const key = "carsStates";
  const accent = "var(--grad)";
  const noun = "cars";

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [detected, setDetected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(((prefs as any)[key] as string[]) || []));
    setQuery("");
    fetch(`/api/state-counts`)
      .then((r) => r.json())
      .then((d) => setCounts(d.counts || {}))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const detect = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn’t available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const code = nearestState(pos.coords.latitude, pos.coords.longitude);
        if (code) {
          setDetected(code);
          setSelected((s) => new Set(s).add(code));
          toast.success(`📍 ${stateName(code)} added`);
        }
      },
      () => toast.error("Couldn’t get your location"),
      { timeout: 8000 },
    );
  };

  const add = (code: string) => setSelected((s) => new Set(s).add(code));
  const toggle = (code: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  const selectedList = useMemo(
    () =>
      Array.from(selected).sort((a, b) =>
        stateName(a).localeCompare(stateName(b)),
      ),
    [selected],
  );

  // Quick-add "Suggested" row: your location, then nearby states, then the highest-inventory states — minus
  // anything already selected. A Netflix-style "here's what's worth adding" shortcut.
  const suggestions = useMemo(() => {
    const base = detected || selectedList[0];
    const near = base ? Array.from(nearbyStates(base, 5)) : [];
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([c]) => c);
    const out: string[] = [];
    for (const c of [...(detected ? [detected] : []), ...near, ...top]) {
      if (c && US_STATES[c] && !selected.has(c) && !out.includes(c))
        out.push(c);
    }
    return out.slice(0, 8);
  }, [detected, selectedList, counts, selected]);

  const ordered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_CODES.filter(
      (c) =>
        !q || stateName(c).toLowerCase().includes(q) || c.toLowerCase() === q,
    ).sort((a, b) => {
      const sa = selected.has(a) ? 1 : 0;
      const sb = selected.has(b) ? 1 : 0;
      if (sa !== sb) return sb - sa;
      const ca = counts[a] || 0;
      const cb = counts[b] || 0;
      if (ca !== cb) return cb - ca;
      return stateName(a).localeCompare(stateName(b));
    });
  }, [query, selected, counts]);

  const done = async () => {
    setBusy(true);
    try {
      const states = Array.from(selected);
      await save({ [key]: states } as any);
      onSaved?.(states);
      toast.success(
        states.length
          ? `Showing ${noun} in ${states.length} state${states.length > 1 ? "s" : ""}`
          : `Showing ${noun} everywhere`,
      );
      onClose();
    } catch {
      toast.error("Couldn’t save");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div className="animate-sheet sm:animate-springPop relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--b1)] bg-[var(--s0)] shadow-2xl sm:rounded-3xl">
        {/* Drag handle (mobile) */}
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-[var(--b2)] sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 pt-4 sm:pt-6">
          <div>
            <h2 className="serif text-2xl font-bold text-[var(--t1)]">
              Your states
            </h2>
            <p className="mt-1 text-sm text-[var(--t4)]">
              Only see {noun} where you want them. Add as many as you like.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-[var(--t4)] transition-colors hover:bg-[var(--s2)]"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Selected tokens */}
        {selectedList.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-6 pt-4">
            {selectedList.map((code) => (
              <button
                key={code}
                onClick={() => toggle(code)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white transition-transform active:scale-95"
                style={{ background: accent }}
                title="Remove"
              >
                {code} <X className="h-3 w-3 opacity-70" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-2 px-6 pt-4">
          <button
            onClick={detect}
            className="shrink-0 rounded-full border border-[var(--b1)] px-3.5 py-2 text-sm font-bold text-[var(--t2)] transition-colors hover:bg-[var(--s2)]"
          >
            <MapPin
              className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]"
              aria-hidden="true"
            />
            Location
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search states"
            className="min-w-0 flex-1 rounded-full border border-[var(--b1)] bg-[var(--s1)] px-4 py-2 text-sm text-[var(--t1)] outline-none transition-colors focus:border-[var(--brand)]"
          />
        </div>

        {/* Suggested quick-add row */}
        {!query && suggestions.length > 0 && (
          <div className="px-6 pt-4">
            <div className="mb-1.5 text-[11px] font-black uppercase tracking-widest text-[var(--t4)]">
              Suggested
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {suggestions.map((code) => (
                <button
                  key={code}
                  onClick={() => add(code)}
                  className="shrink-0 rounded-full border border-[var(--b1)] bg-[var(--s1)] px-3 py-1.5 text-xs font-bold text-[var(--t2)] transition-colors hover:bg-[var(--s2)]"
                >
                  {detected === code ? (
                    <MapPin
                      className="mr-1 inline h-3 w-3 align-[-2px]"
                      aria-hidden="true"
                    />
                  ) : (
                    <Plus
                      className="mr-1 inline h-3 w-3 align-[-2px]"
                      aria-hidden="true"
                    />
                  )}
                  {stateName(code)}
                  {counts[code] ? (
                    <span className="ml-1 text-[var(--t4)]">
                      {counts[code].toLocaleString()}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Grid */}
        <div className="mt-4 flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ordered.map((code) => {
              const on = selected.has(code);
              const n = counts[code] || 0;
              return (
                <button
                  key={code}
                  onClick={() => toggle(code)}
                  className="relative flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all active:scale-[0.98]"
                  style={{
                    borderColor: on ? "transparent" : "var(--b1)",
                    background: on ? accent : "var(--s1)",
                    color: on ? "#fff" : "var(--t1)",
                  }}
                >
                  {/* Abbreviation badge */}
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-black"
                    style={{
                      background: on ? "rgba(255,255,255,0.22)" : "var(--s2)",
                      color: on ? "#fff" : "var(--t3)",
                    }}
                  >
                    {code}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-sm font-bold">
                        {stateName(code)}
                      </span>
                      {detected === code && (
                        <MapPin
                          className="h-3 w-3 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span
                      className="block text-[11px] font-semibold"
                      style={{
                        color: on ? "rgba(255,255,255,0.85)" : "var(--t4)",
                      }}
                    >
                      {n > 0 ? `${n.toLocaleString()} ${noun}` : "—"}
                    </span>
                  </span>
                  {on && (
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[var(--b1)] px-6 py-4">
          <span className="text-sm font-semibold text-[var(--t4)]">
            {selected.size === 0 ? "Everywhere" : `${selected.size} selected`}
          </span>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="rounded-full px-4 py-2.5 text-sm font-bold text-[var(--t4)] transition-colors hover:bg-[var(--s2)]"
              >
                Clear
              </button>
            )}
            <button
              onClick={done}
              disabled={busy}
              className="rounded-full px-7 py-2.5 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
              style={{ background: accent }}
            >
              {busy ? "Saving…" : "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
