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
  layout?: "cards" | "text-lines";
}

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
      /(?:payment(?:\s+amount)?\s*:?|down\s+payment\s*:?|down\s*:|per month\s*:?)\s*$/i.test(before)
    )
      continue;
    if (
      /^\s*(?:(?:\/|per\s)\s*(?:mo|month|wk|week)|down\b|bi-?weekly|weekly|monthly)/i.test(after)
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
        .find((t) => t.length >= 2 && t.length <= 40 && /[a-z]/i.test(t) && !/\$|call|sale/i.test(t));
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
    mileage: card.mileage,
    condition: card.condition ?? site.defaultCondition,
    title_source: card.condition ? "listing" : "source_default",
    damage_type: site.defaultDamage,
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
    defaultCondition: CONDITION_FOR_TYPE[site.type] ?? "run_drive",
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

/** Walk every inventory page of one site and return deals (does not save). */
export async function crawlDealerCms(site: DealerCmsSite, deps: DealerCmsDeps) {
  const log = deps.log ?? (() => {});
  const byId = new Map<string, Partial<Deal>>();
  let sold = 0;
  let pages = 1;
  for (let n = 1; n <= pages; n++) {
    const url = pageUrlFor(site, n);
    const res = await deps.fetchHtml(url);
    if (!res.ok) {
      if (n === 1)
        throw new Error(`${site.name} inventory ${res.skipped ?? res.status}`);
      break;
    }
    const patterns = site.detailPattern
      ? [site.detailPattern]
      : DETAIL_PATTERNS;
    const parsed =
      site.layout === "text-lines"
        ? parseTextListing(deps.load(res.body), url, patterns)
        : parseListingPage(deps.load(res.body), url, patterns);
    if (n === 1)
      pages = site.singlePage ? 1 : plannedPages(parsed, site.maxPages ?? 15);
    let fresh = 0;
    for (const card of parsed.cards) {
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
    `[DealerCMS] ${site.name}: ${byId.size} listings over ${pages} page(s), ${sold} sold/on-hold skipped`,
  );
  return Array.from(byId.values());
}
