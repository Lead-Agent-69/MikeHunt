"use client";

import useSWR from "swr";

// User view preferences. Reads /api/preferences (RLS-scoped to the user) and gives an optimistic
// `save(patch)` that merges. Used by the settings page and by the deal pages to land the user on their
// preferred state without re-picking each visit.

export interface Prefs {
  carsState?: string; // default state to view
  carsStates?: string[]; // multi-state "hunt list" for cars
}

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function usePreferences() {
  const { data, mutate, isLoading } = useSWR<
    { prefs: Prefs } | { error: string }
  >("/api/preferences", fetcher, { revalidateOnFocus: false });

  const prefs: Prefs = data && "prefs" in data ? data.prefs : {};
  const authed = !(data && "error" in (data as any));

  const save = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    mutate({ prefs: next }, false); // optimistic
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
    } finally {
      mutate();
    }
    return next;
  };

  return { prefs, save, authed, isLoading };
}
