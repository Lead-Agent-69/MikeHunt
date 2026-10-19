/**
 * One parser for the small-dealer CMS family most rebuildable/salvage lots run on:
 *  - Creative Design Group (4cdg.com) sites: list pages link to `vehiclesDetail.php?<id>`
 *    (Damage.com / 74 Auto, AutoVada, Polecats, Elite Sikeston, St. James, ...).
 *  - D&G's native all-inventory grid after its October 2026 redesign.
 *  - SalvageZone's custom CMS: detail links `/inventory/salvage/<kind>/<year>/<make>/<id>`.
 *
 * Every template wraps a vehicle differently, so we don't use per-site CSS selectors. We anchor on
 * the detail link (stable across templates), take the smallest element around it that only links to
 * that one vehicle (the "card"), and read year/make/model, price, miles, title brand, stock # and
 * photo out of that card's text. Pagination is read from the page itself ("264 results",
 * "page 1 of 6", ?page=N links) so we stop under-counting (D&G showed 264, we stored 29).
 *
 * Fetching goes through politeFetch (honest UA, robots.txt, per-domain pacing, breaker). Only sites
 * whose terms were reviewed and allow it are listed here (Eli's audit, 2026-10-09).
 */
import type { CheerioAPI } from "cheerio";
import type { Deal } from "@/types";
import { isValidVin, normalizeVin } from "@/lib/vehicle/vin";
import { disclosedPriceEvidence } from "@/lib/deals/acquisition-price";

export interface DealerCmsSite {
  sourceId: string;
  name: string;
  baseUrl: string;
  /** First inventory page. */
  inventoryUrl: string;
  /** URL for page n (n ≥ 2). Default: inventoryUrl with ?page=n. */
  pageUrl?: (n: number) => string;
  city?: string;
  state: string;
  /** Unstated title stays unknown; dealer specialization is not per-vehicle evidence. */
  defaultCondition: string;
  defaultDamage?: string;
  /** Hard cap on pages (politeness). Default 15. */
  maxPages?: number;
  /** Detail-link pattern (group 1 = listing id) for sites outside the 4cdg/SalvageZone family. */
  detailPattern?: RegExp;
  /** Single-page inventory (no pagination). */
  singlePage?: boolean;
  /**
   * "cards" (default): one linked card per vehicle. "text-lines": the inventory is plain text lines
   * like "2021 Kia Forte LXS Salvage Title 47k / Front / $5,450" (Gary's Google Site).
   */
  layout?: "cards" | "text-lines" | "dg-native";
}

