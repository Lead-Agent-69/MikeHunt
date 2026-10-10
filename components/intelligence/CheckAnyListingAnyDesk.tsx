"use client";

import { usePreferences } from "@/hooks/usePreferences";
import { effectiveHome } from "@/lib/preferences/locations";
import { CheckAnyListing } from "@/components/intelligence/CheckAnyListing";

/**
 * Check any listing for a desk that can't use /find's flip tools (personal, DIY,
 * parts). Same card; /api/check-listing decides the desk server-side, so these
 * buyers get the personal-desk read (fair value, Buy ≤, verdict) with no profit or
 * resale numbers. Home state comes from saved preferences only.
 */
export function CheckAnyListingAnyDesk() {
  const { prefs } = usePreferences();
  const homeState = effectiveHome(prefs)?.state || null;
  return <CheckAnyListing homeState={homeState} />;
}
