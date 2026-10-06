#!/usr/bin/env node
/**
 * MikeHunt scraper health check
 * Queries Supabase scraper_runs to show live status of the Windows Docker worker.
 * Run: node scripts/health-check.mjs  (loads .env.local / .env automatically)
 */

import { existsSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  try {
    process.loadEnvFile(f);
  } catch {
    /* ignore unreadable env file */
  }
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
  console.error(
    "\n❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "   Add them to .env.local, or export them before running this script.\n",
  );
  process.exit(1);
}

const h = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const get = async (path) => {
  const response = await fetch(`${BASE}/rest/v1/${path}`, { headers: h });
  if (!response.ok) throw new Error(`Health read failed (${response.status})`);
  return response.json();
};

const minAgo = (ts) =>
  ts ? Math.round((Date.now() - new Date(ts)) / 60000) : null;
const pad = (s, n) => String(s).padEnd(n);

const runs = await get(
  "scraper_runs?order=started_at.desc&limit=50&select=source,status,started_at,completed_at,duration_ms,deals_found,deals_new,error_message",
);

const running = runs.filter((r) => r.status === "running");
const errors = runs.filter((r) => r.status === "error");
const success = runs.filter(
  (r) => r.status === "success" || r.status === "done",
);
const configuredMaxAge = Number(process.env.SCRAPER_MAX_IDLE_HOURS || 24);
const maxIdleMinutes =
  (Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
    ? configuredMaxAge
    : 24) * 60;
const lastSuccessfulAge = minAgo(
  success[0]?.completed_at || success[0]?.started_at,
);
const collectionOverdue =
  lastSuccessfulAge == null || lastSuccessfulAge > maxIdleMinutes;
const stuck = running.filter((r) => minAgo(r.started_at) > 60);

// Identify persistent failures (failed in last 3 batches without success in between)
const recentSources = {};
for (const r of runs) {
  if (!recentSources[r.source]) recentSources[r.source] = [];
  recentSources[r.source].push(r.status);
}
const persistentFails = Object.entries(recentSources)
  .filter(([, statuses]) => statuses.slice(0, 3).every((s) => s === "error"))
  .map(([src]) => src);

console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║  🖥️   WINDOWS DOCKER — LIVE SCRAPER STATUS           ║");
console.log(`╚══════════════════════════════════════════════════════╝`);
console.log(`  Checked at: ${new Date().toLocaleString()}\n`);
if (collectionOverdue) {
  console.log(
    `COLLECTION OVERDUE: last successful run ${lastSuccessfulAge == null ? "unknown" : `${lastSuccessfulAge}m ago`}; expected within ${maxIdleMinutes}m.\n`,
  );
}

if (stuck.length) {
  console.log(`🔴 STUCK (>60min, no completion):`);
  for (const r of stuck)
    console.log(`   ${pad(r.source, 28)} stuck ${minAgo(r.started_at)}m`);
  console.log();
}

if (persistentFails.length) {
  console.log(`❌ PERSISTENT FAILURES (last 3+ runs all errored):`);
  for (const src of persistentFails) {
    const last = errors.find((r) => r.source === src);
    console.log(
      `   ${pad(src, 28)} last fail: ${minAgo(last?.started_at) ?? "?"}m ago — ${last?.error_message || "no error captured"}`,
    );
  }
  console.log();
}

if (running.length - stuck.length > 0) {
  console.log(`🟡 CURRENTLY RUNNING:`);
  for (const r of running.filter((r) => minAgo(r.started_at) <= 60))
    console.log(`   ${r.source} — ${minAgo(r.started_at)}m ago`);
  console.log();
}

console.log(`✅ RECENT SUCCESSFUL RUNS:`);
for (const r of success.slice(0, 15)) {
  const dur = r.duration_ms ? (r.duration_ms / 1000).toFixed(0) + "s" : "?";
  console.log(
    `   ${pad(r.source, 28)} ${pad(minAgo(r.started_at) + "m ago", 12)} ${pad(dur, 8)} +${r.deals_new ?? 0} new`,
  );
}

// Totals
const cntDeals = await fetch(`${BASE}/rest/v1/deals?select=id&active=eq.true`, {
  headers: { ...h, Prefer: "count=exact", Range: "0-0" },
});
const dealTotal = cntDeals.headers.get("content-range")?.split("/")?.[1] ?? "?";

console.log(`\n📈 DATABASE:`);
console.log(`   Deals:      ${Number(dealTotal).toLocaleString()} active`);

// Exit with error code if persistent failures (for CI awareness)
const hasCritical =
  collectionOverdue || stuck.length > 0 || persistentFails.length > 0;
console.log(
  hasCritical
    ? "\n⚠️  ACTION NEEDED — see above\n"
    : "\n✅ All systems nominal\n",
);
process.exit(hasCritical ? 1 : 0);
