// lib/scrapers/smart-fetch.ts
//
// One fetch to rule them all — an autonomous, self-learning escalation ladder. Every scraper calls
// smartFetch(url) and gets back rendered HTML from the CHEAPEST tool that actually beats the site's
// defenses, climbing only as far as it must:
//
//   static  → plain HTTP (undici). Free, instant. Works for open sites + JSON-ish HTML.
//   stealth → Patchright stealth Chromium, HEADLESS. Beats Cloudflare (cars.com). CI-friendly.
//   headed  → Patchright + real Chrome, HEADED + persistent context. The only free path past
//             PerimeterX / Akamai (truecar, autotrader, cargurus). Needs a display — present on
//             macOS, and on Linux CI only under `xvfb-run` (or DISPLAY / ENABLE_HEADED_SCRAPERS set).
//
// It REMEMBERS which tier won per host, so after the first page every later page jumps straight to the
// working tool instead of re-probing the cheap ones. Browser tiers keep ONE warm browser per host for
// the whole run (sequential pagination reuses it; different hosts get isolated pages so the concurrent
// orchestrator is race-safe). Call closeSmartFetch() once the run is done.
//
// This is the single brain behind the walls. Sources just say "fetch this URL"; the system picks the
// tool. See open-api-source-unlocks memory for the per-site wall map.

import { chromium } from "patchright";
import type { BrowserContext, Page } from "patchright";
import { recommendedTier, type AntiBotVendor } from "./platform-detector";
import { FlareSolverrClient } from "./tools/flaresolverr";

export type FetchTier = "static" | "stealth" | "headed" | "flaresolverr";

export interface SmartFetchResult {
  html: string;
  tier: FetchTier;
  blocked: boolean;
  /** Reached the page, but the data the caller asked for (validate()) never materialized — even after
   *  the full arsenal. The HTML is returned best-effort, but the caller should treat it as "no data,"
   *  not silently assume success. Awareness, not a wall. */
  unverified?: boolean;
}

// The full ladder, cheap → powerful. Each fetch climbs from where it expects to win.
const LADDER: FetchTier[] = ["static", "stealth", "headed"];

// Headed Chrome needs a real display. macOS always has one; Linux CI only under xvfb (which exports
// DISPLAY) or when explicitly opted in. Off → the headed tier is skipped and those hosts return
// blocked (gracefully) instead of crashing a headless box.
const HEADED_AVAILABLE =
  process.platform === "darwin" ||
  !!process.env.DISPLAY ||
  process.env.ENABLE_HEADED_SCRAPERS === "1";

// FlareSolverr — the RESERVE arsenal piece. A separate self-hosted anti-bot proxy (different TLS/JA3 +
// its own challenge solver) that can win where in-house Patchright doesn't. Only deployed when configured
// AND the whole in-house ladder failed — i.e. when we're "not getting the data," throw everything we have
// at it before giving up. Off (no FLARESOLVERR_URL) → it's simply absent from the queue.
const FLARE_AVAILABLE = !!process.env.FLARESOLVERR_URL;
let flareClient: FlareSolverrClient | null = null;
async function fetchViaFlareSolverr(url: string): Promise<string> {
  if (!flareClient) flareClient = new FlareSolverrClient();
  return flareClient.getHtml(url, 60_000);
}

/**
 * Order the tools to deploy for a host: the learned winner first (it usually wins again), then the rest
 * of the in-house ladder, then FlareSolverr as the reserve (only when configured). This is the "full
 * arsenal" the fetch will draw on when it isn't getting the data — exported pure so the ordering is tested.
 */
export function buildTierQueue(
  learned: FetchTier | undefined,
  flareAvailable: boolean = FLARE_AVAILABLE,
): FetchTier[] {
  const q = learned
    ? [learned, ...LADDER.filter((t) => t !== learned)]
    : [...LADDER];
  if (flareAvailable && !q.includes("flaresolverr")) q.push("flaresolverr");
  return q;
}

// Per-host learned winner (the tier that last got real data).
const hostWinner = new Map<string, FetchTier>();

// Per-host anti-bot wall the detector last identified — the scraper's situational awareness, surfaced on
// the status page and used to jump straight to the verified-working tool instead of climbing blindly.
const hostAntiBot = new Map<string, AntiBotVendor>();

// Per-host cooldown. When every available tier is blocked, we DON'T keep hammering — that's exactly how
// an IP gets reputation-flagged (Cloudflare/DataDome track request volume per IP). Instead we park the
// host until this timestamp and skip it, giving the IP time to cool off. A distributed worker fleet on
// different IPs is the real fix; this stops a single box from burning itself.
const hostCooldownUntil = new Map<string, number>();
const COOLDOWN_MS = 10 * 60_000;

