export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { titleCaseMake, canonicalModel } from "@/lib/vehicle/canonical";
import { decodeVin } from "@/lib/vehicle/nhtsa";
import { isValidVin } from "@/lib/vehicle/vin";

// POST /api/admin/canonicalize — clean up deal make/model using the authoritative NHTSA decodes
// (vin_decodes). VIN is ground truth, so where the decode resolved a make/model we set the deal to
// the canonical form ("FORD" → "Ford", title-parsed "Range" → "Range Rover"). Gated by INGEST_SECRET.
const CORS = { "Access-Control-Allow-Origin": "*" };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
  );
}

export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json(
        { error: "Disabled: set INGEST_SECRET." },
        { status: 503, headers: CORS },
      );
  } else if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: CORS },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* ok */
  }
  const maxDecode = Math.min(150, Math.max(0, Number(body.maxDecode) ?? 80));

  const sb = admin();

  // Active deals that have a VIN.
  const { data: deals } = await sb
    .from("deals")
    .select("id, vin, make, model, trim")
    .eq("active", true)
    .not("vin", "is", null)
    .neq("vin", "")
    .order("profit_score", { ascending: false, nullsFirst: false })
    .limit(1000);
  if (!deals?.length)
    return NextResponse.json({ scanned: 0, updated: 0 }, { headers: CORS });

  // Existing decodes.
  const dealVins = Array.from(
    new Set(deals.map((d) => d.vin).filter((v): v is string => !!v)),
  );
  const { data: existing } = await sb
    .from("vin_decodes")
    .select("vin, make, model, trim")
    .in("vin", dealVins);
  const byVin = new Map((existing || []).map((d) => [d.vin, d as any]));

  // Decode any missing VINs (bounded), so canonicalization covers the whole active set over time.
  let decoded = 0;
  for (const v of dealVins) {
    if (decoded >= maxDecode) break;
    if (byVin.has(v) || !isValidVin(v)) continue;
    const dec = await decodeVin(v);
    if (dec?.make && dec.model) {
      const row = {
        vin: v,
        make: dec.make,
        model: dec.model,
        trim: dec.trim,
        body_class: dec.bodyClass,
        drive_type: dec.driveType,
        fuel_type: dec.fuelType,
        cylinders: dec.cylinders,
        displacement_l: dec.displacementL,
        plant_country: dec.plantCountry,
        made_in_usa: dec.madeInUsa,
      };
      try {
        await sb.from("vin_decodes").upsert(row, { onConflict: "vin" });
      } catch {
        /* ignore */
      }
      byVin.set(v, row as any);
      decoded++;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  let updated = 0;
  for (const d of deals || []) {
    const vd = byVin.get(d.vin);
    if (!vd) continue;
    const make = titleCaseMake(vd.make);
    const model = canonicalModel(vd.model);
    const patch: any = {};
    if (make && make !== d.make) patch.make = make;
    if (model && model !== d.model) patch.model = model;
    if (vd.trim && !d.trim) patch.trim = vd.trim;
    if (Object.keys(patch).length) {
      const { error } = await sb.from("deals").update(patch).eq("id", d.id);
      if (!error) updated++;
    }
  }

  return NextResponse.json(
    { scanned: deals.length, decoded, updated },
    { headers: CORS },
  );
}
