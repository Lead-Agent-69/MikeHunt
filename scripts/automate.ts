// scripts/automate.ts
// Local automation daemon (running on intervals instead of BullMQ)

import { scrapeIAA } from "../lib/scrapers/sources/iaa";
import { scrapeCraigslist } from "../lib/scrapers/sources/craigslist";
import { scrapeCopart } from "../lib/scrapers/sources/copart";
import { runPipeline } from "./pipeline";
import { checkAlerts } from "../lib/alerts/alert-engine";
import { checkSavedCars } from "../workers/savedCarsChecker";

async function safeRun(name: string, fn: () => Promise<any>) {
  const startTime = Date.now();
  console.log(
    `\n⏰ [${new Date().toLocaleTimeString()}] [AUTOMATION] Starting task: ${name}...`,
  );
  try {
    const result = await fn();
    console.log(
      `✅ [AUTOMATION] Task "${name}" completed successfully in ${Date.now() - startTime}ms.`,
    );
    return result;
  } catch (error: any) {
    console.error(`❌ [AUTOMATION] Task "${name}" failed:`, error.message);
  }
}

async function loop() {
  console.log("🤖 Starting DealerHunt Automation Daemon...");
  console.log("Press Ctrl+C to exit.");

  // Run initial pass
  await safeRun("Scrape IAA", () => scrapeIAA());
  await safeRun("Scrape Craigslist", () => scrapeCraigslist());
  await safeRun("Scrape Copart", () => scrapeCopart());
  await safeRun("Enrichment Pipeline", () => runPipeline());
  await safeRun("Check Alerts", () => checkAlerts());
  await safeRun("Check Saved Cars", () => checkSavedCars());

  // Intervals:
  // Scrapers: every 10 mins
  // Pipeline/Alerts: every 2 mins
  // Saved Cars check: every 5 mins

  setInterval(
    async () => {
      await safeRun("Enrichment Pipeline", () => runPipeline());
      await safeRun("Check Alerts", () => checkAlerts());
    },
    2 * 60 * 1000,
  );

  setInterval(
    async () => {
      await safeRun("Check Saved Cars", () => checkSavedCars());
    },
    5 * 60 * 1000,
  );

  setInterval(
    async () => {
      await safeRun("Scrape IAA", () => scrapeIAA());
      await safeRun("Scrape Craigslist", () => scrapeCraigslist());
      await safeRun("Scrape Copart", () => scrapeCopart());
    },
    10 * 60 * 1000,
  );
}

loop();
