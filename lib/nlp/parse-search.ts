// lib/nlp/parse-search.ts
// Turn a plain-English search ("clean-title Accords under 10k in Texas with good profit") into
// saved-search criteria. Pure regex/heuristics — $0, no AI. Used by /searches to prefill the form.

export interface ParsedSearch {
  make?: string;
  model?: string;
  min_year?: number;
  max_year?: number;
  max_price?: number;
  target_profit?: number;
  state?: string;
  require_go?: boolean;
}

const MAKES: Record<string, string> = {
  ford: "Ford",
  chevy: "Chevrolet",
  chevrolet: "Chevrolet",
  gmc: "GMC",
  ram: "Ram",
  dodge: "Dodge",
  jeep: "Jeep",
  toyota: "Toyota",
  honda: "Honda",
  nissan: "Nissan",
  hyundai: "Hyundai",
  kia: "Kia",
  subaru: "Subaru",
  mazda: "Mazda",
  vw: "Volkswagen",
  volkswagen: "Volkswagen",
  bmw: "BMW",
  mercedes: "Mercedes-Benz",
  audi: "Audi",
  lexus: "Lexus",
  acura: "Acura",
  cadillac: "Cadillac",
  tesla: "Tesla",
  buick: "Buick",
  chrysler: "Chrysler",
  lincoln: "Lincoln",
  infiniti: "Infiniti",
};
// A few common model tokens to recognize when no make precedes them.
const MODELS: Record<string, [string, string]> = {
  "f-150": ["Ford", "F-150"],
  f150: ["Ford", "F-150"],
  silverado: ["Chevrolet", "Silverado"],
  accord: ["Honda", "Accord"],
  civic: ["Honda", "Civic"],
  camry: ["Toyota", "Camry"],
  corolla: ["Toyota", "Corolla"],
  tacoma: ["Toyota", "Tacoma"],
  tahoe: ["Chevrolet", "Tahoe"],
  mustang: ["Ford", "Mustang"],
  wrangler: ["Jeep", "Wrangler"],
  "1500": ["Ram", "1500"],
};
const STATES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  wisconsin: "WI",
  wyoming: "WY",
  "new york": "NY",
  "new jersey": "NJ",
  "north carolina": "NC",
  "south carolina": "SC",
};

// "10k", "$10,000", "under 10000", "3000"
function parseMoney(s: string): number | undefined {
  const t = (s || "").replace(/[$,\s]/g, "");
  if (/k$/i.test(t) || /\dk/i.test(t)) {
    const m = t.match(/(\d+(?:\.\d+)?)/);
    if (m) return Math.round(parseFloat(m[1]) * 1000);
  }
  const m = t.match(/(\d{3,})/);
  if (m) return parseInt(m[1]);
  return undefined;
}

export function parseSearchQuery(query: string): ParsedSearch {
  const q = (query || "").toLowerCase();
  const out: ParsedSearch = {};

  // make + model
  for (const [k, v] of Object.entries(MAKES)) {
    const idx = q.indexOf(k);
    if (idx !== -1) {
      out.make = v;
      const after = q
        .slice(idx + k.length)
        .trim()
        .split(/\s+/)[0];
      if (
        after &&
        after.length > 1 &&
        !/^(under|in|with|and|for)$/.test(after)
      ) {
        out.model = after
          .replace(/s$/, "")
          .replace(/\b\w/, (c) => c.toUpperCase());
      }
      break;
    }
  }
  if (!out.make) {
    for (const [k, [mk, md]] of Object.entries(MODELS)) {
      if (q.includes(k)) {
        out.make = mk;
        out.model = md;
        break;
      }
    }
  }

  // price — only treat as max_price when preceded by under/below/<.
  const priceCtx = q.match(
    /(?:under|below|less than|<)\s*(\$?\s?[\d,.]+\s?k?)/i,
  );
  if (priceCtx) out.max_price = parseMoney(priceCtx[1]);

  // profit — "good profit / profitable / $X profit / Y profit"
  const profitCtx = q.match(
    /(\$?\s?[\d,.]+\s?k?)\s*(?:\+)?\s*(?:net\s*)?profit/i,
  );
  if (profitCtx) out.target_profit = parseMoney(profitCtx[1]);
  else if (/good profit|profitable|high profit|go deal|worth flipping/.test(q))
    out.require_go = true;

  // years — "2015-2019", "after 2015", "newer than 2018"
  const range = q.match(
    /\b(19[89]\d|20[0-3]\d)\s*(?:-|to|–)\s*(19[89]\d|20[0-3]\d)\b/,
  );
  if (range) {
    out.min_year = parseInt(range[1]);
    out.max_year = parseInt(range[2]);
  } else {
    const after = q.match(/(?:after|newer than|since)\s*(19[89]\d|20[0-3]\d)/);
    if (after) out.min_year = parseInt(after[1]);
  }

  // state
  const abbr = q.match(/\bin\s+([a-z]{2})\b/);
  if (abbr && Object.values(STATES).includes(abbr[1].toUpperCase()))
    out.state = abbr[1].toUpperCase();
  if (!out.state) {
    for (const [name, code] of Object.entries(STATES)) {
      if (q.includes(name)) {
        out.state = code;
        break;
      }
    }
  }

  return out;
}
