export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { UrlNotAllowedError } from "@/lib/net/public-url";
import { scrapeOrParseListing } from "@/lib/save-from-url/scrape-listing";
import { detectSource } from "@/lib/save-from-url/detect-source";
import { decodeVin } from "@/lib/vehicle/nhtsa";
import { zipToState } from "@/lib/geo/zip-state";
import { resolveCallerFlipDesk } from "@/lib/deals/deal-desk-access";
import { getServerUser } from "@/lib/server-supabase";
import { resolveBuyerHome } from "@/lib/geo/buyer-home";
import type { GeoPoint } from "@/lib/geo/buyer-distance";
import {
  readListing,
  readPersonal,
  type CheckListingInput,
} from "@/lib/intelligence/check-listing";
import {
  ebayItemId,
  loadCheckListingData,
} from "@/lib/intelligence/check-listing-data";
import { parseCheckListingBody } from "@/lib/intelligence/check-listing-input";

// The card depends on the caller's desk and saved home: never cache it anywhere.
const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

/**
 * The signed-in buyer's saved home (lib/geo/buyer-home resolveBuyerHome: prefs.homeLocation, then
 * the legacy profile columns, never a default state). Null when signed out or nothing is saved.
 */
async function savedBuyerHome(supabase: any): Promise<GeoPoint | null> {
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (!user?.id) return null;
    const [{ data: profile }, { data: prefRow }] = await Promise.all([
      supabase
        .from("user_profiles")
        .select("home_state, home_zip, home_lat, home_lng")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("user_preferences").select("prefs").eq("user_id", user.id).maybeSingle(),
    ]);
    return resolveBuyerHome({
      prefsHomeLocation: (prefRow?.prefs as { homeLocation?: unknown } | null)?.homeLocation,
      profile,
    });
  } catch {
    return null;
  }
}

// POST /api/check-listing: "Check any listing" (docs/intelligence-advisor.md).
//   { url }                                     a listing page from any site
//   { vin?, year?, make?, model?, mileage?, price, zip?, title? }   or the car's details
// → { read } : one card (verdict, fair value, Buy ≤, resale + where, profit, confidence, why).
// The URL is read once through save-from-url's guarded, IP-pinned fetch (public http(s) only,
// redirects re-checked) with schema.org JSON-LD parsing. Prices come only from the page or the
// user; nothing is invented. Works signed out (personal desk: retail fair value where the car sits);
// flip desks see dealer resale, profit and where to sell. Responses are private, no-store.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "check-listing", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) {
    const limited = tooManyRequests(rl);
    limited.headers.set("Cache-Control", NO_STORE["Cache-Control"]);
    return limited;
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  const parsed = parseCheckListingBody(raw);
  if ("error" in parsed)
    return json({ error: parsed.error }, 400);
  const fields = parsed.fields;
  let input: Partial<CheckListingInput> = { ...fields };

  if (parsed.url) {
    let page: Record<string, any> | null;
    try {
      page = await scrapeOrParseListing(parsed.url, detectSource(parsed.url));
    } catch (e) {
      if (e instanceof UrlNotAllowedError)
        return json({ error: "That link can't be opened. Paste a public listing link." }, 400);
      page = null;
    }
    if (!page)
      return json(
        {
          error:
            "We couldn't read that page. Enter the year, make, model, miles and price instead.",
          code: "PAGE_UNREADABLE",
        },
        422,
      );
    const itemId = ebayItemId(parsed.url);
    input = {
      ...input,
      url: parsed.url,
      source: detectSource(parsed.url).replace(/-/g, "_"),
      // The channel's own id (eBay item id), so the car is never its own sold comp.
      sourceDealId: itemId,
      year: input.year ?? page.year ?? null,
      make: input.make ?? page.make,
      model: input.model ?? page.model,
      trim: input.trim ?? page.trim ?? null,
      mileage: input.mileage ?? page.mileage ?? null,
      price: input.price ?? page.ask_price,
      vin: input.vin ?? (page.vin || null),
      state: input.state ?? page.location_state ?? null,
      title: input.title ?? page.condition ?? null,
    };
  }

  // VIN fills in year/make/model (NHTSA vPIC, free) when the user didn't.
  if (input.vin && (!input.make || !input.model || !input.year)) {
    const d = await decodeVin(input.vin);
    if (d)
      input = {
        ...input,
        year: input.year ?? d.year,
        make: input.make ?? d.make ?? undefined,
        model: input.model ?? d.model ?? undefined,
        trim: input.trim ?? d.trim,
      };
  }
  if (!input.state && input.zip) input.state = zipToState(input.zip);

  if (!input.make || !input.model)
    return json({ error: "Add the make and model (or a VIN).", code: "NEED_VEHICLE" }, 400);
  if (!input.price || !(Number(input.price) > 0))
    return json({ error: "Add the asking price.", code: "NEED_PRICE" }, 400);

  const full = input as CheckListingInput;
  const supabase = createServerComponentClient();
  const [data, flipDesk, saved] = await Promise.all([
    loadCheckListingData(supabase, full).catch(() => null),
    resolveCallerFlipDesk(),
    savedBuyerHome(supabase),
  ]);
  if (!data)
    return json({ error: "Market data is temporarily unavailable. Please try again." }, 503);
  // Saved home (server-side) by default; the body's homeState only overrides it (the /find
  // "view another base" picker). Never a default state.
  const buyerHome: GeoPoint | null =
    parsed.homeState && parsed.homeState !== saved?.state
      ? { state: parsed.homeState }
      : saved;
  const opts = {
    timing: data.timing,
    priceHistory: data.priceHistory,
    self: data.self,
    fetchedNow: !!parsed.url,
    buyerHome,
  };
  const withIds = { ...full, dealId: data.dealId };
  // Personal desk never runs the flip evaluation: no sell market, resale or profit is computed.
  const read = flipDesk
    ? readListing(withIds, data.comps, opts)
    : readPersonal(withIds, data.comps, opts);
  return json({ read, desk: read.desk });
}
