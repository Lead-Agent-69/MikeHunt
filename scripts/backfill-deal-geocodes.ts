// Backfill precise lat/lng for CARS in `deals` that landed without coords (the harvest geocodes best-effort
// but caps lookups/batch, so coverage lags). Pulls active rows missing coordinates but carrying a usable
// city+state, resolves them through the SHARED free geocoder (Nominatim, cached in geocode_cache — heavily
// shared with houses, so most lookups are cache hits), and writes the coords back. This lifts map + distance
// coverage. Idempotent + bounded: dry-run by default, capped lookups/run. CARS-ONLY (vertical isolation).
//
//   npx tsx scripts/backfill-deal-geocodes.ts             # dry-run: coverage + what would resolve
//   npx tsx scripts/backfill-deal-geocodes.ts --apply     # write resolved coords back
//   npx tsx scripts/backfill-deal-geocodes.ts --apply --max 400
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolvePlaces, placeKey } from "../lib/geo/geocode";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APPLY = process.argv.includes("--apply");
const maxArg = process.argv.indexOf("--max");
const MAX_LOOKUPS = maxArg > -1 ? Number(process.argv[maxArg + 1]) || 300 : 300;

async function main() {
  const { count: total } = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("active", true);
  const { count: precise } = await sb
    .from("deals")
    .select("id", { count: "exact", head: true })
    .eq("active", true)
    .not("lat", "is", null)
    .not("lng", "is", null);
  console.log(
    `coverage: ${precise ?? 0}/${total ?? 0} active cars have lat/lng`,
  );

  // Candidates: active, missing coords, with a usable city+state. Paged so we cover the whole backlog.
  const candidates: {
    id: string;
    location_city: string | null;
    location_state: string | null;
  }[] = [];
  const PAGE = 1000;
  for (let off = 0; off < 40000; off += PAGE) {
    const { data, error } = await sb
      .from("deals")
      .select("id, location_city, location_state")
      .eq("active", true)
      .is("lat", null)
      .not("location_city", "is", null)
      .not("location_state", "is", null)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (placeKey({ city: r.location_city, state: r.location_state }))
        candidates.push(r);
    }
    if (data.length < PAGE) break;
  }
  console.log(
    `candidates (missing coords, usable city+state): ${candidates.length}`,
  );
  if (!candidates.length) return;

  // Resolve UNIQUE places through the shared cache (capped/run; 1.1s delay = polite to Nominatim). Because
  // many cars share a city, a few hundred lookups cover thousands of rows.
  const coords = await resolvePlaces(
    sb,
    candidates.map((r) => ({
      city: r.location_city,
      state: r.location_state,
    })),
    { maxLookups: MAX_LOOKUPS, delayMs: 1100 },
  );
  console.log(`resolved ${coords.size} unique places this run`);

  let wrote = 0;
  for (const r of candidates) {
    const k = placeKey({ city: r.location_city, state: r.location_state });
    const c = k ? coords.get(k) : undefined;
    if (!c) continue;
    if (!APPLY) {
      wrote++;
      continue;
    }
    const { error: upErr } = await sb
      .from("deals")
      .update({ lat: c.lat, lng: c.lng })
      .eq("id", r.id);
    if (!upErr) wrote++;
  }
  console.log(
    APPLY
      ? `DONE: wrote coords to ${wrote} cars`
      : `DRY-RUN: ${wrote} cars would get coords — re-run with --apply`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
