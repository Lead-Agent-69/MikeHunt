export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createClient } from "@supabase/supabase-js";
import { isValidVin, normalizeVin } from "@/lib/vehicle/vin";
import { getSafetyRating } from "@/lib/vehicle/nhtsa";
import { getFuelEconomy } from "@/lib/vehicle/epa";
import {
  getRecallsCached,
  getVinDecode,
  RECALLS_TTL_MS,
} from "@/lib/vehicle/vin-enrichment";
import { guardVinRoute } from "@/lib/vehicle/vin-route-guard";
import {
  extrasFresh,
  extrasStatus,
  planExtras,
} from "@/lib/vehicle/extras-ttl";

// GET /api/vin/[vin]/specs — authoritative, FREE vehicle specs. Full NHTSA vPIC decode
// (DecodeVinValuesExtended: trim, series, body, engine, drive, transmission, GVWR, plant) cached in
// vin_decodes for 180 days; NHTSA recalls for the make/model/year family cached 7 days in
// nhtsa_recalls_cache. Shares lib/vehicle/vin-enrichment with GET /api/vin/[vin].

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  const rl = rateLimit(req, { key: "vin-specs", limit: 30, windowMs: 60_000 });
  if (!rl.allowed) return tooManyRequests(rl);
  const guard = await guardVinRoute(req);
  if (guard.blocked) return guard.blocked;
  const { deadline, canWrite } = guard;
  const { vin: raw } = await params;
  const vin = normalizeVin(raw);
  if (!isValidVin(vin))
    return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });

  const sb = admin();
  const dec = await getVinDecode(sb, vin, { deadline, canWrite });
  if (!dec)
    return NextResponse.json(
      { error: "Could not decode VIN" },
      { status: 404 },
    );
  const { decode: decoded, row: cached } = dec;

  const recallsFresh =
    cached?.recalls_at &&
    Date.now() - new Date(cached.recalls_at).getTime() < RECALLS_TTL_MS;
  const hasExtras = extrasFresh(cached);
  const canQuery = !!(decoded.make && decoded.model && decoded.year);

  // Recalls come from the per-make/model/year cache (cheap even when this VIN's row is fresh).
  const recalls = canQuery
    ? await getRecallsCached(sb, decoded.make!, decoded.model!, decoded.year!, {
        deadline,
        canWrite,
      })
    : null;

  if (dec.cached && recallsFresh && hasExtras) {
    return NextResponse.json({
      vin,
      ...toResponse(cached),
      recalls: recalls?.count ?? cached.recalls_count ?? null,
      recallCampaigns: recalls?.campaigns ?? [],
      recallsScope: "model_year",
      extrasStatus: extrasStatus(cached),
      decodeStale: dec.stale,
      cached: true,
    });
  }

  // Crash-test stars + EPA MPG in parallel (all free, no key). planExtras: a stale complete set is
  // looked up again after 180 days; an incomplete one retries only the missing values, up to 3 times.
  const plan = planExtras(cached);
  const runExtras = canQuery && (plan.safety || plan.mpg);
  const [safety, fuel] = canQuery
    ? await Promise.all([
        !plan.safety
          ? Promise.resolve(null)
          : getSafetyRating(
              decoded.make!,
              decoded.model!,
              decoded.year!,
              undefined,
              { deadline },
            ),
        !plan.mpg
          ? Promise.resolve(null)
          : getFuelEconomy(
              decoded.make!,
              decoded.model!,
              decoded.year!,
              undefined,
              { deadline },
            ),
      ])
    : [null, null];

  // Decode columns were already written by getVinDecode; this upsert adds recalls + extras only.
  const extras: any = {
    vin,
    recalls_count: recalls?.count ?? cached?.recalls_count ?? null,
    recalls_at:
      recalls && !recalls.stale
        ? new Date().toISOString()
        : (cached?.recalls_at ?? null),
    mpg_city: fuel?.city ?? cached?.mpg_city ?? null,
    mpg_highway: fuel?.highway ?? cached?.mpg_highway ?? null,
    mpg_combined: fuel?.combined ?? cached?.mpg_combined ?? null,
    safety_overall: safety?.overall ?? cached?.safety_overall ?? null,
    safety_frontal: safety?.frontal ?? cached?.safety_frontal ?? null,
    safety_side: safety?.side ?? cached?.safety_side ?? null,
    safety_rollover: safety?.rollover ?? cached?.safety_rollover ?? null,
    // When the extras were last attempted. extrasFresh() keeps a complete set 180 days and retries an
    // incomplete one (a failed or empty safety/EPA lookup) after 6h.
    extras_at: runExtras
      ? new Date().toISOString()
      : (cached?.extras_at ?? null),
    extras_attempts: runExtras
      ? plan.nextAttempts
      : (cached?.extras_attempts ?? 0),
  };
  // Await the cache write so it actually persists — a fire-and-forget promise gets dropped when the
  // handler returns, so every call would otherwise re-hit NHTSA.
  // Only enrich a row that exists: an un-cached decode (write budget spent) must not be created here.
  if (dec.persisted) {
    try {
      const r: any = await sb
        .from("vin_decodes")
        .upsert(extras, { onConflict: "vin" });
      // 20261010401000 not applied yet: store everything but the attempt counter.
      if (r?.error && /extras_attempts/.test(String(r.error.message ?? ""))) {
        const { extras_attempts: _drop, ...rest } = extras;
        await sb.from("vin_decodes").upsert(rest, { onConflict: "vin" });
      }
    } catch {
      /* non-fatal */
    }
  }

  return NextResponse.json({
    vin,
    ...toResponse({ ...(cached ?? {}), ...extras }),
    recalls: recalls?.count ?? null,
    recallCampaigns: recalls?.campaigns ?? [],
    recallsScope: "model_year",
    extrasStatus: extrasStatus({ ...(cached ?? {}), ...extras }),
    decodeStale: dec.stale,
    cached: false,
  });
}

function toResponse(c: any) {
  return {
    year: c.year,
    make: c.make,
    model: c.model,
    trim: c.trim,
    bodyClass: c.body_class,
    driveType: c.drive_type,
    fuelType: c.fuel_type,
    cylinders: c.cylinders,
    displacementL: c.displacement_l,
    plantCountry: c.plant_country,
    madeInUsa: c.made_in_usa,
    // Extended decode (null on rows not yet re-decoded).
    series: c.series ?? null,
    doors: c.doors ?? null,
    engine: c.engine ?? null,
    engineHp: c.engine_hp != null ? Number(c.engine_hp) : null,
    transmission: c.transmission_style ?? null,
    transmissionSpeeds: c.transmission_speeds ?? null,
    gvwr: c.gvwr ?? null,
    gvwrMaxLb: c.gvwr_max_lb ?? null,
    plant:
      c.plant_city || c.plant_state || c.plant_company
        ? {
            company: c.plant_company ?? null,
            city: c.plant_city ?? null,
            state: c.plant_state ?? null,
            country: c.plant_country ?? null,
          }
        : null,
    decodeClean: c.decode_clean ?? null,
    recalls: c.recalls_count,
    mpg:
      c.mpg_combined || c.mpg_city || c.mpg_highway
        ? { city: c.mpg_city, highway: c.mpg_highway, combined: c.mpg_combined }
        : null,
    safety:
      c.safety_overall || c.safety_frontal || c.safety_side || c.safety_rollover
        ? {
            overall: c.safety_overall,
            frontal: c.safety_frontal,
            side: c.safety_side,
            rollover: c.safety_rollover,
          }
        : null,
  };
}
