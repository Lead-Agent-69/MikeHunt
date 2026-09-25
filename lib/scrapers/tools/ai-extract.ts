// lib/scrapers/tools/ai-extract.ts
// AI-assisted extraction — the rescue layer for the scraper redesign. When a source's CSS selectors
// yield nothing (site changed, unexpected layout, partial render), we hand the cleaned page text to
// an LLM and ask it to pull structured vehicles. This keeps coverage up as sites drift, WITHOUT
// fabricating data: the model is told to extract only what's literally present and return [] otherwise.
//
// COST-GATED by design: only call this as a FALLBACK after deterministic parsing fails, and only when
// a provider key is configured. Each call is one cheap gpt-4o-mini/gemini-flash request over a
// truncated page. Set AI_SCRAPE_EXTRACT=off to hard-disable.

import { generateText } from "ai";
import { getTextModel, hasTextModel } from "@/lib/ai/text-model";
import { fitText } from "./content-clean";
import {
  extractJsonLd,
  extractEmbeddedJson,
  firstNonEmpty,
  type StructuredItem,
} from "./structured-extract";

export interface ExtractedVehicle {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  price?: number;
  mileage?: number;
  vin?: string;
  title?: string;
  url?: string;
  location_city?: string;
  location_state?: string;
  condition?: string;
}

export function aiExtractEnabled(): boolean {
  return process.env.AI_SCRAPE_EXTRACT !== "off" && hasTextModel();
}

// Strip a page down to the LISTING content before spending LLM tokens on it. First pass: fitText (our
// Crawl4AI PruningContentFilter port) drops nav / footer / ads / boilerplate by DOM scoring, so the token
// budget goes to actual vehicles, not chrome — denser input = cheaper + better extraction. Falls back to a
// plain tag-strip if the pruner over-trims a one-big-div page.
function cleanPage(html: string, maxChars = 14000): string {
  const tagStrip = (h: string) =>
    h
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  let text = "";
  try {
    text = fitText(html);
  } catch {
    /* fall through to tag-strip */
  }
  if (text.length < 200) text = tagStrip(html); // pruner under-yielded → use the raw text
  return text.slice(0, maxChars);
}

function coerce(v: any): ExtractedVehicle[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x) => x && (x.make || x.model || x.title))
    .map((x) => ({
      year: x.year ? Number(x.year) : undefined,
      make: x.make || undefined,
      model: x.model || undefined,
      trim: x.trim || undefined,
      price:
        x.price != null
          ? Number(String(x.price).replace(/[^0-9.]/g, "")) || undefined
          : undefined,
      mileage:
        x.mileage != null
          ? Number(String(x.mileage).replace(/[^0-9]/g, "")) || undefined
          : undefined,
      vin: x.vin || undefined,
      title: x.title || undefined,
      url: x.url || undefined,
      location_city: x.location_city || x.city || undefined,
      location_state: x.location_state || x.state || undefined,
      condition: x.condition || undefined,
    }));
}

/**
 * Extract vehicle listings from a raw HTML page using the LLM. Returns [] on any failure or when no
 * provider is configured — never throws into the scraper. Best used as a fallback after selectors fail.
 */
const toVehicle = (i: StructuredItem): ExtractedVehicle => ({
  year: i.year,
  make: i.make,
  model: i.model,
  trim: i.trim,
  price: i.price,
  mileage: i.mileage,
  vin: i.vin,
  title: i.title,
  url: i.url,
});

// The extraction fallback LADDER. Cheap + markup-change-proof structured data first (JSON-LD → framework
// hydration blob), the LLM only as the last resort — so a site redesign that breaks a source's CSS
// selectors self-heals for free, and we spend LLM tokens only when the page carries no structured data.
export async function aiExtractVehicles(
  html: string,
  sourceUrl?: string,
): Promise<ExtractedVehicle[]> {
  if (!html) return [];
  return firstNonEmpty<ExtractedVehicle>([
    {
      name: "json-ld",
      run: () =>
        extractJsonLd(html)
          .filter((i) => i.make || i.vin)
          .map(toVehicle),
    },
    {
      name: "embedded-json",
      run: () =>
        extractEmbeddedJson(html)
          .filter((i) => i.make || i.vin)
          .map(toVehicle),
    },
    { name: "llm", run: () => llmExtractVehicles(html, sourceUrl) },
  ]);
}

// Last-resort tier: the LLM. Returns [] when no provider is configured — never throws into the scraper.
async function llmExtractVehicles(
  html: string,
  sourceUrl?: string,
): Promise<ExtractedVehicle[]> {
  if (!aiExtractEnabled()) return [];

  const page = cleanPage(html);
  if (page.length < 200) return [];

  const prompt = `Extract used-vehicle listings from this page text. Return ONLY a JSON array (no prose, no markdown). Each item: {year, make, model, trim, price, mileage, vin, title, url, location_city, location_state, condition}. Include ONLY vehicles literally present in the text — do NOT invent or infer specs, prices, or VINs. If none are present, return [].

${sourceUrl ? `Source: ${sourceUrl}\n` : ""}PAGE TEXT:
${page}`;

  try {
    const { text } = await generateText({
      model: getTextModel(),
      prompt,
      temperature: 0,
    });
    // Be tolerant of code fences / stray prose around the JSON.
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) return [];
    const parsed = JSON.parse(text.slice(start, end + 1));
    return coerce(parsed);
  } catch {
    return [];
  }
}
