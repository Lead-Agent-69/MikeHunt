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
import { readListing, type CheckListingInput } from "@/lib/intelligence/check-listing";
import {
  loadCheckListingData,
  readForDesk,
} from "@/lib/intelligence/check-listing-data";
import { parseCheckListingBody } from "@/lib/intelligence/check-listing-input";

// POST /api/check-listing: "Check any listing" (docs/intelligence-advisor.md).
//   { url }                                     a listing page from any site
//   { vin?, year?, make?, model?, mileage?, price, zip?, title? }   or the car's details
// → { read } : one card (verdict, fair value, Buy ≤, resale + where, profit, confidence, why).
// The URL is read once through save-from-url's guarded, IP-pinned fetch (public http(s) only,
// redirects re-checked) with schema.org JSON-LD parsing. Prices come only from the page or the
// user; nothing is invented. Works signed out (personal desk); flip desks see profit and where to sell.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { key: "check-listing", limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = parseCheckListingBody(raw);
  if ("error" in parsed)
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  const fields = parsed.fields;
  let input: Partial<CheckListingInput> = { ...fields };

  if (parsed.url) {
    let page: Record<string, any> | null;
    try {
      page = await scrapeOrParseListing(parsed.url, detectSource(parsed.url));
    } catch (e) {
      if (e instanceof UrlNotAllowedError)
        return NextResponse.json(
          { error: "That link can't be opened. Paste a public listing link." },
          { status: 400 },
        );
      page = null;
    }
    if (!page)
      return NextResponse.json(
        {
          error:
            "We couldn't read that page. Enter the year, make, model, miles and price instead.",
          code: "PAGE_UNREADABLE",
        },
        { status: 422 },
      );
    input = {
      ...input,
      url: parsed.url,
      source: detectSource(parsed.url).replace(/-/g, "_"),
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
    return NextResponse.json(
      { error: "Add the make and model (or a VIN).", code: "NEED_VEHICLE" },
      { status: 400 },
    );
  if (!input.price || !(Number(input.price) > 0))
    return NextResponse.json(
      { error: "Add the asking price.", code: "NEED_PRICE" },
      { status: 400 },
    );

  const full = input as CheckListingInput;
  const [data, flipDesk] = await Promise.all([
    loadCheckListingData(createServerComponentClient(), full).catch(() => null),
    resolveCallerFlipDesk(),
  ]);
  if (!data)
    return NextResponse.json(
      { error: "Market data is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  const read = readListing({ ...full, dealId: data.dealId }, data.comps, {
    timing: data.timing,
    priceHistory: data.priceHistory,
    buyerHome: parsed.homeState ? { state: parsed.homeState } : null,
  });
  return NextResponse.json({ read: readForDesk(read, flipDesk), desk: flipDesk ? "flip" : "personal" });
}
