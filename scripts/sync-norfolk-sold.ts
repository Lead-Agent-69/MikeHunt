import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import {
  fetchNorfolkSoldRows,
  norfolkSoldRows,
  resolveNorfolkSince,
  writeNorfolkSoldRows,
} from "../lib/sources/open-gov/norfolk-sold";

dotenv.config({ path: ".env.local.scraper" });
dotenv.config({ path: ".env.local" });

function flag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : "true";
}

async function main() {
  const requestedSince = flag("since");
  const shouldWrite = flag("write") === "true";
  const needsDatabase = !requestedSince || shouldWrite;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (needsDatabase && (!url || !key))
    throw new Error("Supabase scraper credentials are missing");
  const supabase =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  const since =
    requestedSince ||
    (await resolveNorfolkSince(supabase as NonNullable<typeof supabase>));
  const sourceRows = await fetchNorfolkSoldRows(since);
  const rows = norfolkSoldRows(sourceRows);
  console.log(
    `[norfolk-sold] ${sourceRows.length} source rows since ${since}; ${rows.length} valid car/light-truck sales`,
  );
  if (!shouldWrite) {
    console.log("[norfolk-sold] dry run; pass --write to persist idempotently");
    return;
  }
  const written = await writeNorfolkSoldRows(
    supabase as NonNullable<typeof supabase>,
    rows,
  );
  console.log(`[norfolk-sold] persisted ${written} new sold observations`);
}

main().catch((error) => {
  console.error("[norfolk-sold] failed:", (error as Error).message);
  process.exitCode = 1;
});
