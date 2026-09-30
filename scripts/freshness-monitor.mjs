/**
 * Freshness Monitor — checks that each scraper source has produced deals
 * within the expected SLO window (SCRAPE_INTERVAL_MS × 2 + 5min buffer).
 *
 * Usage:
 *   node scripts/freshness-monitor.mjs
 *   OR set it up as a cron/synthetic monitor hitting /api/scrape/health
 *
 * Exit code 0 = all sources fresh
 * Exit code 1 = one or more sources are stale → page/alert
 */

const HEALTH_URL = process.env.HEALTH_URL ?? "http://localhost:3000/api/scrape/health";
const STALE_THRESHOLD_MINUTES = parseInt(process.env.STALE_THRESHOLD_MINUTES ?? "75"); // 30min interval × 2 + 15min buffer
const VERBOSE = process.env.VERBOSE === "1";

async function checkFreshness() {
  let data;
  try {
    const res = await fetch(HEALTH_URL, { headers: { "x-monitor": "freshness-check" } });
    if (!res.ok) {
      console.error(`[freshness-monitor] Health endpoint returned ${res.status}. URL: ${HEALTH_URL}`);
      process.exit(1);
    }
    data = await res.json();
  } catch (err) {
    console.error(`[freshness-monitor] Could not reach health endpoint: ${err.message}`);
    process.exit(1);
  }

  const sources = data.sources ?? [];
  const stale = [];
  const neverRun = [];

  for (const src of sources) {
    if (!src.enabled) continue;

    if (!src.lastRunAt) {
      neverRun.push(src.id);
      continue;
    }

    const minutesAgo = Math.round(
      (Date.now() - new Date(src.lastRunAt).getTime()) / 1000 / 60
    );

    if (VERBOSE) {
      console.log(`  ${src.id}: last run ${minutesAgo}m ago (status=${src.lastStatus})`);
    }

    if (minutesAgo > STALE_THRESHOLD_MINUTES) {
      stale.push({ id: src.id, minutesAgo, lastStatus: src.lastStatus });
    }
  }

  if (neverRun.length > 0) {
    console.warn(`[freshness-monitor] ⚠️  Sources never run: ${neverRun.join(", ")}`);
  }

  if (stale.length === 0) {
    console.log(`[freshness-monitor] ✅ All ${sources.filter((s) => s.enabled).length} active sources are fresh (threshold=${STALE_THRESHOLD_MINUTES}m)`);
    process.exit(0);
  }

  console.error(`[freshness-monitor] 🔴 STALE SOURCES (${stale.length}):`);
  for (const s of stale) {
    console.error(`  - ${s.id}: ${s.minutesAgo}m ago (last=${s.lastStatus})`);
  }
  process.exit(1);
}

checkFreshness();
