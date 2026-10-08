#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { fetchAllRows } from "../lib/db/paginate";
import {
  isRecoveryCandidate,
  recoverStoppedSourceRun,
  type RecoverableSourceRun,
} from "../lib/scrapers/run-recovery";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Preview: npx tsx scripts/recover-source-runs.ts\nApply: add --apply --workers-stopped --ids=<comma-separated-run-UUIDs>\nStop and verify every owning worker before apply. No deletion or automatic retry.",
    );
    return;
  }
  const allowed = args.every(
    (arg) =>
      ["--apply", "--workers-stopped"].includes(arg) ||
      arg.startsWith("--ids="),
  );
  if (!allowed) throw new Error("Unknown argument; use --help");
  const apply = args.includes("--apply");
  const stopped = args.includes("--workers-stopped");
  const ids = (args.find((arg) => arg.startsWith("--ids="))?.slice(6) || "")
    .split(",")
    .filter(Boolean);
  if (apply && (!stopped || !ids.length))
    throw new Error(
      "Apply requires explicit --ids and --workers-stopped confirmation",
    );
  if (
    ids.some((id) => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
  )
    throw new Error("Run IDs must be UUIDs");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Supply the target database URL and service-role key in the environment",
    );
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = Date.now();
  const rows = await fetchAllRows<RecoverableSourceRun>((from, to) => {
    let query = client
      .from("scraper_runs")
      .select("id,source,status,started_at,completed_at")
      .eq("status", "running")
      .is("completed_at", null)
      .order("id")
      .range(from, to);
    if (ids.length) query = query.in("id", ids);
    return query;
  });
  const candidates = rows.filter((run) => isRecoveryCandidate(run, now));
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "preview",
        checkedAt: new Date(now),
        candidates,
      },
      null,
      2,
    ),
  );
  if (!apply) return;
  if (new Set(ids).size !== candidates.length)
    throw new Error(
      "Some requested IDs are no longer eligible; review a fresh preview",
    );
  for (const run of candidates) {
    const recovered = await recoverStoppedSourceRun(client, run, stopped, now);
    console.log(
      `${run.id}: ${recovered ? "marked interrupted" : "changed concurrently; skipped"}`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Recovery failed");
  process.exitCode = 1;
});
