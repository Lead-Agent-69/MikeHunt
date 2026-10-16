// Repair existing locations without claiming the listing was observed again.
// Dry-run by default. --max 0 uses only trusted cached coordinates.
// npx tsx scripts/backfill-deal-geocodes.ts --apply --max 200 --expected-project <ref>
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { appendFileSync } from "node:fs";
import { resolvePlaces, placeKey, type PlaceInput } from "../lib/geo/geocode";
config({ path: ".env.local", quiet: true });

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const apply = process.argv.includes("--apply");
const maxLookups = Number(argument("--max") ?? 200);
const expected = argument("--expected-project");
const receipt = argument("--receipt");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const host = new URL(url).hostname;
if (!Number.isInteger(maxLookups) || maxLookups < 0 || maxLookups > 2000)
  throw new Error("--max must be an integer from 0 to 2000");
if (
  apply &&
  !["localhost", "127.0.0.1"].includes(host) &&
  host !== `${expected}.supabase.co`
)
  throw new Error(
    "Remote writes require --expected-project matching the configured database",
  );
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
type Candidate = {
  id: string;
  location_zip: string | null;
  location_city: string | null;
  location_state: string | null;
  lat: number | null;
  lng: number | null;
};

async function main() {
  const groups = new Map<string, { place: PlaceInput; rows: Candidate[] }>();
  let scanned = 0;
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("deals")
      .select("id,location_zip,location_city,location_state,lat,lng")
      .eq("active", true)
      .or("lat.is.null,lng.is.null")
      .order("id")
      .range(from, from + 499);
    if (error) throw new Error(error.message);
    for (const row of (data || []) as Candidate[]) {
      scanned++;
      const place = {
        zip: row.location_zip,
        city: row.location_city,
        state: row.location_state,
      };
      if (!placeKey(place)) continue;
      const key = JSON.stringify(place);
      const group = groups.get(key) || { place, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }
    if (!data || data.length < 500) break;
  }
  const ordered = Array.from(groups.values()).sort(
    (a, b) => b.rows.length - a.rows.length,
  );
  let remaining = maxLookups;
  let written = 0;
  let resolved = 0;
  const counted = new Set<string>();
  for (let start = 0; start < ordered.length; start += 100) {
    const batch = ordered.slice(start, start + 100);
    let networkCalls = 0;
    const coords = await resolvePlaces(
      db,
      batch.map((group) => group.place),
      {
        maxLookups: remaining,
        delayMs: 1100,
        fetchImpl: async (input, init) => {
          networkCalls++;
          return fetch(input, { ...init, signal: AbortSignal.timeout(8000) });
        },
      },
    );
    remaining -= networkCalls;
    for (const group of batch) {
      const key = placeKey(group.place)!;
      const point = coords.get(key);
      if (!point) continue;
      if (!counted.has(key)) {
        resolved++;
        counted.add(key);
      }
      for (let offset = 0; offset < group.rows.length; offset += 100) {
        const rows = group.rows.slice(offset, offset + 100);
        if (!apply) {
          written += rows.length;
          continue;
        }
        if (receipt)
          appendFileSync(
            receipt,
            JSON.stringify({
              at: new Date().toISOString(),
              before: rows,
              coordinates: point,
            }) + "\n",
          );
        let query = db
          .from("deals")
          .update({ lat: point.lat, lng: point.lng })
          .eq("active", true)
          .in(
            "id",
            rows.map((row) => row.id),
          )
          .or("lat.is.null,lng.is.null");
        for (const column of [
          "location_zip",
          "location_city",
          "location_state",
        ] as const) {
          query =
            rows[0][column] == null
              ? query.is(column, null)
              : query.eq(column, rows[0][column]!);
        }
        const { data, error } = await query.select("id");
        if (error) throw new Error(error.message);
        written += data?.length || 0;
      }
    }
    console.log(
      JSON.stringify({
        host,
        apply,
        candidates: scanned,
        placesProcessed: Math.min(start + 100, ordered.length),
        resolved,
        networkCalls: maxLookups - remaining,
        written,
      }),
    );
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