export const DEALER_CMS_SITES: DealerCmsSite[] = [
  {
    sourceId: "dealer-billsmithauto-com",
    name: "Bill Smith Auto",
    baseUrl: "https://www.billsmithauto.com",
    inventoryUrl: "https://www.billsmithauto.com/en/view-all-inventory.cfm",
    state: "IL",
    defaultCondition: "unknown",
    detailPattern: /\/used-[a-z0-9-]+-v(\d+)\.html(?:[?#].*)?$/i,
    maxPages: 5,
  },
  {
    sourceId: "dealer-x2builders-com",
    name: "X2 Builders",
    baseUrl: "https://x2builders.com",
    inventoryUrl: "https://x2builders.com/vehicles.asp?main=Repairables",
    city: "Pontoon Beach",
    state: "IL",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
    singlePage: true,
    detailPattern: /item\.asp\?(?:[^#]*&)?id=(\d+)(?:&|$)/i,
  },
  {
    sourceId: "damage-com",
    name: "Damage.com (74 Auto)",
    baseUrl: "https://www.damage.com",
    inventoryUrl: "https://www.damage.com/vehiclesList.php",
    city: "Sikeston",
    state: "MO",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
  },
  {
    sourceId: "dg-auto",
    name: "D&G Auto LLC",
    baseUrl: "https://dgautollc.com",
    inventoryUrl: "https://dgautollc.com/inventory/",
    layout: "dg-native",
    singlePage: true,
    city: "Poplar Bluff",
    state: "MO",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
  },
  {
    sourceId: "autovada",
    name: "AutoVada",
    baseUrl: "https://www.autovada.com",
    inventoryUrl: "https://www.autovada.com/inventory-all.php",
    city: "Cape Girardeau",
    state: "MO",
    // Mixed lot; detail enrichment can supply missing title evidence.
    defaultCondition: "unknown",
  },
  {
    sourceId: "polecats",
    name: "Polecats Auto Sales",
    baseUrl: "https://www.polecatsautosales.com",
    inventoryUrl: "https://www.polecatsautosales.com/vehicles.php",
    city: "Malden",
    state: "MO",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
  },
  {
    sourceId: "elite-sikeston",
    name: "Elite Auto Sales",
    baseUrl: "https://www.elitesikeston.com",
    inventoryUrl: "https://www.elitesikeston.com/vehicles.php",
    city: "Sikeston",
    state: "MO",
    defaultCondition: "unknown",
  },
  {
    sourceId: "stjames-auto",
    name: "St. James Auto & Truck Parts",
    baseUrl: "https://rebuilders.stjamesautoparts.com",
    inventoryUrl: "https://rebuilders.stjamesautoparts.com/vehicles.php",
    city: "Saint James",
    state: "MO",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
  },
  {
    sourceId: "salvagezone",
    name: "SalvageZone (Elite Motor Cars)",
    baseUrl: "https://www.salvagezone.com",
    inventoryUrl:
      "https://www.salvagezone.com/repairable/salvage/rebuildables/1",
    pageUrl: (n) =>
      `https://www.salvagezone.com/repairable/salvage/rebuildables/${n}`,
    state: "NY",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
  },
  // ── Terms-safe independents on their own CMSes (Eli's audit 2026-10-09: robots allows, no
  //    terms of use restricting automated access). Same card heuristics, site-specific detail link.
  {
    sourceId: "riverbend-rebuildables",
    name: "Riverbend Rebuildables",
    baseUrl: "https://www.riverbendrebuildables.com",
    inventoryUrl: "https://www.riverbendrebuildables.com/vehicles/",
    city: "New Madrid",
    state: "MO",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
    detailPattern: /^(?:https?:\/\/[^/]+)?\/((?:19|20)\d{2}-[a-z0-9-]+)\/?$/i,
    singlePage: true,
  },
  {
    sourceId: "premier-salvage",
    name: "Premier Auto Rebuilders & Truck Salvage",
    baseUrl: "https://www.premiersalvage.com",
    inventoryUrl: "https://www.premiersalvage.com/all-vehichles",
    pageUrl: (n) => `https://www.premiersalvage.com/all-vehichles?page=${n}`,
    city: "Phillipsburg",
    state: "MO",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
    detailPattern: /\/product-page\/([a-z0-9-]+)\/?$/i,
    maxPages: 4,
  },
  {
    sourceId: "garys-auto-ia",
    name: "Gary's Auto",
    baseUrl: "https://www.garysautoia.net",
    inventoryUrl: "https://www.garysautoia.net/home/repairable-cars",
    city: "Troy Mills",
    state: "IA",
    defaultCondition: "unknown",
    defaultDamage: "repairable",
    detailPattern: /\/home\/repairable-cars\/([a-z0-9-]+)\/?$/i,
    singlePage: true,
    layout: "text-lines",
  },
];

const DETAIL_PATTERNS: RegExp[] = [
  /vehiclesDetail\.php\?(?:ID=)?(\d+)/i,
  /\/inventory\/salvage\/[^/]+\/\d{4}\/[^/]+\/(\d+)\/?$/i,
];

export function detailIdFromHref(
  href: string | undefined,
  patterns: RegExp[] = DETAIL_PATTERNS,
): string | null {
  if (!href) return null;
  for (const re of patterns) {
    const m = href.match(re);
    if (m) return m[1];
  }
  return null;
}

const clean = (v: unknown) =>
  String(v ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Pending paperwork and parts-only status must not become road-ready rebuilt stock. */
export function titleBrand(text: string): string | undefined {
  const x = text.toLowerCase();
  if (
    /\b(?:parts[ -]only|non[ -]?repairable|certificate of destruction|junk title)\b/.test(
      x,
    )
  )
    return "parts_only";
  if (
    /\b(?:waiting (?:on|for)|pending|awaiting|applied for)\b.{0,40}\b(?:rebuilt|title)\b|\brebuilt title\b.{0,20}\bpending\b/.test(
      x,
    )
  )
    return "unknown";
  if (/prior[\s-]?salvage|reconstruct/.test(x)) return "rebuilt_title";
  if (/\brebuilt\b/.test(x)) return "rebuilt_title";
  if (/\bsalvage\b/.test(x)) return "salvage_title";
  if (
    /^(?:clean|clear)$|\|\s*(?:clean|clear)\s*\||\b(?:clean|clear)\s+(?:title|tl)\b|\btitle\s*:?\s*(?:clean|clear)\b/.test(
      x.trim(),
    )
  )
    return "clean_title";
  return undefined;
}

const ACRONYM_MAKES = new Set(["GMC", "BMW", "VW", "AMC", "MG"]);
const MAX_YEAR = new Date().getFullYear() + 1;

export function parsePrice(text: string): number | undefined {
  const ok = (raw: string) => {
    const n = Number(raw.replace(/,/g, ""));
    if (!(n >= 100 && n < 2_000_000)) return undefined;
    const evidence = disclosedPriceEvidence(text, n);
    if (evidence && evidence.kind !== "asking") return undefined;
    if (evidence?.kind === "asking" && evidence.askingPrice !== n)
      return undefined;
    return n;
  };
  // Seller transaction prices outrank savings, payments and reference retail values.
  // DriveNation prints "Savings" first, then "All In Price", then "Retail".
  for (const label of [
    /\ball[\s-]+in\s+price\s*:?\s*\$\s*([\d,]{3,})/i,
    /\b(?:sale|our|cash|internet|special|asking|selling|pre-owned)\s+price\s*:?\s*\$\s*([\d,]{3,})/i,
  ]) {
    const labelled = text.match(label);
    if (labelled) {
      const start = labelled.index || 0;
      const before = text.slice(Math.max(0, start - 60), start);
      const after = text.slice(
        start + labelled[0].length,
        start + labelled[0].length + 35,
      );
      if (
        /\b(?:monthly|down\s+payment|(?:savings|discount|rebate)\s+(?:off|on|from))\s*$/i.test(
          before,
        ) ||
        /^\s*(?:down\b|\/\s*mo(?:nth)?\b|per\s+month\b|a\s+month\b|monthly\b)/i.test(
          after,
        )
      )
        continue;
      if (ok(labelled[1])) return ok(labelled[1]);
    }
  }
  const re = /\$\s*([\d,]{3,})(?:\.\d{2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    const after = text.slice(re.lastIndex, re.lastIndex + 12);
    if (
      /(?:payment(?:\s+amount)?\s*:?|down\s+payment\s*:?|down\s*:|per month\s*:?|(?:savings|you\s+save|save|discount|rebate|MSRP|retail(?:\s+(?:price|value))?|was|original\s+price)\s*:?)\s*$/i.test(
        before,
      )
    )
      continue;
    if (
      /^\s*(?:(?:\/|per\s)\s*(?:mo|month|wk|week)|down\b|bi-?weekly|weekly|monthly|savings\b|off\b)/i.test(
        after,
      )
    )
      continue;
    const n = ok(m[1]);
    if (n) return n;
  }
  return undefined;
}

export function parseMiles(raw: string): number | undefined {
  const ok = (n: number) => (n > 0 && n < 1_000_000 ? n : undefined);
  // Dollar amounts never read as miles ("$9,300 Miles: 41,200" read 9,300).
  const text = raw.replace(/\$\s*[\d,]+(?:\.\d{2})?/g, " ");
  // Labelled form first ("Miles: 83,698"), then "83,698 miles". The number must stand alone, so the
  // trailing 4 of "Big Horn 2500 4x4 Miles: …" is never read as the odometer.
  const m =
    text.match(/\b(?:mileage|odometer|miles)\s*:\s*([\d,]{1,9})\b/i) ||
    text.match(/(?<![\w.,])([\d,]{1,9})\s*(?:mi\b|mi\.|miles\b)/i) ||
    text.match(/\b(?:mileage|odometer)\s*:?\s*([\d,]{1,9})\b/i);
  if (m) return ok(Number(m[1].replace(/,/g, "")));
  // "47k / Front / $5,450" (Gary's)
  const k = text.match(/\b(\d{1,3})\s*k\b(?=\s*(?:\/|miles|mi\b))/i);
  return k ? ok(Number(k[1]) * 1000) : undefined;
}

/** Split "2018 Chevrolet Silverado Crew 4x4 LT" into parts. Year must be plausible. */
export function splitTitle(title: string) {
  const m = title.match(/\b(19[5-9]\d|20\d{2})\b\s+([A-Za-z][\w-]*)\s*(.*)$/);
  if (!m) return { year: undefined, make: undefined, model: undefined };
  const year = Number(m[1]);
  const make = m[2];
  const model = clean(m[3]).split(" ").slice(0, 3).join(" ") || undefined;
  return {
    year: year <= MAX_YEAR ? year : undefined,
    make: ACRONYM_MAKES.has(make.toUpperCase())
      ? make.toUpperCase()
      : make[0].toUpperCase() + make.slice(1).toLowerCase(),
    model,
  };
}

/** "2018 Chevrolet Chevrolet Silverado" → "2018 Chevrolet Silverado" (Polecats repeats the make). */
function dedupeWords(s: string) {
  const out: string[] = [];
  for (const w of s.split(" ")) {
    if (out.length && out[out.length - 1].toLowerCase() === w.toLowerCase())
      continue;
    out.push(w);
  }
  return out.join(" ");
}

/** "SOLD" / "On Hold" badges. "Sold as-is" in a description is not a sold badge. */
const SOLD_RE =
  /\bsold\b(?!\s+as[\s-]?is)|\bon hold\b|\bsale pending\b|\(\s*pending\s*\)/i;

/** Card text without long description blurbs, so badges are read but sales copy isn't. */
function badgeText($: CheerioAPI, card: any) {
  const copy = card.clone();
  copy.find("p, [class*=desc], .text-line-2").each((_: number, el: any) => {
    if (clean($(el).text()).length > 60) $(el).remove();
  });
  return spacedText($, copy);
}

const NOISE =
  /run\s*&\s*drive|view details|leave deposit|elite price|price:|\$[\d,]+/gi;

export interface ParsedCard {
  id: string;
  url: string;
  title: string;
  year?: number;
  make?: string;
  model?: string;
  price?: number;
  mileage?: number;
  condition?: string;
  damage?: string;
  stock?: string;
  vin?: string;
  image?: string;
  sold: boolean;
}

export interface ParsedPage {
  cards: ParsedCard[];
  /** "264 results" / "Viewing 254 Results" when the page says so. */
  total: number | null;
  /** "page 1 of 6", or the highest page number linked. */
  lastPage: number | null;
  /** Explicit same-host continuation; preserves vendor-specific query/cursor parameters. */
  nextUrl?: string;
}

/** D&G's October 2026 redesign publishes its entire inventory as native cards. */
export function parseDgInventory($: CheerioAPI, pageUrl: string) {
  const cards: ParsedCard[] = [];
  const seen = new Set<string>();
  const inventory = $("[data-inv-grid] a.card[href]");
  let excluded = 0;
  let duplicates = 0;
  inventory.each((_, el) => {
    const card = $(el);
    if (card.attr("data-type") === "recreational") {
      excluded++;
      return;
    }
    const url = abs(card.attr("href")!, pageUrl);
    if (!isSameSiteHref(url, pageUrl)) return;
    const path = new URL(url).pathname;
    const rawVin = path.match(/-([a-hj-npr-z0-9]{17})(?:-|\/)/i)?.[1];
    const vin = rawVin && isValidVin(rawVin) ? normalizeVin(rawVin) : undefined;
    // A VIN is stable when the dealer edits the descriptive slug.
    const id = vin?.toLowerCase() || path.replace(/^\/+|\/+$/g, "");
    if (!id) return;
    if (seen.has(id)) {
      duplicates++;
      return;
    }
    seen.add(id);
    const title = clean(card.find("img[alt]").first().attr("alt"));
    const parts = splitTitle(title);
    const text = spacedText($, card);
    const price = parsePrice(text);
    const declaredPrice = Number(card.attr("data-price"));
    const validPrice =
      price !== undefined && price === declaredPrice ? price : undefined;
    const miles = card.attr("data-miles");
    const mileage = miles && /^\d+$/.test(miles) ? Number(miles) : undefined;
    const image = card.find("img[src]").first().attr("src");
    if (
      !parts.year ||
      !parts.model ||
      String(parts.year) !== card.attr("data-year") ||
      parts.make?.toLowerCase() !== card.attr("data-make")?.toLowerCase()
    )
      return;
    cards.push({
      id,
      url,
      title,
      ...parts,
      vin,
      price: validPrice,
      mileage:
        mileage !== undefined && mileage < 1_000_000 ? mileage : undefined,
      condition: titleBrand(card.attr("data-title") || ""),
      damage: clean(card.attr("data-damage")) || undefined,
      stock: text.match(/#\s*([A-Z0-9-]+)/i)?.[1],
      image: image ? abs(image, pageUrl) : undefined,
      sold: SOLD_RE.test(badgeText($, card)),
    });
  });
  const count = clean($("[data-inv-count]").first().text()).match(
    /\bof\s+([\d,]+)\s+vehicles\b/i,
  );
  return {
    cards,
    observed: inventory.length,
    excluded,
    duplicates,
    total: count ? Number(count[1].replace(/,/g, "")) : null,
    lastPage: 1,
  };
}

function abs(href: string, base: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Element text with a space at every tag boundary (cheerio's .text() glues "#139282A</p><span>Run"). */
function spacedText($: CheerioAPI, el: any): string {
  const html = $(el).html() ?? "";
  const stripped = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return clean($("<div>").html(stripped).text());
}

function cardPhoto($: CheerioAPI, card: any, pageUrl: string) {
  let photo: string | undefined;
  card.find("img").each((_: number, node: any) => {
    if (photo) return;
    const image = $(node);
    for (const raw of [
      image.attr("data-src"),
      image.attr("data-original"),
      image.attr("src"),
    ]) {
      if (!raw || /^(?:data:|blob:|javascript:)/i.test(raw)) continue;
      try {
        const url = new URL(raw, pageUrl);
        if (!/^https?:$/.test(url.protocol)) continue;
        // Status artwork and lazy placeholders are not vehicle photos.
        if (
          /(?:^|[\/_.-])(?:sold|pending|logo|placeholder|no[-_]?image|no[-_]?photo|loading|spacer)(?:[\/_.-]|$)/i.test(
            url.pathname,
          )
        )
          continue;
        photo = url.toString();
        break;
      } catch {
        /* Ignore malformed image URLs. */
      }
    }
  });
  return photo;
}

function nextListingPage($: CheerioAPI, pageUrl: string) {
  const links = $(
    'a[rel~="next"], .pagination a.next, .pagination .next a, a[aria-label="Next"]',
  );
  for (const node of links.toArray()) {
    const link = $(node);
    if (link.closest('.disabled, [aria-disabled="true"]').length) continue;
    const href = link.attr("href")?.trim();
    if (!href || /^(?:#|javascript:|mailto:|tel:|data:)/i.test(href)) continue;
    try {
      const url = new URL(href, pageUrl);
      url.hash = "";
      if (url.origin === new URL(pageUrl).origin && url.toString() !== pageUrl)
        return url.toString();
    } catch {
      /* Malformed pagination cannot expand a crawl. */
    }
  }
  return undefined;
}

/** The smallest ancestor of `link` whose detail links all point to `id`. */
function cardFor($: CheerioAPI, link: any, id: string, patterns: RegExp[]) {
  let node = $(link);
  let best = node;
  for (let depth = 0; depth < 8; depth++) {
    const parent = node.parent();
    if (!parent.length || parent.is("body")) break;
    const ids = new Set<string>();
    parent.find("a[href]").each((_, a) => {
      const other = detailIdFromHref($(a).attr("href"), patterns);
      if (other) ids.add(other);
    });
    if (ids.size > 1 || (ids.size === 1 && !ids.has(id))) break;
    best = parent;
    node = parent;
  }
  return best;
}

export function parseListingPage(
  $: CheerioAPI,
  pageUrl: string,
  patterns: RegExp[] = DETAIL_PATTERNS,
): ParsedPage {
  const seen = new Set<string>();
  const cards: ParsedCard[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    const id = detailIdFromHref(href, patterns);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const card = cardFor($, a, id, patterns);
    const text = spacedText($, card);

    const headings = card
      .find("h1,h2,h3,h4,h5,h6,.title,.car-year-parts,strong")
      .map((_, h) => spacedText($, h))
      .get()
      .filter((t) => t && !/^\$|^run\s*&\s*drive$/i.test(t));
    // Nested headings (h4 > strong) repeat text; keep distinct, in order.
    const uniq: string[] = [];
    for (const h of headings)
      if (!uniq.some((u) => u.includes(h))) uniq.push(h);
    // Spec labels printed as headings/<strong> ("Mileage:", "Stock No.:", "124K Miles", "Features",
    // "Pre-Owned Price") are not part of the title (VehiclesNETWORK cards).
    const titleParts = uniq.filter(
      (h) =>
        !/:\s*$/.test(h) &&
        !/^[\d,.]+\s*k?\s*miles$/i.test(h) &&
        !/^(?:features|photos?|\d+\s+photos|pre-owned|certified)$/i.test(h) &&
        // "Pre-Owned Special Price", "Documentation Fee", "Total Price" price-box labels
        !(/\b(?:price|fee)\b/i.test(h) && !/^(?:19[5-9]\d|20\d{2})\s/.test(h)),
    );
    let title = dedupeWords(clean(titleParts.join(" ").replace(NOISE, " ")));
    if (!/\b(19|20)\d{2}\b/.test(title)) {
      const year = text.match(/\b(19[5-9]\d|20\d{2})\b/)?.[1];
      if (year) title = `${year} ${title}`;
    }
    if (!/[a-z]{2}/i.test(title.replace(/\b(19|20)\d{2}\b/, ""))) {
      // No usable heading (Wix product grids): take "YYYY Make Model" from the card text, else
      // from the detail slug ("/product-page/2017-ram-1500-4x4").
      const fromText = text.match(
        /\b((?:19[5-9]\d|20\d{2})\s+[A-Za-z][\w/.-]*(?:\s+[\w/.-]+){0,5}?)(?=\s+(?:price|\$|mileage|title\b)|\s*$)/i,
      )?.[1];
      const slugTitle = (href || "")
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replace(/^[a-z]?\d{5,}-/i, "")
        .replace(/-\d+$/, "")
        .replace(/-/g, " ");
      title = clean(fromText || slugTitle || $(a).text());
    }

    let mileage = parseMiles(text);
    if (!mileage) {
      const iconLi = card
        .find(
          "i[class*=tachometer], i[class*=speedometer], i[class*=road], span[class*=tachometer]",
        )
        .first()
        .parent();
      const digits = clean(iconLi.text()).replace(/[^\d]/g, "");
      const n = Number(digits);
      if (n > 0 && n < 1_000_000) mileage = n;
    }
    const stock =
      text.match(/(?:stock\s*#|#:?)\s*([A-Z0-9][A-Z0-9-]{2,})/i)?.[1] ??
      undefined;
    const image = cardPhoto($, card, pageUrl);
    const rawVin = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0];
    const vin = rawVin && isValidVin(rawVin) ? normalizeVin(rawVin) : undefined;
    let parts = splitTitle(title);
    if (parts.year && !parts.model) {
      // "2025 Kia" heading with the model on its own line below (<p>K5 GT Line</p>, 4cdg featured grid).
      const sub = card
        .find("p, .model, [class*=subtitle]")
        .map((_, el) => clean($(el).text()))
        .get()
        .find(
          (t) =>
            t.length >= 2 &&
            t.length <= 40 &&
            /[a-z]/i.test(t) &&
            !/\$|call|sale/i.test(t),
        );
      if (sub) {
        title = `${title} ${sub}`;
        parts = splitTitle(title);
      }
    }
    cards.push({
      id,
      url: abs(href!, pageUrl),
      title,
      ...parts,
      price: parsePrice(text),
      mileage,
      vin,
      condition: titleBrand(text.replace(title, " ")) ?? titleBrand(title),
      stock,
      image,
      sold: SOLD_RE.test(badgeText($, card)),
    });
  });

  const bodyText = clean($("body").text());
  const total = bodyText.match(/([\d,]+)\s+(?:results|vehicles)\b/i)?.[1];
  const pageOf = bodyText.match(/page\s+\d+\s+of\s+(\d+)/i)?.[1];
  let maxLinked = 0;
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    const n = Number(
      href.match(/[?&](?:ai_)?page=(\d+)/)?.[1] ??
        href.match(/\/rebuildables\/(\d+)\/?$/)?.[1] ??
        0,
    );
    if (n > maxLinked) maxLinked = n;
  });
  return {
    cards,
    total: total ? Number(total.replace(/,/g, "")) : null,
    lastPage: pageOf ? Number(pageOf) : maxLinked || null,
    nextUrl: nextListingPage($, pageUrl),
  };
}

/**
 * Plain-text inventories: "2021 Kia Forte LXS Salvage Title 47k / Front / $5,450". Lines are matched
 * to detail links by their year-make-model slug when the site has them.
 */
const TEXT_LINE_RE =
  /\b((?:19[5-9]\d|20\d{2})\s+[A-Za-z][^$]{1,80}?)\s+((?:salvage|rebuilt|clean|clear)(?:\s+[A-Za-z]+)?\s+title)\s+(\d{1,3})\s*k\s*\/\s*(?:([A-Za-z ]{2,30}?)\s*\/\s*)?\$\s*([\d,]{3,})/gi;

export function parseTextListing(
  $: CheerioAPI,
  pageUrl: string,
  patterns: RegExp[],
): ParsedPage {
  const links: { slug: string; url: string }[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    const id = detailIdFromHref(href, patterns);
    if (id) links.push({ slug: id.toLowerCase(), url: abs(href!, pageUrl) });
  });
  const text = spacedText($, $("body"));
  const cards: ParsedCard[] = [];
  const used = new Set<string>();
  let m: RegExpExecArray | null;
  TEXT_LINE_RE.lastIndex = 0;
  while ((m = TEXT_LINE_RE.exec(text))) {
    const title = clean(m[1]);
    const parts = splitTitle(title);
    const key = slugify(title);
    const link = links.find((l) => !used.has(l.url) && l.slug.endsWith(key));
    if (link) used.add(link.url);
    const price = Number(m[5].replace(/,/g, ""));
    const mileage = Number(m[3]) * 1000;
    cards.push({
      id: link?.slug ?? `${key}-${mileage}-${price}`,
      url: link?.url ?? pageUrl,
      title,
      ...parts,
      price: price >= 100 ? price : undefined,
      mileage,
      condition: titleBrand(m[2]),
      sold: false,
    });
  }
  return { cards, total: null, lastPage: 1 };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** How many pages to walk, from what page 1 told us. */
export function plannedPages(first: ParsedPage, maxPages = 15): number {
  const perPage = first.cards.length;
  const fromTotal =
    first.total && perPage ? Math.ceil(first.total / perPage) : 0;
  const pages = Math.max(fromTotal, first.lastPage ?? 0, 1);
  return Math.min(pages, maxPages);
}

export function pageUrlFor(site: DealerCmsSite, n: number) {
  if (n <= 1) return site.inventoryUrl;
  if (site.pageUrl) return site.pageUrl(n);
  const u = new URL(site.inventoryUrl);
  u.searchParams.set("page", String(n));
  return u.toString();
}

export function cardToDeal(
  card: ParsedCard,
  site: DealerCmsSite,
): Partial<Deal> | null {
  if (card.sold || !card.price || !card.title) return null;
  return {
    source: "independent_dealer",
    source_deal_id: `${site.sourceId}-${card.id}`,
    source_url: card.url,
    title: card.title,
    year: card.year,
    make: card.make,
    model: card.model,
    ask_price: card.price,
    ...(site.layout === "dg-native"
      ? {
          options: {
            priceEvidence: {
              kind: "asking" as const,
              askingPrice: card.price,
              evidenceText: `${site.name} inventory card price $${card.price}`,
            },
          },
        }
      : {}),
    mileage: card.mileage,
    ...(card.vin ? { vin: card.vin } : {}),
    // A site-wide title default must never pass a buyer's clean/rebuilt filter.
    condition: card.condition ?? "unknown",
    title_source: card.condition ? "listing" : "source_default",
    damage_type: site.layout === "dg-native" ? card.damage : site.defaultDamage,
    seller_type: "dealer",
    location_city: site.city,
    location_state: site.state,
    images: card.image ? [card.image] : [],
  };
}

/**
 * Website platforms the shared parser reads with no per-site config. A curated registry entry tagged
 * with one of these joins the shared parser automatically (and its state's demand ring by its state tag).
 *  - "4cdg": Creative Design Group / Smart Marketing dealer sites ("Website Designed by Creative Design
 *    Group"), list pages link to `vehiclesDetail.php?<id>`, paginate with `?page=n`.
 *  - "vehiclesnetwork": VehiclesNETWORK (apogeeINVENT) independent-dealer sites ("Powered by
 *    VehiclesNETWORK"), inventory at `/autos`, detail `autos/<year>-<make>-<model>-<city>-<st>-<id>`,
 *    paginate with `?ai_page=n`.
 */
export type DealerPlatform = "4cdg" | "vehiclesnetwork";

export const VEHICLESNETWORK_DETAIL =
  /(?:^|\/)autos\/((?:19|20)\d{2}-[A-Za-z0-9-]+-\d+)\/?(?:[?#].*)?$/i;

export function dealerCmsSiteFromCurated(site: {
  url: string;
  name: string;
  state?: string;
  city?: string;
  type: string;
  inventoryUrl?: string;
  platform?: DealerPlatform;
}): DealerCmsSite | undefined {
  if (!site.platform || !site.state) return undefined;
  let origin: string;
  let host: string;
  try {
    const u = new URL(site.url);
    origin = u.origin;
    host = u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
  const inventoryUrl = new URL(
    site.inventoryUrl ||
      (site.platform === "vehiclesnetwork" ? "/autos" : "/vehicles.php"),
    origin,
  ).toString();
  const base: DealerCmsSite = {
    sourceId: `${site.platform}-${host.replace(/[^a-z0-9]+/g, "-")}`,
    name: site.name,
    baseUrl: origin,
    inventoryUrl,
    city: site.city,
    state: site.state,
    defaultCondition: "unknown",
    defaultDamage:
      site.type === "rebuilder_dealer" || site.type === "salvage_yard"
        ? "repairable"
        : undefined,
    maxPages: 10,
  };
  if (site.platform === "vehiclesnetwork")
    return {
      ...base,
      detailPattern: VEHICLESNETWORK_DETAIL,
      pageUrl: (n) => {
        const u = new URL(inventoryUrl);
        u.searchParams.set("ai_page", String(n));
        return u.toString();
      },
    };
  return base;
}

export function dealerCmsSiteFor(url: string): DealerCmsSite | undefined {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
  return DEALER_CMS_SITES.find(
    (s) =>
      new URL(s.baseUrl).hostname.replace(/^www\./, "").toLowerCase() === host,
  );
}

export interface DealerCmsDeps {
  fetchHtml: (
    url: string,
  ) => Promise<{ ok: boolean; status: number; body: string; skipped?: string }>;
  load: (html: string) => CheerioAPI;
  log?: (msg: string) => void;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// US phone numbers: (555) 123-4567, 555.123.4567, +1 555 123 4567, 1-800-555-1234.
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

/**
 * Dealer-page descriptions are stored on deals; keep the vehicle copy but never contact details.
 * Emails and phone numbers are removed (VINs and prices don't match these shapes).
 */
export function stripContactInfo(text: string | undefined): string | undefined {
  if (!text) return text;
  const out = text
    .replace(EMAIL, "")
    .replace(PHONE, "")
    .replace(
      /\b(?:call|text|email|e-mail|phone)(?:\s+(?:us|now|today))?\s*(?:at|:)?\s*(?=[.,;!]|$)/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;!])/g, "$1")
    .trim();
  return out || undefined;
}

const bareHost = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/**
 * True when a scraped card href points at the site itself (www. ignored). Cards linking anywhere
 * else are dropped before any detail fetch, so a hostile page can't steer our crawler off-site.
 */
export function isSameSiteHref(href: string, baseUrl: string): boolean {
  const h = bareHost(href);
  return !!h && h === bareHost(baseUrl);
}

/** Walk every inventory page of one site and return deals (does not save). */
export async function crawlDealerCms(site: DealerCmsSite, deps: DealerCmsDeps) {
  const log = deps.log ?? (() => {});
  const byId = new Map<string, Partial<Deal>>();
  let sold = 0;
  let offSite = 0;
  let pages = 1;
  let nextUrl: string | undefined;
  const visited = new Set<string>();
  const maxPages = Math.max(1, Math.min(50, Math.floor(site.maxPages || 15)));
  for (let n = 1; n <= pages && n <= maxPages; n++) {
    const url = nextUrl ?? pageUrlFor(site, n);
    if (visited.has(url)) break;
    visited.add(url);
    const res = await deps.fetchHtml(url);
    if (!res.ok) {
      if (n === 1)
        throw new Error(`${site.name} inventory ${res.skipped ?? res.status}`);
      break;
    }
    const patterns = site.detailPattern
      ? [site.detailPattern]
      : DETAIL_PATTERNS;
    const native =
      site.layout === "dg-native"
        ? parseDgInventory(deps.load(res.body), url)
        : null;
    const parsed: ParsedPage =
      native ??
      (site.layout === "text-lines"
        ? parseTextListing(deps.load(res.body), url, patterns)
        : parseListingPage(deps.load(res.body), url, patterns));
    if (
      native &&
      (native.total === null ||
        native.observed !== native.total ||
        native.cards.length + native.excluded + native.duplicates !==
          native.observed)
    )
      throw new Error(
        `${site.name} incomplete inventory: parsed ${parsed.cards.length}, expected ${parsed.total ?? "unknown"}`,
      );
    if (native) {
      const eligibleOrSold = native.cards.filter(
        (card) => card.sold || cardToDeal(card, site),
      ).length;
      const rejected =
        native.observed - native.excluded - native.duplicates - eligibleOrSold;
      log(
        `[DealerCMS] ${site.name}: observed ${native.observed}, expected ${native.total}, parsed ${native.cards.length}, excluded ${native.excluded}, duplicates ${native.duplicates}, rejected ${rejected}`,
      );
    }
    if (n === 1)
      pages = site.singlePage ? 1 : plannedPages(parsed, site.maxPages ?? 15);
    nextUrl = site.singlePage ? undefined : parsed.nextUrl;
    if (nextUrl && !visited.has(nextUrl)) pages = Math.max(pages, n + 1);
    let fresh = 0;
    for (const card of parsed.cards) {
      if (!isSameSiteHref(card.url, site.baseUrl)) {
        offSite++;
        continue;
      }
      const deal = cardToDeal(card, site);
      if (!deal) {
        if (card.sold) sold++;
        continue;
      }
      if (!byId.has(deal.source_deal_id!)) fresh++;
      byId.set(deal.source_deal_id!, deal);
    }
    // A page that adds nothing new means the site ignored ?page= (or we ran past the end).
    if (n > 1 && fresh === 0) break;
  }
  log(
    `[DealerCMS] ${site.name}: ${byId.size} listings over ${visited.size} attempted page(s), ${sold} sold/on-hold skipped${offSite ? `, ${offSite} off-site links dropped` : ""}`,
  );
  return Array.from(byId.values());
}
