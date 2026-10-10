"use client";

import useSWR from "swr";
import type { HomeLocation, SearchLocation } from "@/lib/preferences/locations";

// User view preferences. Reads /api/preferences (RLS-scoped to the user) and gives an optimistic
// `save(patch)` that merges. Used by the settings page and by the deal pages to land the user on their
// preferred state without re-picking each visit.

export interface Prefs {
  workspaceMode?: "focused" | "expanded";
  workspaceAccess?: "community";
  /** Where the user lives (signup / profile). Weighted 3x for scraping; local radius + same-state comps. */
  homeLocation?: HomeLocation | null;
  /** Markets the user added on purpose (max 10). Weighted 2x; own comps + travel/shipping in ranking. */
  searchLocations?: SearchLocation[];
  carsState?: string; // legacy default state; fallback for homeLocation
  /** Set when home/search locations were saved; Discover shows "Scanning…" while warming. */
  locationDemandAt?: string;
  locationDemandStates?: string[];
  carsStates?: string[]; // legacy multi-state hunt list; fallback for searchLocations
  buyerScope?: {
    buyerMode?: "personal" | "diy" | "parts" | "reseller" | "dealer";
    vehicle?: string;
    vehicles?: string[];
    lane?: string;
    laneValue?: string;
    state?: string;
    titleType?: string;
    sellerType?: string;
    maxPrice?: number;
    minPrice?: number;
    targetProfit?: number;
    timeline?: "now" | "month" | "research";
    repairCapability?: "none" | "basic" | "advanced";
    includeRepairable?: boolean;
    preferredMakes?: string[];
    makes?: string[];
    watchedDealers?: string[];
    watchedDealerSourceIds?: string[];
  };
  watchedDealerHosts?: string[];
  watchedDealerSourceIds?: string[];
}

const fetcher = async (u: string) => {
  const response = await fetch(u);
  if (!response.ok) throw new Error("Preferences could not be loaded");
  return response.json();
};

export function usePreferences() {
  const { data, mutate, isLoading, error } = useSWR<
    { prefs: Prefs; authed?: boolean } | { error: string }
  >("/api/preferences", fetcher, { revalidateOnFocus: false });

  const prefs: Prefs = data && "prefs" in data ? data.prefs : {};
  const authed = !!data && "prefs" in data && data.authed !== false;

  const save = async (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    mutate({ prefs: next, authed }, false); // optimistic
    try {
      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Preferences could not be saved");
    } finally {
      mutate();
    }
    return next;
  };

  return { prefs, save, authed, isLoading, error };
}
