export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { normalizeVehicleSpec } from "@/lib/vehicle/spec-filters";
import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import {
  listingsForDesk,
  resolveCallerFlipDesk,
} from "@/lib/deals/deal-desk-access";
import {
  dealLane,
  LANE_COLORS,
  type DealLane,
} from "@/lib/discovery/categorize";
import { cached } from "@/lib/cache";
import { fetchAllRows } from "@/lib/db/paginate";
import { applyCustomerInventory } from "@/lib/search/customer-inventory";
import { photoEvidence } from "@/lib/images/photo-evidence";
import { applyLiveAuctionWindow } from "@/lib/search/live-auction-window";
import {
  SOURCE_PRICE_FIELDS,
  sourcePriceContext,
} from "@/lib/deals/source-price-context";
import {
  parseMarketLocation,
  marketDistance,
  summarizeMarket,
  canonicalMarketMake,
  MARKET_PRICE_KINDS,
  type MarketPriceMileageCell,
  type MarketRangeBand,
} from "@/lib/market/explorer";
import { geocodeZip } from "@/lib/geo/geocode";
import { boundingBox } from "@/lib/geo/distance";
import { validCoords } from "@/lib/geo/buyer-home";
import { vendorIdentity } from "@/lib/sources/vendor-identity";
import { marketValuation } from "@/lib/market/valuation";
import { marketSourceCoverage } from "@/lib/market/source-coverage";
import {
  parseTitleTypes,
  titleCategoryOrFilter,
} from "@/lib/deals/title-category";
import {
  applyVehicleDetails,
  applyRepairEligibility,
  applySellerTypes,
  applySelectedSources,
  validateInventoryRanges,
  VEHICLE_CATEGORY_FILTERS,
  INVENTORY_SOURCE_FILTERS,
} from "@/lib/search/inventory-filters";

// /api/market/explore — the advanced sourcing engine. A dealer filters the whole market by state(s),
// channel/lane, price, year, mileage, make, condition, verdict, and source — and chooses CURATED (the
// deals worth acting on) vs WHOLE MARKET (everything active). Returns the filtered rows PLUS facet
// counts (states, lanes, makes) so the UI can show live counts next to every filter. Lane is computed,
// not stored, so page through the eligible SQL-filtered set before lane filtering and faceting.

function csv(p: string | null): string[] {
  return (p || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const MARKET_PRICE_BANDS: MarketRangeBand[] = [
  { from: 1, to: 9_999, label: "Below $10k" },
  { from: 10_000, to: 19_999, label: "$10k–$20k" },
  { from: 20_000, to: 29_999, label: "$20k–$30k" },
  { from: 30_000, to: 49_999, label: "$30k–$50k" },
  { from: 50_000, to: 74_999, label: "$50k–$75k" },
  { from: 75_000, to: null, label: "$75k+" },
];

const MARKET_MILEAGE_BANDS: MarketRangeBand[] = [
  { from: 0, to: 24_999, label: "Under 25k" },
  { from: 25_000, to: 49_999, label: "25k–50k" },
  { from: 50_000, to: 74_999, label: "50k–75k" },
  { from: 75_000, to: 99_999, label: "75k–100k" },
  { from: 100_000, to: 149_999, label: "100k–150k" },
  { from: 150_000, to: null, label: "150k+" },
];

function normalizedFacet(
  value: unknown,
  choices: readonly string[],
): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const lower = value.toLowerCase();
  return choices.find((choice) => lower.includes(choice.toLowerCase()));
}

function bodyFacet(value: unknown) {
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("suv") || lower.includes("utility")) return "SUV";
  if (lower.includes("pickup") || lower.includes("truck")) return "Pickup";
  return normalizedFacet(value, [
    "Sedan",
    "Coupe",
    "Convertible",
    "Van",
    "Wagon",
    "Motorcycle",
  ]);
}

