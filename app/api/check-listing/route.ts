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
import {
  readForDesk,
  type CheckListingInput,
} from "@/lib/intelligence/check-listing";
import {
  ebayItemId,
  loadCheckListingData,
  type CheckListingData,
} from "@/lib/intelligence/check-listing-data";
import { parseCheckListingBody } from "@/lib/intelligence/check-listing-input";
import {
  CHECK_SINGLE_RATE,
  NO_STORE,
  buyerHomeFor,
  loadTrackedDeals,
  savedBuyerHome,
  trackedDealData,
  trackedInput,
  trackedSelf,
} from "@/lib/intelligence/check-listing-server";

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE });

// POST /api/check-listing: "Check any listing" (docs/intelligence-advisor.md).
//   { url }                                     a listing page from any site
//   { dealId }                                  a car we track: read from our DB, no scrape
//   { vin?, year?, make?, model?, mileage?, price, zip?, state?, title? }   or the car's details
//   homeState? / homeZip?                       override the signed-in buyer's saved home
// → { read, desk } : one card (verdict, fair value, Buy ≤, resale + where, profit, confidence, why).
// The URL is read once through save-from-url's guarded, IP-pinned fetch (public http(s) only,
// redirects re-checked) with schema.org JSON-LD parsing. Prices come only from the page, our DB or
// the user; nothing is invented. Works signed out (personal desk: retail fair value where the car
// sits, verdict gated on confidence); flip desks see dealer resale, profit and where to sell.
// Responses are private, no-store. Rate limit: 10 / min per client (list cards use /batch).
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { ...CHECK_SINGLE_RATE });
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
  if ("error" in parsed) return json({ error: parsed.error }, 400);
  const fields = parsed.fields;
  const supabase = createServerComponentClient();
  let input: Partial<CheckListingInput> = { ...fields };
  let data: CheckListingData | null = null;
  let fetchedNow = false;

  if (parsed.dealId && !parsed.url) {
    // A tracked deal: our own row (freshness, price history, source ids, URL, VIN), not a scrape.
    const row = (await loadTrackedDeals(supabase, [parsed.dealId])).get(
      parsed.dealId,
    );
    if (!row)
      return json(
        { error: "We couldn't find that car.", code: "DEAL_NOT_FOUND" },
        404,
      );
    input = trackedInput(row, fields);
    if (input.make && input.model && Number(input.price) > 0) {
      // Cached per deal + updated_at; body overrides of the car itself bypass the cache.
      data = Object.keys(fields).length
        ? await loadCheckListingData(
            supabase,
            input as CheckListingInput,
            Date.now(),
            trackedSelf(row),
          ).catch(() => null)
        : await trackedDealData(supabase, row, input as CheckListingInput);
      if (!data)
        return json(
          {
            error: "Market data is temporarily unavailable. Please try again.",
          },
          503,
        );
    }
  } else if (parsed.url) {
    let page: Record<string, any> | null;
    try {
      page = await scrapeOrParseListing(parsed.url, detectSource(parsed.url));
    } catch (e) {
      if (e instanceof UrlNotAllowedError)
        return json(
          { error: "That link can't be opened. Paste a public listing link." },
          400,
        );
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
    fetchedNow = true;
    input = {
      ...input,
      url: parsed.url,
      dealId: parsed.dealId ?? undefined,
      source: detectSource(parsed.url).replace(/-/g, "_"),
      // The channel's own id (eBay item id), so the car is never its own sold comp.
      sourceDealId: ebayItemId(parsed.url),
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
    return json(
      { error: "Add the make and model (or a VIN).", code: "NEED_VEHICLE" },
      400,
    );
  if (!input.price || !(Number(input.price) > 0))
    return json({ error: "Add the asking price.", code: "NEED_PRICE" }, 400);

  const full = input as CheckListingInput;
  const [loaded, flipDesk, saved] = await Promise.all([
    data
      ? Promise.resolve(data)
      : loadCheckListingData(supabase, full).catch(() => null),
    resolveCallerFlipDesk(),
    savedBuyerHome(supabase),
  ]);
  if (!loaded)
    return json(
      { error: "Market data is temporarily unavailable. Please try again." },
      503,
    );
  const read = readForDesk(
    { ...full, dealId: loaded.dealId },
    loaded.comps,
    {
      timing: loaded.timing,
      priceHistory: loaded.priceHistory,
      self: loaded.self,
      fetchedNow,
      // Saved home (server-side) by default; body home values only override. No default state.
      buyerHome: buyerHomeFor(saved, {
        state: parsed.homeState,
        zip: parsed.homeZip,
      }),
    },
    flipDesk,
  );
  return json({ read, desk: read.desk });
}
