/**
 * One parser for the small-dealer CMS family most rebuildable/salvage lots run on:
 *  - Creative Design Group (4cdg.com) sites: list pages link to `vehiclesDetail.php?<id>`
 *    (Damage.com / 74 Auto, D&G Auto, AutoVada, Polecats, Elite Sikeston, St. James, ...).
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
import { extractFromJsonLd, type RawVehicle } from "../generic-extractor";
import { isCarOrTruck } from "../vehicle-class";

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
  /** Title brand to assume when a card doesn't say. */
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
  layout?: DealerCmsLayout;
  /**
   * How to find page 2+:
   *  - "count" (default): plan pages from page 1's "N results" / "page 1 of N" / highest ?page= link.
   *  - "next-link": follow the page's own rel="next" link (Overfuel /inventory/page/N, DealerFire
   *    ?limit&offset, space.auto ?pg=N). Stops at the first page without one.
   *  - "sitemap": the list pages only ever show page 1 (ProMax's "Load Next Page" is a session POST),
   *    so read the site's sitemap.xml for detail pages and parse each one's JSON-LD.
   * Every page/detail URL is fetched through deps.fetchHtml (politeFetch: robots.txt checked first).
   */
  pagination?: "count" | "next-link" | "sitemap";
  /** layout "selector-cards": one element per vehicle (e.g. ADIMS "ul.invent-grid"). */
  cardSelector?: string;
  /** layout "selector-cards": element holding the vehicle title inside a card. */
  titleSelector?: string;
  /** layout "flight-json": only keep vehicles on this rooftop (Renn Kirby: "frederick"). */
  lotKey?: string;
  /** pagination "sitemap": sitemap URL and the detail-page pattern (group 1 = listing id). */
  sitemapUrl?: string;
  sitemapDetailPattern?: RegExp;
  /** pagination "sitemap": most detail pages fetched per crawl. Default 150. */
  maxDetails?: number;
}

/**
 * How a site's inventory page is read:
 *  - "cards": linked card per vehicle, read by heuristics (4cdg, VehiclesNETWORK, WordPress, Dealr.cloud)
 *  - "text-lines": "2021 Kia Forte LXS Salvage Title 47k / Front / $5,450" lines (Gary's)
 *  - "jsonld": schema.org JSON-LD (Overfuel, DealerFire, space.auto, ProMax) via generic-extractor
 *  - "selector-cards": a fixed card element whose detail link sits in onclick (ADIMS)
 *  - "text-blocks": unlinked "2021 Hyundai Sonata Se Price: $14,500 ... Mileage: 46,100" blocks (Wix)
 *  - "flight-json": vehicles in the Next.js flight payload, filtered to one rooftop (Legible Marketing)
 */
export type DealerCmsLayout =
  | "cards"
  | "text-lines"
  | "jsonld"
  | "selector-cards"
  | "text-blocks"
  | "flight-json";