// Per-host request pacing. Even before a block, BURSTING a host is what builds a bad reputation. We
// space same-host requests by a jittered minimum so one worker looks like a human browsing, not a
// scraper firing. Combined with the fleet (different IPs) this keeps every IP clean. Tunable via
// SMARTFETCH_HOST_SPACING_MS.
const hostLastFetch = new Map<string, number>();
const MIN_HOST_SPACING_MS = Number(
  process.env.SMARTFETCH_HOST_SPACING_MS || 1800,
);

// One warm browser/page per host, per browser tier (isolation = concurrency safety). Keyed
// "tier:host". Persistent contexts (Patchright's strongest stealth mode) — closed in closeSmartFetch.
const browserByKey = new Map<string, { ctx: BrowserContext; page: Page }>();

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Challenge / block-page detection. Anti-bot interstitials are tiny and carry tell-tale markers.
const BLOCK_RE =
  /just a moment|attention required|cf-chl|_cf_chl|px-captcha|perimeterx|pardon our interruption|page unavailable|access to this page has been denied|enable javascript and cookies|verify you are (a )?human|unusual traffic/i;

function isBlocked(html: string, status: number): boolean {
  if (status === 403 || status === 429 || status === 503) return true;
  if (html.length < 800) return true; // stubs / redirects / empty challenges
  return BLOCK_RE.test(html.slice(0, 12000));
}

// ── Tier: static HTTP ──────────────────────────────────────────────────────
async function fetchStatic(
  url: string,
): Promise<{ html: string; status: number; headers: Record<string, string> }> {
  const fp = fingerprintFor(hostOf(url));
  // A coherent modern-Chrome TOP-LEVEL NAVIGATION header set whose values all match this host's persona
  // (UA ↔ sec-ch-ua version ↔ platform ↔ Accept-Language). Node's fetch normalizes header ORDER (which we
  // can't fully control, and Chrome's exact JA4/h2 fingerprint is unreachable from pure Node — those hosts
  // route to the Patchright real-Chrome tier), but coherent VALUES kill the most common tell: a lone
  // generic UA with no client hints. Exact document `Accept` + `Priority: u=0, i` + sec-fetch-* per spec.
  const res = await fetch(url, {
    headers: {
      "sec-ch-ua": fp.chUa,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": fp.platform,
      "Upgrade-Insecure-Requests": "1",
      "User-Agent": fp.ua,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "document",
      "Accept-Encoding": "gzip, deflate, br",
      "Accept-Language": `${fp.locale},en;q=0.9`,
      Priority: "u=0, i",
    },
    signal: AbortSignal.timeout(20_000),
  });
  // Surface response headers so the detector can read anti-bot tells (cf-ray, x-datadome, set-cookie…).
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return { html: await res.text(), status: res.status, headers };
}

// Browser fingerprint pool. Even on the same IP, presenting a varied (but internally-consistent) UA +
// viewport + locale + timezone makes requests look like different real users — anti-bot scores the
// fingerprint alongside the IP. One fingerprint is picked PER HOST (stable within a run so a session
// stays consistent — flip-flopping is itself a bot tell) and differs across fleet replicas (each is a
// separate process), so N nodes look like N different browsers, not N clones.
// COHERENCE > rotation. Every field must encode the SAME browser/OS: a Windows UA with a macOS
// client-hint is MORE suspicious than a plain one (anti-bots cross-check UA ↔ sec-ch-ua ↔ platform). So
// each persona pins a real Chrome version + its MATCHING sec-ch-ua + platform. One persona is picked PER
// HOST (stable within a run — flip-flopping is itself a tell) and differs across fleet replicas.
const chUa = (v: number) =>
  `"Google Chrome";v="${v}", "Chromium";v="${v}", "Not_A Brand";v="24"`;
interface Fingerprint {
  ua: string;
  viewport: { width: number; height: number };
  locale: string;
  tz: string;
  chUa: string; // sec-ch-ua — matches the UA's Chrome version
  platform: string; // sec-ch-ua-platform — matches the UA's OS
}
const FINGERPRINTS: Fingerprint[] = [
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    tz: "America/New_York",
    chUa: chUa(131),
    platform: '"macOS"',
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1920, height: 1080 },
    locale: "en-US",
    tz: "America/Chicago",
    chUa: chUa(131),
    platform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1536, height: 864 },
    locale: "en-US",
    tz: "America/Los_Angeles",
    chUa: chUa(130),
    platform: '"Windows"',
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1680, height: 1050 },
    locale: "en-US",
    tz: "America/Denver",
    chUa: chUa(130),
    platform: '"macOS"',
  },
];
const fpByHost = new Map<string, Fingerprint>();
function fingerprintFor(host: string): Fingerprint {
  let fp = fpByHost.get(host);
  if (!fp) {
    fp = FINGERPRINTS[Math.floor(Math.random() * FINGERPRINTS.length)];
    fpByHost.set(host, fp);
  }
  return fp;
}

