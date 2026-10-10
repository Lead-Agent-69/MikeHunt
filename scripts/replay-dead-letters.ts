#!/usr/bin/env tsx
/**
 * Review and replay the scraper dead-letter queue (scraper_dead_letters: records that failed parse
 * or validation, kept <= 2 KB each, 30 days / 2,000 rows).
 *
 *   npx tsx scripts/replay-dead-letters.ts --list [--source craigslist] [--limit 20]
 *   npx tsx scripts/replay-dead-letters.ts --replay [--source craigslist] [--limit 50] [--dry-run]
 *   npx tsx scripts/replay-dead-letters.ts --replay --id 123
 *
 * --replay feeds each stored payload back through upsertDeals (the same normalize + quality gate as a
 * scrape, so a record the validator still rejects is rejected again; nothing is forced in) and marks
 * the row replayed_at + replay_result. Parse failures carry only a raw snippet (no payload): they are
 * listed for a parser fix and marked "no payload" on replay. Service role (.env.local).
 */
import * as dotenv from "dotenv";
import path from "node:path";
import { scrubUrls } from "../lib/security/scrub-urls";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "";
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
    process.exit(2);
  }
  const sb = createClient(url, key);
  const limit = Math.min(
    500,
    Math.max(1, Number(arg("limit")) || (has("replay") ? 50 : 20)),
  );
  const source = arg("source");
  const id = arg("id");
  const dryRun = has("dry-run");

  let q = sb
    .from("scraper_dead_letters")
    .select(
      "id, source, url, reason, raw_snippet, payload, created_at, replayed_at",
    )
    .is("replayed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (source) q = q.eq("source", source);
  if (id)
    q = sb
      .from("scraper_dead_letters")
      .select("*")
      .eq("id", Number(id))
      .limit(1);
  const { data, error } = await q;
  if (error) {
    console.error(`could not read scraper_dead_letters: ${error.message}`);
    process.exit(1);
  }
  const rows = data ?? [];

  if (!has("replay")) {
    const byReason = new Map<string, number>();
    for (const r of rows) {
      const k = `${r.source} | ${String(r.reason).split(":").slice(0, 2).join(":")}`;
      byReason.set(k, (byReason.get(k) ?? 0) + 1);
    }
    console.log(
      `${rows.length} pending dead letters${source ? ` for ${source}` : ""}:`,
    );
    for (const [k, n] of Array.from(byReason.entries()).sort(
      (a, b) => b[1] - a[1],
    ))
      console.log(`  ${String(n).padStart(4)}  ${k}`);
    for (const r of rows.slice(0, 10))
      console.log(
        `  #${r.id} ${r.created_at} ${r.source} ${r.url ?? ""}\n      ${r.reason}`,
      );
    return;
  }

  const { upsertDeals } = await import("../lib/scrapers/pipeline");
  const { newRunTelemetry, withRunTelemetry } =
    await import("../lib/scrapers/ops/run-telemetry");
  let upserted = 0;
  let rejected = 0;
  let noPayload = 0;
  for (const r of rows) {
    let result: string;
    if (!r.payload || typeof r.payload !== "object") {
      result =
        "no payload (parse failure: fix the parser, the next scrape re-reads the page)";
      noPayload++;
    } else if (dryRun) {
      result = "dry run";
    } else {
      const t = newRunTelemetry(r.source);
      const n = await withRunTelemetry(t, () =>
        upsertDeals([
          {
            ...(r.payload as Record<string, unknown>),
            source: r.payload.source ?? r.source,
          } as any,
        ]),
      );
      if (n > 0) {
        result = "upserted";
        upserted++;
      } else {
        result = `rejected again: ${t.deadLetters[0]?.reason ?? "filtered (out of scope or duplicate)"}`;
        rejected++;
      }
    }
    console.log(`#${r.id} ${r.source}: ${result}`);
    if (!dryRun)
      await sb
        .from("scraper_dead_letters")
        .update({
          replayed_at: new Date().toISOString(),
          replay_result: scrubUrls(result).slice(0, 300),
        })
        .eq("id", r.id);
  }
  console.log(
    `replayed ${rows.length}: ${upserted} upserted, ${rejected} rejected again, ${noPayload} without payload${dryRun ? " (dry run, nothing written)" : ""}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
