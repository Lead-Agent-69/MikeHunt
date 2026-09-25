import { generateObject } from 'ai';
import { z } from 'zod';
import { defaultModel } from '../ai/config';
import { queueForAIParsing } from '../ai/queue';
import { AdaptiveEngine } from './adaptive-engine';
import { HumanBehavior } from './tools/human-behavior';

const VdpLinksSchema = z.object({
  vdpUrls: z.array(z.string()).describe('A list of URLs that point to individual vehicle detail pages (VDPs)'),
});

const VDP_PATH_PATTERNS = [
  /\/vdp\//i,
  /\/vehicle[-_]details?\//i,
  /\/inventory\/[\w-]+\/(?:\d{4}-)?[a-z]+/i,
  /\/(?:\d{4})?[-]?[a-z]+[-]?[a-z0-9]+[-]\w+[-]\w+/i,
  /\/vin\//i,
  /\/(?:new|used|certified)\/(?:\d{4}-)?[a-z0-9-]+/i,
];

const EXCLUDE_PATTERNS = [
  /\?page=\d+/i,
  /pagination/i,
  /contact/i,
  /privacy/i,
  /financing/i,
  /about/i,
  /service/i,
  /parts/i,
  /specials/i,
  /blog/i,
  /\/(inventory|vehicles)\/?$/i,
];

function looksLikeVdp(url: string): boolean {
  if (EXCLUDE_PATTERNS.some(p => p.test(url))) return false;
  return VDP_PATH_PATTERNS.some(p => p.test(url)) || /\b[A-HJ-NPR-Z0-9]{17}\b/i.test(url);
}

function deterministicVdpFilter(links: string[]): string[] {
  return Array.from(new Set(links.filter(looksLikeVdp)));
}

function extractLinksFromHtml(html: string): string[] {
  const matches = html.match(/href="([^"]+)"/g) || [];
  return Array.from(new Set(
    matches
      .map(m => m.replace('href="', '').replace('"', ''))
      .filter(href => href.startsWith('http'))
  ));
}

async function aiVdpFilter(links: string[]): Promise<string[]> {
  if (links.length === 0) return [];

  const { object } = await generateObject({
    model: defaultModel,
    schema: VdpLinksSchema,
    prompt: `
      I have a car dealer's inventory page. Identify which URLs are specific Vehicle Detail Pages (VDPs) for individual cars.
      A VDP URL usually contains: year, make, model, VIN (17 chars), or words like /vdp/, /vehicle-details/, /inventory/.
      Exclude: pagination, contact, privacy, financing, about, service, parts, blog, generic inventory index pages.

      URLs:
      ${links.join('\n')}
    `
  });

  return object.vdpUrls;
}

/**
 * Intelligent crawler that uses the adaptive engine (static first, browser fallback)
 * and deterministic VDP detection before invoking AI. Reduces AI cost by 60-90%.
 */
export async function crawlInventoryAndQueueVDPs(inventoryUrl: string, dealerId?: string) {
  console.log(`[AI Crawler] Navigating to inventory page: ${inventoryUrl}`);

  const engine = new AdaptiveEngine({ maxBrowserPages: 1 });
  const behavior = new HumanBehavior();

  try {
    const { html, page, close } = await engine.fetch(inventoryUrl, {
      name: 'ai-crawler',
      baseUrl: inventoryUrl,
      renderMode: 'adaptive',
      requestDelay: 0,
      concurrency: 1,
      useProxies: true,
      stealth: true,
      maxPages: 1,
    });

    if (page) {
      await behavior.waitAfterLoad(page, 2000);
      await behavior.scroll(page, 800);
      await behavior.waitAfterLoad(page, 1000);
    }

    const links: string[] = page
      ? await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href]'));
          return Array.from(new Set(anchors.map(a => (a as HTMLAnchorElement).href))).filter(href => href.startsWith('http'));
        })
      : extractLinksFromHtml(html);

    await close();

    console.log(`[AI Crawler] Found ${links.length} unique links. Detecting VDPs...`);

    let vdpUrls = deterministicVdpFilter(links);
    console.log(`[AI Crawler] Deterministic filter found ${vdpUrls.length} VDPs.`);

    // Only ask AI if deterministic filter is weak or ambiguous
    if (vdpUrls.length === 0 || vdpUrls.length / links.length < 0.05) {
      vdpUrls = await aiVdpFilter(links);
      console.log(`[AI Crawler] AI filter found ${vdpUrls.length} VDPs.`);
    }

    let queuedCount = 0;
    for (const vdpUrl of vdpUrls) {
      await queueForAIParsing(vdpUrl, dealerId, 'independent_dealer');
      console.log(`[AI Crawler] Queued VDP: ${vdpUrl}`);
      queuedCount++;
    }

    await engine.close();
    return queuedCount;
  } catch (error) {
    await engine.close();
    console.error(`[AI Crawler] Failed to crawl inventory:`, error);
    throw error;
  }
}