export const DEALER_CMS_SITES: DealerCmsSite[] = [
  {
    sourceId: "damage-com",
    name: "Damage.com (74 Auto)",
    baseUrl: "https://www.damage.com",
    inventoryUrl: "https://www.damage.com/vehiclesList.php",
    city: "Sikeston",
    state: "MO",
    defaultCondition: "salvage_title",
    defaultDamage: "repairable",
  },
  {
    sourceId: "dg-auto",
    name: "D&G Auto LLC",
    baseUrl: "https://www.dgautollc.com",
    inventoryUrl: "https://www.dgautollc.com/vehicles.php",
    city: "Poplar Bluff",
    state: "MO",
    defaultCondition: "salvage_title",
    defaultDamage: "repairable",
  },
  {
    sourceId: "autovada",
    name: "AutoVada",
    baseUrl: "https://www.autovada.com",
    inventoryUrl: "https://www.autovada.com/inventory-all.php",
    city: "Cape Girardeau",
    state: "MO",
    // Mixed lot; titles aren't on the list cards. Detail enrichment fills them in.
    defaultCondition: "clean_title",
  },
  {
    sourceId: "polecats",
    name: "Polecats Auto Sales",
    baseUrl: "https://www.polecatsautosales.com",
    inventoryUrl: "https://www.polecatsautosales.com/vehicles.php",
    state: "MO",
    defaultCondition: "rebuilt_title",
    defaultDamage: "repairable",
  },
  {
    sourceId: "elite-sikeston",
    name: "Elite Auto Sales",
    baseUrl: "https://www.elitesikeston.com",
    inventoryUrl: "https://www.elitesikeston.com/vehicles.php",
    city: "Sikeston",
    state: "MO",
    defaultCondition: "clean_title",
  },
  {
    sourceId: "stjames-auto",
    name: "St. James Auto & Truck Parts",
    baseUrl: "https://rebuilders.stjamesautoparts.com",
    inventoryUrl: "https://rebuilders.stjamesautoparts.com/vehicles.php",
    city: "Saint James",
    state: "MO",
    defaultCondition: "salvage_title",
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
    defaultCondition: "salvage_title",
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
    defaultCondition: "rebuilt_title",
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
    defaultCondition: "salvage_title",
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
    defaultCondition: "salvage_title",
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

/** Title brand from card text. Silence returns undefined so the site default applies. */
export function titleBrand(text: string): string | undefined {
  const x = text.toLowerCase();
  if (/prior[\s-]?salvage|reconstruct/.test(x)) return "rebuilt_title";
  if (/\bsalvage\b/.test(x)) return "salvage_title";
  if (/\b(rebuilt|repaired)\b/.test(x)) return "rebuilt_title";
  if (/\b(clean|clear)\b(?!\s*(?:out|coat))/.test(x)) return "clean_title";
  return undefined;
}

const ACRONYM_MAKES = new Set(["GMC", "BMW", "VW", "AMC", "MG"]);
const MAX_YEAR = new Date().getFullYear() + 1;

export function parsePrice(text: string): number | undefined {
  const ok = (raw: string) => {
    const n = Number(raw.replace(/,/g, ""));
    return n >= 100 && n < 2_000_000 ? n : undefined;
  };
  // A labelled sale price wins over payment / down-payment amounts printed earlier on the card
  // (VehiclesNETWORK cards show "Payment Amount: $325.00" before "Sale Price $ 10,900 00").
  const labelled = text.match(
    /\b(?:sale|our|cash|internet|special|asking|retail|selling|pre-owned)\s+price\s*:?\s*\$\s*([\d,]{3,})/i,
  );
  if (labelled && ok(labelled[1])) return ok(labelled[1]);
  const re = /\$\s*([\d,]{3,})(?:\.\d{2})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 30), m.index);
    const after = text.slice(re.lastIndex, re.lastIndex + 12);
    if (
      /(?:payment(?:\s+amount)?\s*:?|down\s+payment\s*:?|down\s*:|per month\s*:?)\s*$/i.test(
        before,
      )
    )
      continue;
    if (
      /^\s*(?:(?:\/|per\s)\s*(?:mo|month|wk|week)|down\b|bi-?weekly|weekly|monthly)/i.test(
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
  const model =
    clean(m[3])
      .split(" ")
      .slice(0, 3)
      .join(" ")
      .replace(/[,;:!]+$/, "") || undefined;
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
const SOLD_RE = /\bsold\b(?!\s+as[\s-]?is)|\bon hold\b|\bsale pending\b/i;

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
  stock?: string;
  image?: string;
  vin?: string;
  sold: boolean;
}

export interface ParsedPage {
  cards: ParsedCard[];
  /** "264 results" / "Viewing 254 Results" when the page says so. */
  total: number | null;
  /** "page 1 of 6", or the highest page number linked. */
  lastPage: number | null;
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
      .find("h1,h2,h3,h4,h5,h6,.title,strong")
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
    const img = card.find("img[src]").first().attr("src");
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
      condition: titleBrand(text.replace(title, " ")) ?? titleBrand(title),
      stock,
      image: img ? abs(img, pageUrl) : undefined,
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

const VIN_17 = /^[A-HJ-NPR-Z0-9]{17}$/i;

function lastPathId(url: string): string | undefined {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs.pop() || u.search.replace(/^\?/, "") || undefined;
  } catch {
    return undefined;
  }
}

/** Overfuel detail slugs end in the VIN: ".../used-2019-nissan-pathfinder-sv-5n1dr2mm9kc615983-in-...". */
export function vinFromUrl(url: string): string | undefined {
  const last = lastPathId(url) || "";
  const m = last.match(/(?:^|-)([a-hj-npr-z0-9]{17})(?=-|$)/i)?.[1];
  return m && /\d/.test(m) && /[a-z]/i.test(m) && /\d{5}$/.test(m)
    ? m.toUpperCase()
    : undefined;
}

/**
 * schema.org JSON-LD listing page (Overfuel, DealerFire, space.auto, ProMax) through the generic
 * JSON-LD extractor. Cards with no url (ProMax list JSON-LD) are matched to the page's own detail
 * link by stock number (sku) or VIN.
 */
export function parseJsonLdPage(
  $: CheerioAPI,
  html: string,
  pageUrl: string,
  detailPattern?: RegExp,
  /** Detail pages: a card with no url of its own is the page itself. */
  fallbackUrl?: string,
): ParsedPage {
  const hrefs: string[] = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (href && (!detailPattern || detailPattern.test(href)))
      hrefs.push(abs(href, pageUrl));
  });
  const linkFor = (v: RawVehicle) => {
    if (v.url) return abs(v.url, pageUrl);
    const keys = [v.sku, v.vin].filter(Boolean) as string[];
    for (const k of keys) {
      const re = new RegExp(
        `[/=-]${k.replace(/[^A-Za-z0-9]/g, "")}(?:[/?#&-]|$)`,
        "i",
      );
      const hit = hrefs.find((h) => re.test(h));
      if (hit) return hit;
    }
    return fallbackUrl;
  };
  const cards: ParsedCard[] = [];
  for (const v of extractFromJsonLd(html)) {
    const url = linkFor(v);
    if (!url) continue;
    const title = clean(
      v.title || [v.year, v.make, v.model].filter(Boolean).join(" "),
    );
    const parts = splitTitle(title);
    const vin =
      v.vin && VIN_17.test(v.vin) ? v.vin.toUpperCase() : vinFromUrl(url);
    cards.push({
      id: vin || v.sku || lastPathId(url) || url,
      url,
      title,
      year: v.year ?? parts.year,
      make: v.make || parts.make,
      model: v.model || parts.model,
      price: v.price,
      mileage:
        v.mileage && v.mileage > 0 && v.mileage < 1_000_000
          ? v.mileage
          : undefined,
      condition: titleBrand(title),
      image: v.image ? abs(v.image, pageUrl) : undefined,
      vin,
      sold: !!v.sold,
    });
  }
  const bodyText = clean($("body").text());
  const total = bodyText.match(/([\d,]+)\s+(?:results|vehicles)\b/i)?.[1];
  return {
    cards,
    total: total ? Number(total.replace(/,/g, "")) : null,
    lastPage: null,
  };
}

