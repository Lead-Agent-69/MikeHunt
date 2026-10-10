// Server helpers shared by POST /api/check-listing and POST /api/check-listing/batch.
// Service-role reads (lib/supabase createServerComponentClient): RLS and column grants do not
// apply, so only the desk-specific card from readForDesk ever leaves the server.

import { getServerUser } from "@/lib/server-supabase";
import { resolveBuyerHome } from "@/lib/geo/buyer-home";
import type { GeoPoint } from "@/lib/geo/buyer-distance";
import { cached } from "@/lib/cache";
import type { CheckListingInput, CheckListingSelf } from "./check-listing";
import {
  loadCheckListingData,
  type CheckListingData,
} from "./check-listing-data";

/** Desk- and home-dependent responses: never cached by a browser or CDN. */
export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** In-memory (per instance) cache of the unredacted market data for a tracked deal. */
export const CHECK_CACHE_TTL_MS = 10 * 60_000;
/** Most deals one batch request may ask for. */
export const CHECK_BATCH_MAX = 20;
/** Single check (may scrape a URL), guests: 5 requests / min per client IP. */
export const CHECK_GUEST_RATE = {
  key: "check-listing",
  limit: 5,
  windowMs: 60_000,
} as const;
/** Single check, signed in: 20 requests / min per user.id (IP rotation doesn't help). */
export const CHECK_USER_RATE = {
  key: "check-listing-user",
  limit: 20,
  windowMs: 60_000,
} as const;
/** List cards, a separate bucket: 30 requests × 20 deals = 600 cards / min per client. */
export const CHECK_BATCH_RATE = {
  key: "check-listing-batch",
  limit: 30,
  windowMs: 60_000,
} as const;

export const TRACKED_DEAL_COLUMNS =
  "id, year, make, model, trim, mileage, ask_price, source, source_deal_id, source_url, vin, location_state, location_zip, condition, damage_type, last_seen_at, auction_end_at, updated_at";

export interface TrackedDealRow {
  id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  ask_price: number | null;
  source: string | null;
  source_deal_id: string | null;
  source_url: string | null;
  vin: string | null;
  location_state: string | null;
  location_zip: string | null;
  condition: string | null;
  damage_type: string | null;
  last_seen_at: string | null;
  auction_end_at: string | null;
  updated_at: string | null;
}

/** Tracked deals by id, one query. Missing / failed ids are simply absent. */
export async function loadTrackedDeals(
  supabase: any,
  ids: readonly string[],
): Promise<Map<string, TrackedDealRow>> {
  const out = new Map<string, TrackedDealRow>();
  if (!ids.length) return out;
  try {
    const { data, error } = await supabase
      .from("deals")
      .select(TRACKED_DEAL_COLUMNS)
      .in("id", ids as string[])
      .limit(ids.length);
    if (error) return out;
    for (const r of (data || []) as TrackedDealRow[]) out.set(String(r.id), r);
  } catch {
    /* no rows */
  }
  return out;
}

/** The check input for a tracked deal; `override` (validated body fields) wins per field. */
export function trackedInput(
  row: TrackedDealRow,
  override: Partial<CheckListingInput> = {},
): CheckListingInput {
  return {
    year: row.year ?? null,
    make: String(row.make || ""),
    model: String(row.model || ""),
    trim: row.trim ?? null,
    mileage: row.mileage ?? null,
    price: Number(row.ask_price) || 0,
    zip: row.location_zip ?? null,
    state: row.location_state ?? null,
    title: row.condition ?? null,
    damageType: row.damage_type ?? null,
    vin: row.vin ?? null,
    source: row.source ?? null,
    sourceDealId: row.source_deal_id ?? null,
    url: row.source_url ?? null,
    ...Object.fromEntries(
      Object.entries(override).filter(([, v]) => v != null),
    ),
    dealId: row.id,
  };
}

export function trackedSelf(row: TrackedDealRow): CheckListingSelf {
  return {
    id: String(row.id),
    source: row.source ?? null,
    sourceDealId: row.source_deal_id ?? null,
    sourceUrl: row.source_url ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    auctionEndAt: row.auction_end_at ?? null,
  };
}

/**
 * Market data for a tracked deal, cached for CHECK_CACHE_TTL_MS keyed by deal id + updated_at
 * (a re-scraped / edited deal gets a fresh key). Unredacted on purpose: the desk read runs per
 * request. Failures are not cached.
 */
export function trackedDealData(
  supabase: any,
  row: TrackedDealRow,
  input: CheckListingInput,
): Promise<CheckListingData | null> {
  return cached(
    `check-listing:v1:${row.id}:${row.updated_at || ""}`,
    CHECK_CACHE_TTL_MS,
    () =>
      loadCheckListingData(supabase, input, Date.now(), trackedSelf(row)).catch(
        () => null,
      ),
    (d) => d != null,
  );
}

/** The signed-in caller's user id, or null (signed out / auth unavailable). */
export async function serverUserId(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await getServerUser();
    return user?.id ? String(user.id) : null;
  } catch {
    return null;
  }
}

/**
 * The signed-in buyer's saved home (resolveBuyerHome: prefs.homeLocation, then the legacy profile
 * columns, never a default state). Null when signed out or nothing is saved.
 */
export async function savedBuyerHome(
  supabase: any,
  userId: string | null,
): Promise<GeoPoint | null> {
  if (!userId) return null;
  try {
    const [{ data: profile }, { data: prefRow }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("home_state, home_zip, home_lat, home_lng")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("user_preferences")
        .select("prefs")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    return resolveBuyerHome({
      prefsHomeLocation: (prefRow?.prefs as { homeLocation?: unknown } | null)
        ?.homeLocation,
      profile,
    });
  } catch {
    return null;
  }
}

/** JSON 500 for anything thrown: generic text only, never the error message. */
export const INTERNAL_ERROR = {
  error: "Something went wrong checking this listing. Please try again.",
  code: "INTERNAL",
} as const;

/** Saved home by default; validated body home values only override it. Never a default state. */
export function buyerHomeFor(
  saved: GeoPoint | null,
  override: { state: string | null; zip: string | null },
): GeoPoint | null {
  if (!override.state) return saved;
  if (
    saved?.state === override.state &&
    (!override.zip || override.zip === saved.zip)
  )
    return saved;
  return override.zip
    ? { state: override.state, zip: override.zip }
    : { state: override.state };
}