function roundedMapPoint(latValue: unknown, lngValue: unknown) {
  const point = validCoords(latValue, lngValue);
  if (!point) return null;
  // One decimal is enough for a nationwide market view and avoids publishing a seller's raw pin.
  return {
    lat: Number(point.lat.toFixed(1)),
    lng: Number(point.lng.toFixed(1)),
  };
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, {
    key: "market-explore",
    limit: 30,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);

  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      rows: [],
      total: 0,
      capped: false,
      mode: "curated",
      page: 0,
      pageSize: 50,
      facets: {},
      configured: false,
    });
  }
  try {
    const sp = new URL(req.url).searchParams;
    const location = parseMarketLocation(sp);
    if ("error" in location)
      return NextResponse.json({ error: location.error }, { status: 400 });
    const priceKind = sp.get("priceKind");
    if (priceKind && !MARKET_PRICE_KINDS.some((kind) => kind === priceKind))
      return NextResponse.json(
        { error: "Choose a valid price type." },
        { status: 400 },
      );
    const states = csv(sp.get("states")).map((s) => s.toUpperCase());
    const lanes = csv(sp.get("lanes")) as DealLane[];
    const makes = csv(sp.get("makes"))
      .map((m) =>
        m
          .toLowerCase()
          .replace(/[^a-z0-9 -]/g, "")
          .trim(),
      )
      .filter(Boolean)
      .slice(0, 25);
    const categories = csv(sp.get("categories"));
    if (
      categories.some(
        (category) =>
          !Object.prototype.hasOwnProperty.call(
            VEHICLE_CATEGORY_FILTERS,
            category,
          ),
      )
    )
      return NextResponse.json(
        { error: "Choose a valid vehicle category" },
        { status: 400 },
      );
    const detailParams = new URLSearchParams(sp);
    const photoFilter = sp.get("hasPhotos");
    if (location.radius != null) detailParams.delete("zip");
    for (const [oldKey, key] of [
      ["priceMin", "minPrice"],
      ["priceMax", "maxPrice"],
      ["yearMin", "minYear"],
      ["yearMax", "maxYear"],
      ["mileageMax", "maxMileage"],
    ]) {
      if (sp.has(oldKey)) detailParams.set(key, sp.get(oldKey)!);
    }
    const rangeError = validateInventoryRanges(detailParams);
    if (rangeError)
      return NextResponse.json({ error: rangeError }, { status: 400 });
    // Historical placeholders may not have an audit yet. Classify before counts/pagination.
    detailParams.delete("hasPhotos");
    const priceBasis = sp.get("priceBasis") || "advertised";
    if (!["cash", "advertised"].includes(priceBasis))
      return NextResponse.json(
        { error: "Choose a valid price basis." },
        { status: 400 },
      );
    const cashMin = detailParams.get("minPrice"),
      cashMax = detailParams.get("maxPrice");
    const cashPolicy = detailParams.get("pricePolicy");
    if (priceBasis === "cash") {
      // Disclosed full prices can differ from the headline amount (for example a deposit).
      // Apply a cash budget to classified evidence after mapping, never to the teaser in SQL.
      detailParams.delete("minPrice");
      detailParams.delete("maxPrice");
      detailParams.delete("pricePolicy");
    }
    const flipDesk = await resolveCallerFlipDesk();
    const conditions = csv(sp.get("conditions"));
    const verdicts = flipDesk ? csv(sp.get("verdicts")) : [];
    const sources = csv(sp.get("sources"))
      .map((source) => source.replace(/[^a-zA-Z0-9_-]/g, ""))
      .filter(Boolean);
    if (
      sources.some(
        (source) =>
          !INVENTORY_SOURCE_FILTERS.some((option) => option.id === source),
      )
    )
      return NextResponse.json(
        { error: "Choose a valid inventory source" },
        { status: 400 },
      );
    const sellerTypes = csv(sp.get("sellerTypes")).map((s) => s.toLowerCase());
    const minRoi = flipDesk ? parseFloat(sp.get("minRoi") || "0") || 0 : 0;
    const yearMin = parseInt(sp.get("yearMin") || "0") || 0;
    const yearMax = parseInt(sp.get("yearMax") || "0") || 0;
    const minProfit = flipDesk ? parseInt(sp.get("minProfit") || "0") || 0 : 0;
    const mode = flipDesk && sp.get("mode") === "curated" ? "curated" : "all";
    const requestedSort = sp.get("sort") || "lastSeenAt";
    const sort =
      !flipDesk &&
      ["profitEstimate", "profitScore", "sellEstimate"].includes(requestedSort)
        ? "askPrice"
        : requestedSort;
    const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
    const page = Math.max(0, parseInt(sp.get("page") || "0") || 0);
    const pageSize = Math.max(
      1,
      Math.min(200, parseInt(sp.get("pageSize") || "50") || 50),
    );
    // Free-text search across make/model/title (sanitized so it can't break the PostgREST or-filter).
    const search = (sp.get("q") || "")
      .trim()
      .replace(/[^a-zA-Z0-9 -]/g, " ")
      .slice(0, 60);
    const cacheParams = new URLSearchParams(sp);
    cacheParams.delete("page");
    cacheParams.delete("pageSize");

    // Same filter combo within 30s → serve the computed result instantly (no re-scan/re-facet).
    const payload = await cached(
      `mkt:explore:${flipDesk ? "flip" : "personal"}:${cacheParams.toString()}`,
      30_000,
      async () => {
        const supabase = createServerComponentClient();
        const center =
          location.center ||
          (location.place
            ? await geocodeZip(supabase, location.place, {
                fetchImpl: (url, init) =>
                  fetch(url, { ...init, signal: AbortSignal.timeout(6000) }),
              })
            : null);
        if (location.radius != null && !center)
          throw new Error("MARKET_LOCATION_UNRESOLVED");
        const bounds =
          center && location.radius != null
            ? boundingBox(center.lat, center.lng, location.radius)
            : null;
        const build = () => {
          let q = supabase
            .from("deals")
            .select(
              `id, year, make, model, trim, body_class, fuel_type, transmission, drivetrain, reported_fuel:options->>fuelType, reported_transmission:options->>transmission, reported_drivetrain:options->>drivetrain, color, assembly_country, availability_status, vin, sell_estimate, profit_score, true_net_profit, recommended_max_bid, deal_verdict, deal_analysis, is_arbitrage_opportunity, images, photo_state:options->photoAudit->>state, placeholder_urls:options->photoAudit->placeholderUrls, location_city, location_state, location_zip, lat, lng, first_seen_at, ${SOURCE_PRICE_FIELDS}`,
            )
            .eq("active", true);
          q = applyLiveAuctionWindow(
            applyCustomerInventory(q, Date.now(), {
              includeWithoutPhotos: true,
              observedDays: Number(sp.get("seenWithin")),
            }),
          );

          // SQL-able filters (push down what we can).
          if (states.length && !bounds) q = q.in("location_state", states);
          if (bounds)
            q = q
              .gte("lat", bounds.minLat)
              .lte("lat", bounds.maxLat)
              .gte("lng", bounds.minLng)
              .lte("lng", bounds.maxLng);
          if (search)
            q = q.or(
              `make.ilike.%${search}%,model.ilike.%${search}%,title.ilike.%${search}%,vin.ilike.%${search}%`,
            );
          if (makes.length)
            q = q.or(makes.map((m) => `make.ilike.${m}`).join(",")); // case-insensitive make match
          if (conditions.length) q = q.in("condition", conditions);
          if (verdicts.length) q = q.in("deal_verdict", verdicts);
          q = applySelectedSources(q, sources);
          q = applyVehicleDetails(q, detailParams);
          q = applyRepairEligibility(q, detailParams.get("includeRepairable"));
          const titleFilter = titleCategoryOrFilter(
            parseTitleTypes(detailParams.get("titleType")),
          );
          if (titleFilter) q = q.or(titleFilter);
          if (categories.length)
            q = q.or(
              categories
                .map(
                  (category) =>
                    VEHICLE_CATEGORY_FILTERS[
                      category as keyof typeof VEHICLE_CATEGORY_FILTERS
                    ].filter,
                )
                .join(","),
            );
          const model = (sp.get("model") || "")
            .replace(/[^a-zA-Z0-9 -]/g, "")
            .trim()
            .slice(0, 60);
          if (model) q = q.ilike("model", `%${model}%`);
          // deals has no seller_type column (it lives in options.sellerType); selecting or filtering
          // the bare column 500'd the whole endpoint. Alias + JSON-path filter instead.
          q = applySellerTypes(q, sellerTypes);
          if (yearMin > 0) q = q.gte("year", yearMin);
          if (yearMax > 0) q = q.lte("year", yearMax);
          if (minProfit > 0) q = q.gte("true_net_profit", minProfit);
          // CURATED = the deals a dealer should actually look at (engine says go/hold or flagged arbitrage).
          // WHOLE MARKET = no verdict gate. The toggle the user asked for.
          if (mode === "curated" && !verdicts.length)
            q = q.in("deal_verdict", ["go", "hold"]);

          return q.order("id", { ascending: true });
        };
        const data = await fetchAllRows<any>(
          (from, to) => build().range(from, to),
          { pageSize: 1000, concurrency: 3 },
        );
        const capped = false;

        let rows = (data || []).map((d: any) => {
          const photos = photoEvidence(d.images, {
            placeholderUrls: d.placeholder_urls,
          });
          const images =
            d.photo_state === "unavailable"
              ? []
              : photos.images
                  .filter((url) => /^https?:\/\//i.test(url))
                  .slice(0, 30);
          const mapPoint = roundedMapPoint(d.lat, d.lng);
          const valuation = marketValuation(
            d.deal_analysis?.valuation,
            d.sell_estimate,
          );
          const price = sourcePriceContext(d);
          const bidCheckedAt = d.price_evidence?.checkedAt;
          const bidCheckedTime =
            bidCheckedAt == null ? null : Date.parse(bidCheckedAt);
          const bidEvidenceCurrent =
            bidCheckedTime == null ||
            (Number.isFinite(bidCheckedTime) &&
              bidCheckedTime >= Date.now() - 30 * 86400_000 &&
              bidCheckedTime <= Date.now() + 300_000);
          // Stored profit math must use the same acquisition amount as the displayed quote.
          // Deposits, payments, references, unverified amounts, and corrected teaser prices
          // cannot inherit an old GO/profit simply because the resale estimate has comps.
          const acquisitionSupported =
            ((["asking", "buy_now"].includes(price.kind) &&
              price.comparisonEligible) ||
              (price.kind === "current_bid" &&
                d.price_evidence?.kind === "current_bid" &&
                d.price_evidence.currentBid === price.amount &&
                bidEvidenceCurrent &&
                price.observationCurrent)) &&
            price.amount != null &&
            price.amount === Number(d.ask_price) &&
            d.deal_analysis?.acquisitionPriceMissing !== true;
          const economicsSupported =
            valuation.supported && acquisitionSupported;
          const economicsNumber = (value: unknown) =>
            economicsSupported &&
            typeof value === "number" &&
            Number.isFinite(value)
              ? value
              : undefined;
          return {
            id: d.id,
            title:
              d.title ||
              `${d.year || ""} ${d.make || ""} ${d.model || ""}`.trim(),
            source: d.source,
            sourceUrl: vendorIdentity(d.source, d.source_url).href,
            vin: d.vin || undefined,
            images,
            imageUrl: images[0],
            locationCity: d.location_city || undefined,
            mapLat: mapPoint?.lat,
            mapLng: mapPoint?.lng,
            firstSeenAt: d.first_seen_at || undefined,
            lastSeenAt: d.last_seen_at || undefined,
            auctionEndAt: d.auction_end_at || undefined,
            price,
            distanceMiles: center
              ? (marketDistance(center, d) ?? undefined)
              : undefined,
            year: d.year,
            make: canonicalMarketMake(d.make),
            model: d.model,
            trim: d.trim,
            askPrice: Number(d.ask_price || 0),
            buyNowPrice:
              d.buy_now_price != null ? Number(d.buy_now_price) : undefined,
            bodyClass: d.body_class || undefined,
            fuelType:
              normalizeVehicleSpec("fuelType", d.fuel_type, d.reported_fuel) ||
              d.fuel_type ||
              d.reported_fuel ||
              undefined,
            transmission:
              normalizeVehicleSpec(
                "transmission",
                d.transmission,
                d.reported_transmission,
              ) ||
              d.transmission ||
              d.reported_transmission ||
              undefined,
            drivetrain:
              normalizeVehicleSpec(
                "drivetrain",
                d.drivetrain,
                d.reported_drivetrain,
              ) ||
              d.drivetrain ||
              d.reported_drivetrain ||
              undefined,
            color: d.color || undefined,
            assemblyCountry: d.assembly_country || undefined,
            availabilityStatus: d.availability_status || undefined,
            mileage: d.mileage ?? undefined,
            valuationEvidence: valuation,
            sellEstimate: valuation.supported ? d.sell_estimate : undefined,
            priceGap:
              economicsSupported &&
              price.kind === "asking" &&
              d.deal_analysis?.priceImplausible !== true
                ? d.sell_estimate - Number(d.ask_price)
                : undefined,
            profitEstimate: economicsNumber(d.true_net_profit),
            profitScore: economicsNumber(d.profit_score),
            dealVerdict: economicsSupported
              ? d.deal_verdict || undefined
              : undefined,
            recommendedMaxBid: economicsNumber(d.recommended_max_bid),
            locationState: d.location_state || undefined,
            condition: d.condition || undefined,
            damageType: d.damage_type || undefined,
            sellerType: d.seller_type || undefined,
            roi: economicsNumber(d.deal_analysis?.roi),
            lane: dealLane(d),
          };
        });

        // Lane filter (computed, so done here).
        if (photoFilter === "yes")
          rows = rows.filter((row) => row.images.length > 0);
        else if (photoFilter === "no")
          rows = rows.filter((row) => row.images.length === 0);
        if (priceBasis === "cash")
          rows = rows.filter((r) => {
            const cash = r.price.cashPrice;
            if (cashPolicy === "unknown") return cash == null;
            if (!cashMin && !cashMax && cashPolicy !== "reported") return true;
            if (cash == null) return cashPolicy === "include";
            return (
              (!cashMin || cash >= Number(cashMin)) &&
              (!cashMax || cash <= Number(cashMax))
            );
          });
        if (location.radius != null)
          rows = rows.filter(
            (r) =>
              r.distanceMiles != null && r.distanceMiles <= location.radius!,
          );
        if (priceKind) rows = rows.filter((r) => r.price.kind === priceKind);
        if (lanes.length) rows = rows.filter((r) => lanes.includes(r.lane));
        if (minProfit > 0)
          rows = rows.filter(
            (r) => (r.profitEstimate ?? -Infinity) >= minProfit,
          );
        if (verdicts.length)
          rows = rows.filter((r) => verdicts.includes(r.dealVerdict));
        if (mode === "curated")
          rows = rows.filter((r) => ["go", "hold"].includes(r.dealVerdict));
        // ROI filter — deal_analysis.roi is a JSON number, so compared correctly here (not as PG text).
        if (minRoi > 0)
          rows = rows.filter((r) => (r.roi ?? -Infinity) >= minRoi);

        // Facets over the post-filter set so the UI shows live counts.
        const count = <T extends string>(
          key: (r: (typeof rows)[number]) => T | undefined,
        ) => {
          const m: Record<string, number> = {};
          for (const r of rows) {
            const k = key(r);
            if (k) m[k] = (m[k] || 0) + 1;
          }
          return m;
        };
        const stateCounts = count((r) => r.locationState);
        const laneCounts = count((r) => r.lane);
        const sellerCounts = count((r) => r.sellerType);
        const makeCounts = count((r) => r.make);
        const modelCounts = count((r) => r.model);
        const yearCounts = count((r) =>
          Number.isFinite(Number(r.year)) ? String(r.year) : undefined,
        );
        const bodyCounts = count((r) => bodyFacet(r.bodyClass));
        const fuelCounts = count((r) =>
          normalizeVehicleSpec("fuelType", r.fuelType),
        );
        const transmissionCounts = count((r) =>
          normalizeVehicleSpec("transmission", r.transmission),
        );
        const drivetrainCounts = count((r) =>
          normalizeVehicleSpec("drivetrain", r.drivetrain),
        );
        const conditionCounts = count((r) => r.condition);
        const sourceCounts = count((r) => r.source);
        const colorCounts = count((r) => r.color);
        const assemblyCounts = count((r) => r.assemblyCountry);
        const availabilityCounts = count((r) => r.availabilityStatus);
        const priceKindCounts = count((r) => r.price.kind);
        const ranked = (counts: Record<string, number>, limit = 8) =>
          Object.entries(counts)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, limit)
            .map(([value, n]) => ({ value, n }));
        const topMakes = Object.entries(makeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([make, n]) => ({ make, n }));

        // Price distribution — chart-ready histogram (12 quantile-free fixed buckets) for the market viz.
        const prices = rows
          .filter((r) => r.price.canCompareToAskingCurve)
          .map((r) => r.price.cashPrice!)
          .filter((p) => p > 0);
        const hiP = prices.length ? Math.max(...prices) : 0;
        const bw =
          hiP > 0 ? Math.max(1000, Math.ceil(hiP / 12 / 1000) * 1000) : 1000;
        const priceHistogram: { from: number; to: number; n: number }[] = [];
        for (let i = 0; i < 12; i++) {
          const from = i * bw;
          priceHistogram.push({ from, to: from + bw, n: 0 });
        }
        for (const p of prices) {
          const idx = Math.min(11, Math.floor(p / bw));
          priceHistogram[idx].n++;
        }
        const mileages = rows
          .map((r) => Number(r.mileage))
          .filter((m) => Number.isFinite(m) && m >= 0);
        const hiM = mileages.length ? Math.max(...mileages) : 0;
        const mw =
          hiM > 0
            ? Math.max(25_000, Math.ceil(hiM / 10 / 25_000) * 25_000)
            : 25_000;
        const mileageHistogram: { from: number; to: number; n: number }[] = [];
        for (let i = 0; i < 10; i++) {
          const from = i * mw;
          mileageHistogram.push({ from, to: from + mw - 1, n: 0 });
        }
        for (const mileage of mileages) {
          const idx = Math.min(9, Math.floor(mileage / mw));
          mileageHistogram[idx].n++;
        }

        const priceMileageMatrix: MarketPriceMileageCell[] =
          MARKET_PRICE_BANDS.flatMap((priceBand) =>
            MARKET_MILEAGE_BANDS.map((mileageBand) => ({
              priceFrom: priceBand.from,
              priceTo: priceBand.to,
              mileageFrom: mileageBand.from,
              mileageTo: mileageBand.to,
              n: 0,
            })),
          );
        for (const row of rows) {
          const price = Number(row.askPrice);
          const mileage = Number(row.mileage);
          if (!(price > 0) || !Number.isFinite(mileage) || mileage < 0)
            continue;
          const priceIndex = MARKET_PRICE_BANDS.findIndex(
            (band) =>
              price >= band.from && (band.to == null || price <= band.to),
          );
          const mileageIndex = MARKET_MILEAGE_BANDS.findIndex(
            (band) =>
              mileage >= band.from && (band.to == null || mileage <= band.to),
          );
          if (priceIndex >= 0 && mileageIndex >= 0)
            priceMileageMatrix[
              priceIndex * MARKET_MILEAGE_BANDS.length + mileageIndex
            ].n++;
        }

        const now = Date.now();
        const freshness = [1, 7, 30].map((days) => ({
          value: String(days),
          n: rows.filter((row) => {
            const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
            return (
              Number.isFinite(seen) &&
              seen <= now + 300_000 &&
              seen >= now - days * 86_400_000
            );
          }).length,
        }));
        // Median profit per lane — a "where's the money by channel" bar for the viz.
        const profitByLane: Record<string, number[]> = {};
        for (const r of rows)
          if (r.profitEstimate != null)
            (profitByLane[r.lane] ??= []).push(r.profitEstimate);
        const laneProfit: Record<string, number> = {};
        for (const [lane, arr] of Object.entries(profitByLane)) {
          const s = arr.slice().sort((a, b) => a - b);
          laneProfit[lane] = s.length
            ? Math.round(s[Math.floor(s.length / 2)])
            : 0;
        }

        // Sort + paginate.
        const dir = sortDir === "asc" ? 1 : -1;
        const sortKey = (
          {
            askPrice: "askPrice",
            mileage: "mileage",
            sellEstimate: "sellEstimate",
            profitEstimate: "profitEstimate",
            priceGap: "priceGap",
            profitScore: "profitScore",
            year: "year",
            distanceMiles: "distanceMiles",
            lastSeenAt: "lastSeenAt",
          } as Record<string, keyof (typeof rows)[number]>
        )[sort];
        if (sortKey)
          rows.sort((a, b) => {
            const value = (row: (typeof rows)[number]) => {
              if (sortKey === "lastSeenAt")
                return row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
              if (sortKey === "askPrice" && priceBasis === "cash")
                return row.price.cashPrice ?? NaN;
              const v = row[sortKey];
              return v == null || (sortKey === "askPrice" && Number(v) <= 0)
                ? NaN
                : Number(v);
            };
            const av = value(a),
              bv = value(b);
            if (!Number.isFinite(av))
              return Number.isFinite(bv) ? 1 : a.id.localeCompare(b.id);
            if (!Number.isFinite(bv)) return -1;
            return dir * (av - bv) || a.id.localeCompare(b.id);
          });

        const total = rows.length;
        return {
          rows,
          total,
          capped,
          mode,
          sourceCoverage: marketSourceCoverage(rows, capped),
          summary: summarizeMarket(rows),
          location: {
            label:
              location.near ||
              (center
                ? "Your location"
                : states.length
                  ? states.join(", ")
                  : "Nationwide"),
            radius: location.radius,
            approximate: !!center,
          },
          facets: {
            states: stateCounts,
            lanes: laneCounts,
            sellerTypes: sellerCounts,
            topMakes,
            topModels: ranked(modelCounts, 12),
            years: Object.entries(yearCounts)
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .slice(0, 12)
              .map(([value, n]) => ({ value, n })),
            bodyClasses: ranked(bodyCounts),
            fuelTypes: ranked(fuelCounts),
            transmissions: ranked(transmissionCounts),
            drivetrains: ranked(drivetrainCounts),
            conditions: ranked(conditionCounts),
            sources: ranked(sourceCounts, 12),
            colors: ranked(colorCounts),
            assemblyCountries: ranked(assemblyCounts),
            availability: ranked(availabilityCounts),
            freshness,
            priceKinds: ranked(priceKindCounts),
            priceHistogram,
            mileageHistogram,
            priceBands: MARKET_PRICE_BANDS,
            mileageBands: MARKET_MILEAGE_BANDS,
            priceMileageMatrix,
            missingPrice: rows.filter((row) => !(Number(row.askPrice) > 0))
              .length,
            missingMileage: rows.filter(
              (row) =>
                !Number.isFinite(Number(row.mileage)) ||
                Number(row.mileage) < 0,
            ).length,
            mapped: rows.filter(
              (row) => row.mapLat != null && row.mapLng != null,
            ).length,
            laneProfit,
            laneColors: LANE_COLORS,
          },
        };
      },
      undefined,
      { prefix: "mkt:explore:", maxEntries: 4 },
    );
    const resultPage = Math.min(
      page,
      Math.max(0, Math.ceil(payload.total / pageSize) - 1),
    );
    const paged = {
      ...payload,
      rows: payload.rows.slice(
        resultPage * pageSize,
        (resultPage + 1) * pageSize,
      ),
      page: resultPage,
      pageSize,
    };
    // Cache is shared; redact AFTER so a personal caller never gets a flip-desk hit.
    return NextResponse.json(
      flipDesk
        ? { ...paged, deskAccess: "flip" }
        : {
            ...paged,
            rows: listingsForDesk(paged.rows || [], false),
            facets: payload.facets
              ? { ...payload.facets, laneProfit: {} }
              : payload.facets,
            deskAccess: "personal",
          },
    );
  } catch (e: any) {
    if (e?.message === "MARKET_LOCATION_UNRESOLVED")
      return NextResponse.json(
        {
          error:
            "Could not locate that ZIP code or city. Check the location and try again.",
        },
        { status: 422 },
      );
    return internalError("market:explore", e);
  }
}
