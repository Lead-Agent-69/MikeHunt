// Shared CLI plumbing for the free sold-comps scripts: dry run by default, --write to upsert.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  summarize,
  writeSoldListings,
  type SoldListingInsert,
} from "../lib/sources/open-gov/sold-comps";

config({ path: ".env.local" });

export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "true";
}

export async function report(label: string, rows: SoldListingInsert[]) {
  console.log(`[${label}] ${JSON.stringify(summarize(rows))}`);
  if (flag("write") !== "true") {
    console.log(
      `[${label}] dry run: nothing written. Re-run with --write to upsert.`,
    );
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set",
    );
  const res = await writeSoldListings(createClient(url, key), rows);
  if (res.skipped) {
    console.warn(`[${label}] not written: ${res.skipped}`);
    process.exitCode = 2;
    return;
  }
  console.log(
    `[${label}] upserted ${res.written} new of ${res.attempted} (existing rows kept)`,
  );
}