/** The page's own "next page" link (rel=next on <link> or <a>), absolute, or null. */
export function nextPageHref($: CheerioAPI, pageUrl: string): string | null {
  const href =
    $('link[rel="next"]').first().attr("href") ||
    $('a[rel="next"]').first().attr("href") ||
    $("a")
      .filter((_, a) => /^\s*next(?:\s+page)?\s*[›»>]?\s*$/i.test($(a).text()))
      .first()
      .attr("href");
  if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return null;
  return abs(href, pageUrl);
}

/**
 * Fixed card elements (ADIMS "ul.invent-grid"). The detail link may only exist in the card's
 * onclick ("openlinkinnewtab('/detail/?vid=32683')"), so it's read from there or a plain <a href>.
 */
export function parseSelectorCards(
  $: CheerioAPI,
  pageUrl: string,
  site: Pick<DealerCmsSite, "cardSelector" | "titleSelector">,
): ParsedPage {
  const cards: ParsedCard[] = [];
  const seen = new Set<string>();
  $(site.cardSelector || "article").each((_, el) => {
    const card = $(el);
    const onclick =
      card.attr("onclick") ||
      card.find("[onclick*='/']").first().attr("onclick") ||
      "";
    const href =
      onclick.match(/['"](\/[^'"]+|https?:\/\/[^'"]+)['"]/)?.[1] ||
      card
        .find("a[href]")
        .filter(
          (_, a) =>
            !/^(#|tel:|mailto:|javascript:)/i.test($(a).attr("href") || ""),
        )
        .first()
        .attr("href");
    if (!href) return;
    const url = abs(href, pageUrl);
    const id = (() => {
      try {
        const u = new URL(url);
        return (
          u.searchParams.get("vid") ||
          u.searchParams.get("id") ||
          lastPathId(url) ||
          url
        );
      } catch {
        return url;
      }
    })();
    if (seen.has(id)) return;
    seen.add(id);
    const text = spacedText($, card);
    const title = clean(
      (site.titleSelector
        ? card.find(site.titleSelector).first().text()
        : "") ||
        text.match(
          /\b((?:19[5-9]\d|20\d{2})\s+[A-Za-z][\w-]*(?:\s+[\w./-]+){0,4})/,
        )?.[1] ||
        "",
    );
    // "Sale Price Call Us ... MSRP $1,200": no asking price, and MSRP is not one.
    const callForPrice = /\bprice\s*:?\s*call\b/i.test(text);
    const priceText = text.replace(
      /\bmsrp\s*:?\s*\$\s*[\d,]+(?:\.\d{2})?/gi,
      " ",
    );
    const img = card
      .find("img[src]")
      .map((_, i) => $(i).attr("src") || "")
      .get()
      .find((src) => !/sold|coming-soon|no-?image|logo/i.test(src));
    const soldBadge =
      card.find("img[src*='sold' i]").length > 0 ||
      SOLD_RE.test(badgeText($, card));
    cards.push({
      id,
      url,
      title,
      ...splitTitle(title),
      price: callForPrice ? undefined : parsePrice(priceText),
      mileage: parseMiles(text),
      condition: titleBrand(text.replace(title, " ")),
      stock: text.match(/stock\s*#\s*:?\s*([A-Z0-9][A-Z0-9-]{1,})/i)?.[1],
      image: img ? abs(img, pageUrl) : undefined,
      vin: text
        .match(/\bVIN\s*:?\s*([A-HJ-NPR-Z0-9]{17})\b/i)?.[1]
        ?.toUpperCase(),
      sold: soldBadge,
    });
  });
  const bodyText = clean($("body").text());
  const total = bodyText.match(/([\d,]+)\s+items?\s+matching/i)?.[1];
  const pageOf = bodyText.match(/page\s+\d+\s+of\s+(\d+)/i)?.[1];
  return {
    cards,
    total: total ? Number(total.replace(/,/g, "")) : null,
    lastPage: pageOf ? Number(pageOf) : null,
  };
}

const BLOCK_HEAD =
  /\b((?:19[5-9]\d|20\d{2})\s+[A-Z][\w&.'-]*(?:\s+(?!Price\b)[\w&./'-]+){0,6}?)\s+Price\s*:\s*\$\s*([\d,]{3,})/g;

/**
 * Unlinked text blocks, one per vehicle: "2021 Hyundai Sonata Se Price: $14,500 Exterior: Blue ...
 * Mileage: 46,100" (Wix site builder). There is no detail page, so the id is title+price+miles and
 * the listing url is the inventory page.
 */
export function parseTextBlocks($: CheerioAPI, pageUrl: string): ParsedPage {
  const text = spacedText($, $("body")).replace(/(\d)\s+,(\d{3})\b/g, "$1,$2");
  const heads: { title: string; price: number; start: number; end: number }[] =
    [];
  let m: RegExpExecArray | null;
  BLOCK_HEAD.lastIndex = 0;
  while ((m = BLOCK_HEAD.exec(text)))
    heads.push({
      title: clean(m[1]),
      price: Number(m[2].replace(/,/g, "")),
      start: m.index,
      end: BLOCK_HEAD.lastIndex,
    });
  const cards: ParsedCard[] = [];
  const seen = new Set<string>();
  heads.forEach((h, i) => {
    const body = text.slice(h.end, heads[i + 1]?.start ?? text.length);
    const mileage = parseMiles(body);
    const id = `${slugify(h.title)}-${h.price}${mileage ? `-${mileage}` : ""}`;
    if (seen.has(id)) return;
    seen.add(id);
    cards.push({
      id,
      url: pageUrl,
      title: h.title,
      ...splitTitle(h.title),
      price: h.price >= 100 ? h.price : undefined,
      mileage,
      condition: titleBrand(body.slice(0, 400)),
      sold: SOLD_RE.test(body.slice(0, 200)),
    });
  });
  return { cards, total: null, lastPage: 1 };
}

/**
 * Legible Marketing sites (Next.js) ship the whole group inventory in the flight payload as
 * {"id","stock","vin","year","make","model","trim","title","price","mileage",...,"url","photos",
 * "lotKey"} objects. Read those and keep only one rooftop (lotKey) when asked.
 */
export function parseFlightJson(html: string, lotKey?: string): ParsedPage {
  const flat = html.replace(/\\"/g, '"').replace(/\\\//g, "/");
  const starts: number[] = [];
  const startRe = /\{"id":"[^"]{1,40}","stock":"/g;
  let m: RegExpExecArray | null;
  while ((m = startRe.exec(flat))) starts.push(m.index);
  const cards: ParsedCard[] = [];
  const seen = new Set<string>();
  starts.forEach((start, i) => {
    const seg = flat.slice(
      start,
      starts[i + 1] ?? Math.min(flat.length, start + 20_000),
    );
    const str = (k: string) => seg.match(new RegExp(`"${k}":"([^"]*)"`))?.[1];
    const num = (k: string) => {
      const n = Number(seg.match(new RegExp(`"${k}":(\\d+(?:\\.\\d+)?)`))?.[1]);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const id = str("id");
    if (!id || seen.has(id)) return;
    const lot = str("lotKey");
    if (lotKey && lot !== lotKey) return;
    const url = str("url");
    if (!url) return;
    seen.add(id);
    const year = Number(str("year"));
    const make = str("make");
    const model = str("model");
    const trim = str("trim");
    const title = clean(
      [year || "", make, model, trim].filter(Boolean).join(" ") ||
        str("title") ||
        "",
    );
    const price = num("price");
    const mileage = num("mileage");
    const vin = str("vin");
    cards.push({
      id: str("stock") || id,
      url: url.replace(/[?&]ref=dealer_site$/, ""),
      title,
      year: year >= 1950 && year <= MAX_YEAR ? year : undefined,
      make: make ? splitTitle(`2000 ${make}`).make : undefined,
      model: [model, trim].filter(Boolean).join(" ") || undefined,
      price: price && price >= 100 && price < 2_000_000 ? price : undefined,
      mileage: mileage && mileage < 1_000_000 ? mileage : undefined,
      condition: titleBrand(str("condition") || ""),
      stock: str("stock"),
      image: seg.match(/"photos":\["([^"]+)"/)?.[1],
      vin: vin && VIN_17.test(vin) ? vin.toUpperCase() : undefined,
      sold: /^(?:sold|pending)$/i.test(str("status") || ""),
    });
  });
  return { cards, total: cards.length, lastPage: 1 };
}

/** Detail-page URLs listed in a sitemap.xml that match the site's detail pattern. */
export function sitemapDetailUrls(xml: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const url = m[1].replace(/&amp;/g, "&");
    if (!pattern.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
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
  // Cars and trucks only (Jonah, 2026-10-09): ATVs, bikes, trailers etc. never reach deals.
  if (!isCarOrTruck(card.title)) return null;
  return {
    source: "independent_dealer",
    source_deal_id: `${site.sourceId}-${card.id}`,
    source_url: card.url,
    title: card.title,
    year: card.year,
    make: card.make,
    model: card.model,
    ask_price: card.price,
    mileage: card.mileage,
    condition: card.condition ?? site.defaultCondition,
    title_source: card.condition ? "listing" : "source_default",
    damage_type: site.defaultDamage,
    seller_type: "dealer",
    location_city: site.city,
    location_state: site.state,
    images: card.image ? [card.image] : [],
    ...(card.vin ? { vin: card.vin } : {}),
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
 * schema.org JSON-LD platforms (read by generic-extractor's extractFromJsonLd):
 *  - "overfuel": Overfuel (Next.js, `static.overfuel.com`), ItemList of Products, 25/page,
 *    `/inventory/page/N` via rel=next. robots disallows `/*highlights[]=` facet links.
 *  - "dealerfire": DealerFire / DealerSocket (`cdn-ds.com`), SearchResultsPage offers, 20/page,
 *    `?limit=20&offset=N` via rel=next. robots asks Crawl-delay: 10 (politeFetch honors it).
 *  - "spaceauto": space.auto on WordPress, @graph → ItemList of Product/Car, `?pg=N` via rel=next.
 *  - "promax": ProMax (`imageserver.promaxinventory.com`), Vehicle JSON-LD on the list page (10, no
 *    GET pagination) and a Product/Car block on every `/VehicleDetails/...` page listed in sitemap.xml.
 * HTML platforms:
 *  - "legible": Legible Marketing (Next.js), whole group inventory in the flight payload; `lot` picks
 *    one rooftop.
 *  - "dealrcloud": Dealr.cloud (`cdn.dealrimages.com`), cards linking `inventory/<slug>/<id>`.
 *  - "adims": ADIMS on WordPress (`adimsweb.com`), `ul.invent-grid` cards with onclick detail links.
 *  - "wix": Wix site-builder inventory written as text blocks ("Price: $14,500 ... Mileage: 46,100").
 *  - "wordpress-autos": WordPress dealer theme with `/autos/<year-make-model>/` detail pages.
 */
export type DealerPlatform =
  | "4cdg"
  | "vehiclesnetwork"
  | "overfuel"
  | "dealerfire"
  | "spaceauto"
  | "promax"
  | "legible"
  | "dealrcloud"
  | "adims"
  | "wix"
  | "wordpress-autos";

export const VEHICLESNETWORK_DETAIL =
  /(?:^|\/)autos\/((?:19|20)\d{2}-[A-Za-z0-9-]+-\d+)\/?(?:[?#].*)?$/i;

export const PROMAX_DETAIL = /\/VehicleDetails\/\d+\/(\d+)\//i;

/** Default inventory path and parser settings per platform (a registry inventoryUrl overrides the path). */
const PLATFORM_DEFAULTS: Record<
  DealerPlatform,
  { path: string } & Partial<DealerCmsSite>
> = {
  "4cdg": { path: "/vehicles.php" },
  vehiclesnetwork: { path: "/autos" },
  overfuel: {
    path: "/inventory",
    layout: "jsonld",
    pagination: "next-link",
    maxPages: 40,
  },
  dealerfire: {
    path: "/used-vehicles/",
    layout: "jsonld",
    pagination: "next-link",
    maxPages: 20,
  },
  spaceauto: {
    path: "/cars/used/",
    layout: "jsonld",
    pagination: "next-link",
    maxPages: 25,
  },
  promax: {
    path: "/inventory",
    layout: "jsonld",
    pagination: "sitemap",
    detailPattern: PROMAX_DETAIL,
    sitemapDetailPattern: PROMAX_DETAIL,
    maxDetails: 150,
  },
  legible: { path: "/inventory", layout: "flight-json", singlePage: true },
  dealrcloud: {
    path: "/inventory",
    detailPattern: /(?:^|\/)inventory\/[^/?#]+\/(\d+)\/?$/i,
    pagination: "next-link",
    maxPages: 10,
  },
  adims: {
    path: "/inventory/",
    layout: "selector-cards",
    cardSelector: "ul.invent-grid",
    titleSelector: ".url",
    pagination: "next-link",
    maxPages: 10,
  },
  wix: { path: "/inventory", layout: "text-blocks", singlePage: true },
  "wordpress-autos": {
    path: "/cars/",
    detailPattern: /\/autos\/([a-z0-9-]+)\/?$/i,
    pagination: "next-link",
    maxPages: 10,
  },
};

const CONDITION_FOR_TYPE: Record<string, string> = {
  salvage_yard: "salvage_title",
  auction_proxy: "salvage_title",
  rebuilder_dealer: "rebuilt_title",
  independent_dealer: "run_drive",
  clean_retail: "clean",
};

export function dealerCmsSiteFromCurated(site: {
  url: string;
  name: string;
  state?: string;
  city?: string;
  type: string;
  inventoryUrl?: string;
  platform?: DealerPlatform;
  lot?: string;
}): DealerCmsSite | undefined {
  if (!site.platform || !site.state) return undefined;
  const defaults = PLATFORM_DEFAULTS[site.platform];
  if (!defaults) return undefined;
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
    site.inventoryUrl || defaults.path,
    origin,
  ).toString();
  const { path: _path, ...settings } = defaults;
  const base: DealerCmsSite = {
    sourceId: `${site.platform}-${host.replace(/[^a-z0-9]+/g, "-")}`,
    name: site.name,
    baseUrl: origin,
    inventoryUrl,
    city: site.city,
    state: site.state,
    defaultCondition: CONDITION_FOR_TYPE[site.type] ?? "run_drive",
    defaultDamage:
      site.type === "rebuilder_dealer" || site.type === "salvage_yard"
        ? "repairable"
        : undefined,
    maxPages: 10,
    ...settings,
    ...(site.lot ? { lotKey: site.lot } : {}),
    ...(settings.pagination === "sitemap"
      ? { sitemapUrl: new URL("/sitemap.xml", origin).toString() }
      : {}),
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
  /** Detail pages (sitemap pagination). Defaults to fetchHtml; callers pass a longer cache. */
  fetchDetailHtml?: DealerCmsDeps["fetchHtml"];
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

/** Parse one fetched page with the site's layout. */
export function parseDealerCmsPage(
  site: DealerCmsSite,
  $: CheerioAPI,
  html: string,
  url: string,
): ParsedPage {
  const patterns = site.detailPattern ? [site.detailPattern] : DETAIL_PATTERNS;
  switch (site.layout) {
    case "text-lines":
      return parseTextListing($, url, patterns);
    case "jsonld":
      return parseJsonLdPage($, html, url, site.detailPattern);
    case "selector-cards":
      return parseSelectorCards($, url, site);
    case "text-blocks":
      return parseTextBlocks($, url);
    case "flight-json":
      return parseFlightJson(html, site.lotKey);
    default:
      return parseListingPage($, url, patterns);
  }
}

/**
 * Walk every inventory page of one site and return deals (does not save).
 *
 * Every URL — page 1, each pagination link, the sitemap and each detail page — goes through
 * deps.fetchHtml (politeFetch in production), which checks robots.txt before the request and paces
 * each domain with random jitter. A robots "no" on a pagination link ends the walk there; it is never
 * retried another way. Links pointing off the dealer's own host are never followed.
 */
export async function crawlDealerCms(site: DealerCmsSite, deps: DealerCmsDeps) {
  const log = deps.log ?? (() => {});
  const byId = new Map<string, Partial<Deal>>();
  let sold = 0;
  let offSite = 0;
  let pages = 0;
  let robotsStop: string | null = null;

  const take = (cards: ParsedCard[]) => {
    let fresh = 0;
    for (const card of cards) {
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
    return fresh;
  };

  const first = async (url: string) => {
    const res = await deps.fetchHtml(url);
    if (!res.ok)
      throw new Error(`${site.name} inventory ${res.skipped ?? res.status}`);
    return res;
  };

  if (site.pagination === "next-link") {
    const visited = new Set<string>();
    let url: string | null = site.inventoryUrl;
    const max = site.singlePage ? 1 : (site.maxPages ?? 15);
    for (let n = 1; n <= max && url; n++) {
      if (visited.has(url)) break;
      visited.add(url);
      const res = n === 1 ? await first(url) : await deps.fetchHtml(url);
      if (!res.ok) {
        if (res.skipped === "robots") robotsStop = url;
        break;
      }
      pages = n;
      const $ = deps.load(res.body);
      const fresh = take(parseDealerCmsPage(site, $, res.body, url).cards);
      // A page that adds nothing new means we looped or ran past the end.
      if (n > 1 && fresh === 0) break;
      const next = nextPageHref($, url);
      url = next && isSameSiteHref(next, site.baseUrl) ? next : null;
    }
  } else if (site.pagination === "sitemap") {
    const res = await first(site.inventoryUrl);
    pages = 1;
    take(
      parseDealerCmsPage(site, deps.load(res.body), res.body, site.inventoryUrl)
        .cards,
    );
    const known = new Set(Array.from(byId.values()).map((d) => d.source_url));
    const sm = site.sitemapUrl ? await deps.fetchHtml(site.sitemapUrl) : null;
    if (sm && !sm.ok && sm.skipped === "robots") robotsStop = site.sitemapUrl!;
    const details =
      sm?.ok && site.sitemapDetailPattern
        ? sitemapDetailUrls(sm.body, site.sitemapDetailPattern)
            .filter((u) => isSameSiteHref(u, site.baseUrl) && !known.has(u))
            .slice(0, site.maxDetails ?? 150)
        : [];
    const fetchDetail = deps.fetchDetailHtml ?? deps.fetchHtml;
    for (const url of details) {
      const d = await fetchDetail(url);
      if (!d.ok) {
        if (d.skipped === "robots") robotsStop = robotsStop ?? url;
        if (d.skipped === "breaker") break; // the site said stop
        continue;
      }
      pages++;
      const parsed = parseJsonLdPage(
        deps.load(d.body),
        d.body,
        url,
        undefined,
        url,
      );
      // A detail page describes one vehicle; "similar vehicles" blocks after it are ignored.
      take(parsed.cards.slice(0, 1));
    }
  } else {
    pages = 1;
    for (let n = 1; n <= pages; n++) {
      const url = pageUrlFor(site, n);
      const res = n === 1 ? await first(url) : await deps.fetchHtml(url);
      if (!res.ok) {
        if (res.skipped === "robots") robotsStop = url;
        break;
      }
      const parsed = parseDealerCmsPage(
        site,
        deps.load(res.body),
        res.body,
        url,
      );
      if (n === 1)
        pages = site.singlePage ? 1 : plannedPages(parsed, site.maxPages ?? 15);
      const fresh = take(parsed.cards);
      // A page that adds nothing new means the site ignored ?page= (or we ran past the end).
      if (n > 1 && fresh === 0) break;
    }
  }
  log(
    `[DealerCMS] ${site.name}: ${byId.size} listings over ${pages} page(s), ${sold} sold/on-hold skipped${offSite ? `, ${offSite} off-site links dropped` : ""}${robotsStop ? `, stopped at robots-disallowed ${robotsStop}` : ""}`,
  );
  return Array.from(byId.values());
}
