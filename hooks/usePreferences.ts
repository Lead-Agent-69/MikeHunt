"use client";

import useSWR from "swr";
import type { HomeLocation, SearchLocation } from "@/lib/preferences/locations";

// User view preferences. Reads /api/preferences (RLS-scoped to the user) and confirms
// `save(patch)` from the server. Used by settings and deal pages to land users on their
// preferred state without re-picking each visit.

export interface Prefs {
  profileContact?: { phone?: string; city?: string; state?: string };
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
    if (isLoading || error)
      throw new Error("Load your saved preferences before making changes");
    const response = await fetch("/api/preferences", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...(authed ? { "x-require-account": "true" } : {}),
      },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw new Error("Preferences could not be saved");
    const confirmed = await response.json();
    if (
      !confirmed.prefs ||
      typeof confirmed.prefs !== "object" ||
      (authed && confirmed.authed === false)
    ) {
      throw new Error("Sign in again to save to your account");
    }
    await mutate(
      { prefs: confirmed.prefs, authed: confirmed.authed ?? authed },
      false,
    );
    return confirmed.prefs as Prefs;
  };

  return { prefs, save, authed, isLoading, error, retry: () => mutate() };
}
