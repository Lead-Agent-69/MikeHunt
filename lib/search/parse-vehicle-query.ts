// Deterministic natural-language search parser for /scan ("ford f-150 under 15k in TX 2015+").
// Free and keyless: no model call, nothing invented. Only values literally present in the query
// come back.

import {
  extractMake,
  extractModel,
} from "@/lib/scrapers/tools/deal-normalizer";
import { US_STATES } from "@/lib/geo/us-states";

export interface ParsedVehicleQuery {
  make?: string;
  model?: string;
  minYear?: string;
  maxPrice?: string;
  state?: string;
}

const MAX_QUERY_LENGTH = 200;
const MODEL_STOPWORDS = new Set([
  "under",
  "below",
  "less",
  "max",
  "in",
  "for",
  "near",
  "with",
  "and",
  "or",
  "up",
  "around",
  "from",
  "salvage",
  "clean",
  "title",
  "cheap",
]);

const STATE_NAMES = Object.entries(US_STATES)
  .map(([code, [name]]) => [code, String(name).toLowerCase()] as const)
  .sort((a, b) => b[1].length - a[1].length);

function money(raw: string, k?: string): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  const value = k ? n * 1000 : n;
  return value >= 500 && value <= 500_000 ? Math.round(value) : undefined;
}

function parseMaxPrice(q: string): number | undefined {
  const cue = q.match(
    /\b(?:under|below|less than|max(?:imum)?|up to|budget|<)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i,
  );
  if (cue) return money(cue[1], cue[2]);
  const dollars = q.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i);
  if (dollars) return money(dollars[1], dollars[2]);
  const thousands = q.match(/\b(\d{1,3}(?:\.\d+)?)\s*k\b(?!\s*(?:mi|miles))/i);
  if (thousands) return money(thousands[1], "k");
  return undefined;
}

function parseMinYear(q: string): number | undefined {
  const match = q.match(/\b((?:19|20)\d{2})\b/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const max = new Date().getFullYear() + 1;
  return year >= 1950 && year <= max ? year : undefined;
}

function parseState(q: string): string | undefined {
  // Upper-case two-letter codes anywhere ("TX"), or any case after "in" ("in tx").
  // Bare lower-case "in"/"or"/"me"/"ok" are words, not states.
  const upper = q.match(/\b([A-Z]{2})\b/g) || [];
  for (const token of upper) if (US_STATES[token]) return token;
  const afterIn = q.match(/\bin\s+([a-z]{2})\b/i);
  if (afterIn && US_STATES[afterIn[1].toUpperCase()])
    return afterIn[1].toUpperCase();
  const lower = ` ${q.toLowerCase()} `;
  for (const [code, name] of STATE_NAMES) {
    if (lower.includes(` ${name} `)) return code;
  }
  return undefined;
}

export function parseVehicleQuery(input: string): ParsedVehicleQuery {
  const q = String(input || "")
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  if (!q) return {};
  const out: ParsedVehicleQuery = {};

  const make = extractMake(q);
  if (make) {
    out.make = make;
    // Aliases ("chevy" → Chevrolet): swap the alias token for the canonical make so the
    // model after it is still found.
    const aliasToken = q
      .split(/\s+/)
      .find((token) => extractMake(token) === make);
    const modelSource =
      aliasToken && !new RegExp(make, "i").test(q)
        ? q.replace(aliasToken, make)
        : q;
    const model = extractModel(modelSource, make);
    if (
      model &&
      !MODEL_STOPWORDS.has(model.toLowerCase()) &&
      !/^(19|20)\d{2}$/.test(model) &&
      !/^\$?\d[\d,]*k?$/i.test(model)
    ) {
      out.model = model;
    }
  }

  const minYear = parseMinYear(q);
  if (minYear) out.minYear = String(minYear);

  // Ignore the year token when looking for a price.
  const maxPrice = parseMaxPrice(minYear ? q.replace(String(minYear), " ") : q);
  if (maxPrice) out.maxPrice = String(maxPrice);

  const state = parseState(q);
  if (state) out.state = state;

  return out;
}