// ── Browser tiers (Patchright persistent context = strongest stealth) ──────
// stealth = headless Chromium (beats Cloudflare). headed = visible real Chrome (beats PerimeterX/
// Akamai, needs a display). NB: deliberately NO page.route() — request interception enables the CDP
// Fetch domain, which Patchright can't hide and Cloudflare detects.
async function browserPageFor(
  host: string,
  tier: "stealth" | "headed",
): Promise<Page> {
  const key = `${tier}:${host}`;
  const existing = browserByKey.get(key);
  if (existing && !existing.page.isClosed()) return existing.page;
  const fp = fingerprintFor(host);
  const ctx = await chromium.launchPersistentContext("", {
    headless: tier === "stealth",
    channel: tier === "headed" ? "chrome" : undefined,
    viewport: fp.viewport,
    locale: fp.locale,
    timezoneId: fp.tz,
    // Override the UA on headless so it doesn't advertise "HeadlessChrome"; headed real Chrome is fine.
    userAgent: tier === "stealth" ? fp.ua : undefined,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      ...(tier === "headed"
        ? ["--start-maximized"]
        : ["--disable-setuid-sandbox", "--disable-dev-shm-usage"]),
    ],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  browserByKey.set(key, { ctx, page });
  return page;
}

// Light human-like activity — mouse drift + scrolling. Anti-bot scoring (DataDome, PerimeterX) weighs
// behavioral signals heavily; a page that loads with zero interaction reads as a bot. Best-effort.
async function humanize(page: Page): Promise<void> {
  try {
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(
        150 + Math.random() * 1000,
        120 + Math.random() * 600,
        { steps: 8 },
      );
      await page.waitForTimeout(140 + Math.random() * 200);
    }
    await page.mouse.wheel(0, 500 + Math.random() * 600);
    await page.waitForTimeout(450 + Math.random() * 400);
    await page.mouse.wheel(0, 400 + Math.random() * 600);
    await page.waitForTimeout(350);
  } catch {
    /* mouse/scroll best-effort */
  }
}

async function fetchViaBrowser(
  url: string,
  host: string,
  tier: "stealth" | "headed",
): Promise<string> {
  const page = await browserPageFor(host, tier);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 40_000 });
  // Poll until the anti-bot JS challenge actually clears, rather than guessing a fixed sleep — a short
  // settle would snapshot the "Just a moment" page and wrongly escalate. Cap the wait so a truly
  // unbeatable wall still gives up. A quick first settle covers fast-rendering SPAs.
  await page.waitForTimeout(2500);
  await humanize(page); // behavioral signal to lower the bot score before we judge the page
  let html = await page.content();
  const deadline = Date.now() + (tier === "headed" ? 13_000 : 9000);
  while (isBlocked(html, 200) && Date.now() < deadline) {
    await page.waitForTimeout(1500);
    html = await page.content();
  }
  return html;
}

export interface SmartFetchOptions {
  // Optional content check. A tier's HTML must be (a) not a block page AND (b) pass validate() to count
  // as solved. Lets the ladder climb past a non-blocked-but-empty SPA shell (static 200 with no data)
  // to the tier that actually renders the listings. Without it, "not blocked" alone counts as success.
  validate?: (html: string) => boolean;
}

/**
 * Fetch a URL through the cheapest tool that beats the host's defenses, learning + reusing per host.
 * Never throws on a wall — returns { blocked: true, html: "" } so callers degrade gracefully.
 */
