// Authoritative make/model/year at INGEST, from the VIN. Average systems guess make/model by splitting
// the title (which truncates "Grand Cherokee"→"Grand"); we decode the VIN instead. Reads the vin_decodes
// cache first and only calls free NHTSA vPIC for cache-misses (then caches them), so steady-state cost
// is ~zero. Runs before quality-control + valuation so deals are valued on the correct make/model and
// pool with their real comps. Best-effort: any failure leaves the scraped values untouched. VIN_ENRICH=off disables.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deal } from "@/types";
import { decodeVinBatch } from "@/lib/vehicle/nhtsa";
import { titleCaseMake, canonicalModel } from "@/lib/vehicle/canonical";
import { isValidVin } from "@/lib/vehicle/vin";

export async function enrichVins(
  sb: SupabaseClient,
  deals: Partial<Deal>[],
): Promise<number> {
  if (process.env.VIN_ENRICH === "off") return 0;
  const vins = Array.from(
    new Set(
      deals
        .map((d) => (d.vin ? String(d.vin).toUpperCase() : ""))
        .filter((v) => v && isValidVin(v)),
    ),
  );
  if (!vins.length) return 0;

  try {
    // 1. Cache lookup (vin_decodes).
    const cache = new Map<string, { year?: number; make?: string; model?: string; trim?: string }>();
    for (let i = 0; i < vins.length; i += 300) {
      const { data } = await sb
        .from("vin_decodes")
        .select("vin, year, make, model, trim")
        .in("vin", vins.slice(i, i + 300));
      for (const r of data || []) cache.set(String(r.vin).toUpperCase(), r);
    }

    // 2. Decode cache-misses via vPIC, then persist them to the cache.
    const misses = vins.filter((v) => !cache.has(v));
    if (misses.length) {
      const fresh = await decodeVinBatch(misses);
      const now = new Date().toISOString();
      const rows: any[] = [];
      fresh.forEach((d, vin) => {
        cache.set(vin, { year: d.year ?? undefined, make: d.make ?? undefined, model: d.model ?? undefined, trim: d.trim ?? undefined });
        rows.push({
          vin, year: d.year, make: d.make, model: d.model, trim: d.trim,
          body_class: d.bodyClass, drive_type: d.driveType, fuel_type: d.fuelType,
          cylinders: d.cylinders, displacement_l: d.displacementL,
          plant_country: d.plantCountry, made_in_usa: d.madeInUsa, decoded_at: now,
        });
      });
      if (rows.length)
        await sb.from("vin_decodes").upsert(rows, { onConflict: "vin" });
    }

    // 3. Apply the authoritative values onto each deal (overwrite the title-parsed guesses).
    let applied = 0;
    for (const deal of deals) {
      if (!deal.vin) continue;
      const d = cache.get(String(deal.vin).toUpperCase());
      if (!d || !d.make || !d.model) continue;
      deal.make = titleCaseMake(d.make) || deal.make;
      deal.model = canonicalModel(d.model) || deal.model;
      if (d.year && d.year > 1980) deal.year = d.year;
      if (!deal.trim && d.trim) deal.trim = d.trim;
      applied++;
    }
    return applied;
  } catch {
    return 0; // never block ingest on a decode hiccup
  }
}
