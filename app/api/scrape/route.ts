export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { EnhancedScrapingEngine } from "@/lib/scrapers/enhanced-engine";
import { SCRAPER_CONFIGS } from "@/lib/scrapers/source-configs";
import { createClient } from "@supabase/supabase-js";

function createScrapingEngine() {
  return new EnhancedScrapingEngine(
    process.env.REDIS_URL || "redis://localhost:6379",
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );
}

// Shared-secret gate. Scraping is heavy and can burn IPs / CI minutes, so this endpoint must never be
// public. Caller sends `Authorization: Bearer <SCRAPE_SECRET|CRON_SECRET>`. Secure-by-default: with no
// secret configured the endpoint is CLOSED in production (open only in local dev so a dev box stays
// usable). Returns a NextResponse to short-circuit, or null when the request is allowed.
function denyUnauthed(request: NextRequest): NextResponse | null {
  const secret = process.env.SCRAPE_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production")
      return NextResponse.json(
        { error: "Scrape endpoint disabled: set SCRAPE_SECRET or CRON_SECRET" },
        { status: 503 },
      );
    return null; // local dev: allow
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function POST(request: NextRequest) {
  const denied = denyUnauthed(request);
  if (denied) return denied;
  const scrapingEngine = createScrapingEngine();
  try {
    const body = await request.json();
    const { sources, force = false } = body;

    // Validate sources
    let configsToScrape = SCRAPER_CONFIGS;
    if (sources && Array.isArray(sources)) {
      configsToScrape = SCRAPER_CONFIGS.filter((config) =>
        sources.includes(config.name),
      );
    }

    if (configsToScrape.length === 0) {
      return NextResponse.json(
        { error: "No valid sources specified" },
        { status: 400 },
      );
    }

    // Check if scraping is already in progress
    const redis = scrapingEngine["redis"];
    const scrapingStatus = await redis.get("scraping:status");

    if (scrapingStatus === "active" && !force) {
      return NextResponse.json(
        {
          error: "Scraping already in progress",
          status: "active",
        },
        { status: 409 },
      );
    }

    // Set scraping status
    await redis.setex("scraping:status", 3600, "active");
    await redis.setex("scraping:started", 3600, new Date().toISOString());

    // Start scraping in background
    scrapeInBackground(configsToScrape);

    return NextResponse.json({
      message: "Scraping started",
      sources: configsToScrape.map((c) => c.name),
      estimatedTime: configsToScrape.length * 5, // 5 minutes per source
    });
  } catch (error) {
    console.error("Error starting scrape:", error);
    return NextResponse.json(
      { error: "Failed to start scraping" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const denied = denyUnauthed(request);
  if (denied) return denied;
  try {
    const scrapingEngine = createScrapingEngine();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    if (status === "true") {
      // Get scraping status
      const redis = scrapingEngine["redis"];
      const scrapingStatus = await redis.get("scraping:status");
      const started = await redis.get("scraping:started");
      const progress = await redis.get("scraping:progress");

      return NextResponse.json({
        status: scrapingStatus || "idle",
        started: started || null,
        progress: progress ? JSON.parse(progress) : null,
      });
    }

    // Get available sources
    const sources = SCRAPER_CONFIGS.map((config) => ({
      name: config.name,
      type: config.type,
      updateFrequency: config.updateFrequency,
      requiresAuth: config.requiresAuth,
    }));

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Error getting scrape info:", error);
    return NextResponse.json(
      { error: "Failed to get scrape info" },
      { status: 500 },
    );
  }
}

async function scrapeInBackground(configs: any[]) {
  const scrapingEngine = createScrapingEngine();
  try {
    const redis = scrapingEngine["redis"];
    const totalSources = configs.length;
    let completedSources = 0;

    // Update progress
    const updateProgress = () => {
      const progress = {
        total: totalSources,
        completed: completedSources,
        percentage: Math.round((completedSources / totalSources) * 100),
      };
      redis.setex("scraping:progress", 3600, JSON.stringify(progress));
    };

    // Initialize browser
    await scrapingEngine.initializeBrowser();

    // Scrape each source
    for (const config of configs) {
      try {
        console.log(`Starting scrape for ${config.name}`);
        await scrapingEngine.scrapeSource(config);
        completedSources++;
        updateProgress();
        console.log(`Completed scrape for ${config.name}`);
      } catch (error) {
        console.error(`Failed to scrape ${config.name}:`, error);
      }
    }

    // Clean up
    await scrapingEngine.close();

    // Update status
    await redis.set("scraping:status", "completed");
    await redis.set("scraping:completed", new Date().toISOString());
  } catch (error) {
    console.error("Background scraping error:", error);
    const redis = scrapingEngine["redis"];
    await redis.set("scraping:status", "error");
    await redis.set(
      "scraping:error",
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
