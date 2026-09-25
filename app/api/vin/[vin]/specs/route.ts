export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isValidVin, normalizeVin } from "@/lib/vehicle/vin";
import {
  decodeVin,
  getRecallCount,
  getSafetyRating,
} from "@/lib/vehicle/nhtsa";
import { getFuelEconomy } from "@/lib/vehicle/epa";

// GET /api/vin/[vin]/specs — authoritative, FREE vehicle specs (NHTSA vPIC) + open recall count
// (NHTSA Recalls), cached in vin_decodes. Decode is immutable per VIN; recalls refresh weekly.
const RECALLS_TTL_MS = 7 * 24 * 3600_000;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  const { vin: raw } = await params;
  const vin = normalizeVin(raw);
  if (!isValidVin(vin))
    return NextResponse.json({ error: "Invalid VIN" }, { status: 400 });

  const sb = admin();
  const { data: cached } = await sb
    .from("vin_decodes")
    .select("*")
    .eq("vin", vin)
    .maybeSingle();

  const recallsFresh =
    cached?.recalls_at &&
    Date.now() - new Date(cached.recalls_at).getTime() < RECALLS_TTL_MS;
  const hasExtras = cached?.extras_at != null;

  if (cached && recallsFresh && hasExtras) {
    return NextResponse.json({ vin, ...toResponse(cached), cached: true });
  }

  // Decode (use cache if present, else NHTSA).
  const decoded = cached?.make ? toDecode(cached) : await decodeVin(vin);
  if (!decoded)
    return NextResponse.json(
      { error: "Could not decode VIN" },
      { status: 404 },
    );

  const canQuery = !!(decoded.make && decoded.model && decoded.year);
  // Fetch recalls + crash-test stars + EPA MPG in parallel (all free, no key).
  const [recalls, safety, fuel] = canQuery
    ? await Promise.all([
        getRecallCount(decoded.make!, decoded.model!, decoded.year!),
        cached?.safety_overall != null || cached?.extras_at
          ? Promise.resolve(null)
          : getSafetyRating(decoded.make!, decoded.model!, decoded.year!),
        cached?.mpg_combined != null || cached?.extras_at
          ? Promise.resolve(null)
          : getFuelEconomy(decoded.make!, decoded.model!, decoded.year!),
      ])
    : [null, null, null];

  const row: any = {
    vin,
    year: decoded.year,
    make: decoded.make,
    model: decoded.model,
    trim: decoded.trim,
    body_class: decoded.bodyClass,
    drive_type: decoded.driveType,
    fuel_type: decoded.fuelType,
    cylinders: decoded.cylinders,
    displacement_l: decoded.displacementL,
    plant_country: decoded.plantCountry,
    made_in_usa: decoded.madeInUsa,
    recalls_count: recalls,
    recalls_at:
      recalls != null ? new Date().toISOString() : (cached?.recalls_at ?? null),
    mpg_city: fuel?.city ?? cached?.mpg_city ?? null,
    mpg_highway: fuel?.highway ?? cached?.mpg_highway ?? null,
    mpg_combined: fuel?.combined ?? cached?.mpg_combined ?? null,
    safety_overall: safety?.overall ?? cached?.safety_overall ?? null,
    safety_frontal: safety?.frontal ?? cached?.safety_frontal ?? null,
    safety_side: safety?.side ?? cached?.safety_side ?? null,
    safety_rollover: safety?.rollover ?? cached?.safety_rollover ?? null,
    extras_at: new Date().toISOString(),
  };
  // Await the cache write so it actually persists — a fire-and-forget promise gets dropped when the
  // handler returns, so every call would otherwise re-hit NHTSA.
  try {
    await sb.from("vin_decodes").upsert(row, { onConflict: "vin" });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({ vin, ...toResponse(row), cached: false });
}

function toDecode(c: any) {
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
  };
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
