#!/usr/bin/env tsx

import { parseArgs } from "node:util";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  inventoryIdentityAudit,
  type InventoryEvidenceRow,
} from "../lib/scrapers/inventory-evidence-audit";

const PAGE_SIZE = 1_000;
const PROJECT_HOST = "qupzqpezslsbobhugswp.supabase.co";

async function main() {
  const { values } = parseArgs({
    options: { "env-file": { type: "string" } },
  });
  if (!values["env-file"])
    throw new Error(
      "Usage: npx tsx scripts/audit-inventory-evidence.ts --env-file <worker-env>",
    );
  const loaded = config({
    path: values["env-file"],
    override: true,
    quiet: true,
  });
  if (loaded.error)
    throw new Error("Cannot load the requested worker environment.");

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || new URL(url).hostname !== PROJECT_HOST)
    throw new Error("Refusing to audit a database other than MIKEHUNT.");
  if (!key) throw new Error("Worker database credential is not configured.");

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rows: InventoryEvidenceRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("deals")
      .select("source,source_deal_id,source_url,images,options")
      .eq("active", true)
      .eq("options->>aggregator", "autotempest")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .abortSignal(AbortSignal.timeout(15_000));
    if (error)
      throw new Error(
        `Inventory evidence query failed (${error.code || "query_failed"}).`,
      );
    rows.push(...((data || []) as InventoryEvidenceRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }

  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: "read_only",
        scope: "active_autotempest_rows",
        identity: inventoryIdentityAudit(rows),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Inventory evidence audit failed.",
  );
  process.exitCode = 1;
});
