// workers/scrape-worker.ts
//
// Long-running, browser-capable scrape worker for the Docker fleet. Each replica loops: run one full
// scrape cycle, then sleep. Cycles are spawned as a FRESH child process (scrape-ci) so every cycle gets
// a clean Chrome teardown — no memory creep from long-lived headed browsers.
//
// Why a fleet: anti-bot walls (Cloudflare, DataDome, PerimeterX) score by IP reputation. One box
// hammering a host gets flagged; N workers on DIFFERENT hosts/IPs spread the load so no single IP burns,
// and a host parked on cooldown by one worker can still be fetched by another. Run the image under
// `xvfb-run` so smartFetch's headed real-Chrome tier (the only free path past PerimeterX/Akamai) works.
//
//   docker compose up --scale scraper=4         # 4 workers (different IPs only if on different hosts)
//
// Config (env):
//   SCRAPE_INTERVAL_MS  gap between cycle STARTS (default 30 min)
//   SCRAPE_SOURCES      comma-separated source ids (blank = the enabled default set)
//   ENABLE_HEADED_SCRAPERS=1  + a display (xvfb) → headed tier on

import "./polyfill";
import { spawn } from "node:child_process";
import "./ai-worker";

const INTERVAL_MS = Number(process.env.SCRAPE_INTERVAL_MS || 30 * 60_000);
const MIN_GAP_MS = 60_000; // never tight-loop, even if a cycle overruns the interval

function runCycle(): Promise<number> {
  return new Promise((resolve) => {
    // Reuse scrape-ci verbatim — it owns source resolution, sharding, retention, and browser teardown.
    const child = spawn("npx", ["tsx", "scripts/scrape-ci.ts"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (err) => {
      console.error("[scrape-worker] failed to spawn cycle:", err.message);
      resolve(1);
    });
  });
}

async function loop(): Promise<void> {
  console.log(
    `[scrape-worker] up — interval=${Math.round(INTERVAL_MS / 60000)}m, sources="${
      process.env.SCRAPE_SOURCES || "default set"
    }", headed=${process.env.ENABLE_HEADED_SCRAPERS === "1" ? "on" : "off"}`,
  );
  // Startup jitter so fleet replicas DESYNC — without it, N workers booted together would hit the same
  // host in the same window (their IPs differ, but synchronized bursts still look coordinated). Spread
  // the first cycle across up to 2 min (or a quarter of the interval, whichever is smaller).
  const jitter = Math.random() * Math.min(120_000, INTERVAL_MS / 4);
  console.log(`[scrape-worker] startup jitter ${Math.round(jitter / 1000)}s`);
  await new Promise((r) => setTimeout(r, jitter));
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    const t0 = Date.now();
    const code = await runCycle();
    const elapsed = Date.now() - t0;
    const wait = Math.max(MIN_GAP_MS, INTERVAL_MS - elapsed);
    console.log(
      `[scrape-worker] cycle exit=${code} in ${Math.round(elapsed / 1000)}s; next in ${Math.round(
        wait / 1000,
      )}s`,
    );
    await new Promise((r) => setTimeout(r, wait));
  }
}

loop().catch((err) => {
  console.error("[scrape-worker] fatal:", err);
  process.exit(1);
});