export async function smartFetch(
  url: string,
  opts: SmartFetchOptions = {},
): Promise<SmartFetchResult> {
  const host = hostOf(url);

  // Parked on cooldown after a full block — skip without touching the IP again.
  const cooldown = hostCooldownUntil.get(host);
  if (cooldown && cooldown > Date.now())
    return { html: "", tier: "static", blocked: true };

  // Pace same-host requests (with jitter) so this IP never bursts a host.
  const last = hostLastFetch.get(host);
  if (last) {
    const spacing = MIN_HOST_SPACING_MS + Math.random() * MIN_HOST_SPACING_MS;
    const wait = spacing - (Date.now() - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  hostLastFetch.set(host, Date.now());

  const learned = hostWinner.get(host);

  // Work queue of tiers to try: the learned winner first, then climb the rest of the ladder. The detector
  // can REORDER this mid-flight — on a recognized wall it promotes the verified-working tool to the front
  // (skipping tools known not to beat it) instead of blindly probing each rung. Fallbacks stay queued.
  // The full arsenal to draw on for this host: learned winner → in-house ladder → FlareSolverr reserve.
  const queue = buildTierQueue(learned);
  const tried = new Set<FetchTier>();

  let lastTier: FetchTier = "static";
  let sawBlock = false;
  // A tier that wasn't blocked but didn't validate — likely a genuinely empty page (e.g. last page of
  // pagination). Kept so we can return it cleanly instead of falsely flagging the host as walled.
  let cleanEmpty: { html: string; tier: FetchTier } | null = null;

  while (queue.length) {
    const tier = queue.shift()!;
    if (tried.has(tier)) continue;
    if (tier === "headed" && !HEADED_AVAILABLE) {
      tried.add(tier);
      continue;
    }
    tried.add(tier);
    lastTier = tier;
    try {
      let html: string;
      let status = 200;
      let headers: Record<string, string> | undefined;
      if (tier === "static") {
        const r = await fetchStatic(url);
        html = r.html;
        status = r.status;
        headers = r.headers;
      } else if (tier === "flaresolverr") {
        html = await fetchViaFlareSolverr(url);
      } else {
        html = await fetchViaBrowser(url, host, tier);
      }
      if (isBlocked(html, status)) {
        sawBlock = true;
        // Identify the wall and act on it — the chameleon's situational awareness.
        const { vendor, tier: bypass } = recommendedTier(html, status, headers);
        if (vendor !== "none") hostAntiBot.set(host, vendor);
        // Walls with NO free bypass (DataDome, Kasada): stop here — climbing only burns the IP, and even
        // FlareSolverr can't solve them. Drop the reserve too, cool down, let an aggregator carry it.
        if (vendor === "datadome" || vendor === "kasada") {
          console.warn(
            `[smartFetch] ${host} → ${vendor} wall (no free bypass) — not escalating`,
          );
          break;
        }
        // Known wall with a verified free tool: promote it to the front of the queue (keep the rest as
        // fallback in case detection is wrong or the challenge is tougher than expected).
        if (bypass && bypass !== tier && !tried.has(bypass)) {
          const i = queue.indexOf(bypass);
          if (i >= 0) queue.splice(i, 1);
          queue.unshift(bypass);
          console.log(
            `[smartFetch] ${host} → ${vendor} detected; jumping to "${bypass}"`,
          );
        }
        continue; // climb (now possibly reordered)
      }
      // Not blocked. Does it actually carry what the caller needs?
      if (!opts.validate || opts.validate(html)) {
        if (hostWinner.get(host) !== tier) {
          hostWinner.set(host, tier);
          console.log(`[smartFetch] ${host} → solved via "${tier}"`);
        }
        return { html, tier, blocked: false };
      }
      // The already-learned tier returning a clean-but-empty page = genuine end of data, not a wall.
      if (tier === learned) return { html, tier, blocked: false };
      if (!cleanEmpty) cleanEmpty = { html, tier };
    } catch (e) {
      console.warn(
        `[smartFetch] ${tier} errored for ${host}: ${(e as Error).message}`,
      );
    }
  }

  // A clean (non-blocked) page that NO tier could extract the wanted data from — even after the full
  // arsenal. Not a wall, but not a success either: flag it `unverified` so the caller is AWARE the data
  // didn't materialize instead of silently treating an empty page as "done."
  if (cleanEmpty) {
    if (opts.validate)
      console.warn(
        `[smartFetch] ${host} → reached via "${cleanEmpty.tier}" but data didn't validate (full arsenal exhausted)`,
      );
    return {
      html: cleanEmpty.html,
      tier: cleanEmpty.tier,
      blocked: false,
      unverified: !!opts.validate,
    };
  }

  // Every tier was actually blocked — park the host on cooldown so we stop hammering (and flagging) the
  // IP. The rest of this run's pages for this host short-circuit; a fresh worker/IP can still get it.
  if (sawBlock) {
    hostCooldownUntil.set(host, Date.now() + COOLDOWN_MS);
    console.warn(
      `[smartFetch] ${host} → no tier passed; cooling down ${COOLDOWN_MS / 60000}m`,
    );
  }
  return { html: "", tier: lastTier, blocked: true };
}

/** Tear down every warm browser. Call once at the end of a scrape run. */
export async function closeSmartFetch(): Promise<void> {
  for (const { ctx } of Array.from(browserByKey.values())) {
    await ctx.close().catch(() => {});
  }
  browserByKey.clear();
}

/** Introspection for the status surface — which tool each host is solved by, the anti-bot wall the
 *  detector identified per host, and any active cooldowns. */
export function getHostTierMap(): {
  solved: Record<string, FetchTier>;
  walls: Record<string, AntiBotVendor>;
  cooling: string[];
} {
  const now = Date.now();
  return {
    solved: Object.fromEntries(Array.from(hostWinner.entries())),
    walls: Object.fromEntries(Array.from(hostAntiBot.entries())),
    cooling: Array.from(hostCooldownUntil.entries())
      .filter(([, until]) => until > now)
      .map(([host]) => host),
  };
}
