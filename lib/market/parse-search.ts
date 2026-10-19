import { vehicleMakeTerms } from "@/lib/scrapers/tools/deal-normalizer";
import { parseVehicleQuery } from "@/lib/search/parse-vehicle-query";
import { normalizeVehicleSpec } from "@/lib/vehicle/spec-filters";
import { US_STATES } from "@/lib/geo/us-states";

export type MarketSearchInterpretation = {
  filters: Record<string, string | string[]>;
  details: Record<string, string>;
  labels: string[];
  warnings: string[];
  needsNearby: boolean;
  blocked: boolean;
};
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BODY =
  /\b(suv|sport[ -]utility|sedan|coupe|convertible|wagon|minivan|van|pickup(?: truck)?|truck|motorcycle)s?\b/gi;
const COLORS =
  /\b(black|white|silver|gr[ae]y|red|blue|green|brown|tan|beige|orange|yellow|gold|purple)\b/gi;
const SPECS = [
  {
    key: "fuelType",
    expression:
      /\b(plug[ -]?in[ -]?hybrid|phev|hybrid|hev|electric|bev|ev|flex[ -]?fuel|ffv|e85|diesel|gasoline|gas|petrol)\b/gi,
  },
  {
    key: "transmission",
    expression:
      /\b(dual[ -]?clutch|dct|dsg|pdk|continuously[ -]?variable|e[ -]?cvt|cvt|automatic|auto|manual|stick[ -]?shift|m\/t)\b/gi,
  },
  {
    key: "drivetrain",
    expression:
      /\b(all[ -]?wheel(?:[ -]?drive)?|four[ -]?wheel(?:[ -]?drive)?|front[ -]?wheel(?:[ -]?drive)?|rear[ -]?wheel(?:[ -]?drive)?|awd|4wd|4x4|fwd|rwd)\b/gi,
  },
] as const;

/** Preview only: extract explicit constraints, never infer history, equipment, credit or suitability. */
export function parseMarketSearch(input: string): MarketSearchInterpretation {
  const query = String(input || "")
    .slice(0, 300)
    .trim();
  const result: MarketSearchInterpretation = {
    filters: {},
    details: {},
    labels: [],
    warnings: [],
    needsNearby: false,
    blocked: false,
  };
  if (!query) return result;
  if (
    /\b(no|not|without|exclude|excluding|avoid|except|never)\b/i.test(query)
  ) {
    result.blocked = true;
    result.warnings.push(
      "Exclusions are not supported in this preview. Simplify the query and use the available filter controls for exclusions they support.",
    );
    return result;
  }
  if (
    /\b(monthly|per month|down payment|payment|apr|financ(?:e|ing))\b|\/mo\b/i.test(
      query,
    )
  ) {
    result.blocked = true;
    result.warnings.push(
      "Payment and financing amounts are not full vehicle prices. Use the price-type filters or an offer cost check.",
    );
    return result;
  }
  let remaining = query;
  const consume = (pattern: RegExp) => {
    remaining = remaining.replace(pattern, " ");
  };
  result.needsNearby = /\bnear\s+me\b/i.test(query);
  consume(/\bnear\s+me\b/gi);
  const amount = (raw: string, thousands?: string) =>
    Number(raw.replace(/,/g, "")) * (thousands ? 1000 : 1);
  // Consume explicit units first. A mileage cap must never become a budget or ZIP.
  const mileage = remaining.match(
    /\b(?:under|below|less than|max(?:imum)?|up to)\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:mileage|miles?|mi)\b/i,
  );
  let maxMileage: string | undefined;
  if (mileage) {
    const miles = amount(mileage[1], mileage[2]);
    maxMileage = String(miles);
    if (!Number.isSafeInteger(miles) || miles < 0 || miles >= 1_000_000) {
      result.blocked = true;
      result.warnings.push("Use a mileage cap between 0 and 999,999 miles.");
    }
    remaining = remaining.replace(mileage[0], " ");
  }
  const radius =
    remaining.match(/\bwithin\s*(\d+)\s*(?:miles?|mi)\b/i) ||
    remaining.match(/\b(\d+)\s*(?:miles?|mi)\s*radius\b/i);
  let radiusMiles: string | undefined;
  if (radius) {
    radiusMiles = radius[1];
    if (Number(radius[1]) < 1 || Number(radius[1]) > 1000) {
      result.blocked = true;
      result.warnings.push(
        "Choose a radius from 1 to 1,000 miles, or use Nationwide.",
      );
    }
    remaining = remaining.replace(radius[0], " ");
  }
  const priceRange =
    remaining.match(
      /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\s*(?:-|–|to|and)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i,
    ) ||
    remaining.match(
      /\b(?:between\s+)?(\d[\d,]*(?:\.\d+)?)\s*(k)\s*(?:-|–|to|and)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)\b/i,
    );
  let low: number | undefined, high: number | undefined;
  if (priceRange) {
    low = amount(priceRange[1], priceRange[2]);
    high = amount(priceRange[3], priceRange[4] || priceRange[2]);
    remaining = remaining.replace(priceRange[0], " ");
  }
  const prices = Array.from(
    remaining.matchAll(
      /(?:\b(under|below|less than|max(?:imum)?|up to|budget|over|above|at least|from|min(?:imum)?)|([<>]))\s*(\$)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/gi,
    ),
  );
  for (const match of prices) {
    // "from 2018" could describe a year or a price; require a unit to disambiguate.
    if (
      !match[3] &&
      !match[5] &&
      /^(?:19|20)\d{2}$/.test(match[4]) &&
      /from|over|above/i.test(match[1] || "")
    ) {
      result.blocked = true;
      result.warnings.push(
        "Use a dollar sign for prices or ‘after’ for model years.",
      );
    }
    const value = amount(match[4], match[5]);
    const minimum = /^(?:over|above|at least|from|min(?:imum)?|>)$/i.test(
      match[1] || match[2],
    );
    if ((minimum ? low : high) != null) {
      result.blocked = true;
      result.warnings.push("Use one minimum and one maximum price per search.");
    }
    if (minimum) low = value;
    else high = value;
    remaining = remaining.replace(match[0], " ");
  }
  const barePrices = Array.from(
    remaining.matchAll(
      /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b|\b(\d{1,3}(?:\.\d+)?)\s*(k)\b/gi,
    ),
  );
  for (const match of barePrices) {
    if (high != null) {
      result.blocked = true;
      result.warnings.push("Use one maximum price per search.");
    }
    high = amount(match[1] || match[3], match[2] || match[4]);
    remaining = remaining.replace(match[0], " ");
  }
  if (
    [low, high].some(
      (value) =>
        value != null &&
        (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000),
    ) ||
    high === 0 ||
    (low != null && high != null && low > high)
  ) {
    result.blocked = true;
    result.warnings.push(
      "Use a valid whole-dollar price range with the minimum no greater than the maximum.",
    );
  }
  const numericSource = remaining.replace(
    /\bbetween\s+((?:19|20)\d{2})\s+and\s+((?:19|20)\d{2})\b/gi,
    "$1-$2",
  );
  const numeric = parseVehicleQuery(numericSource);
  // State names can also be model names (Pontiac Montana). Require a location
  // cue, and never interpret an uppercase preposition such as "IN TX" as Indiana.
  const states = new Set<string>();
  for (const [code, [name]] of Object.entries(US_STATES)) {
    if (
      new RegExp(
        `\\b(?:in|state|near)\\s*:?\\s*(?:${code}|${escape(String(name))})\\b`,
        "i",
      ).test(numericSource)
    )
      states.add(code);
  }
  if (states.size) {
    for (const token of Array.from(numericSource.matchAll(/\b[A-Z]{2}\b/g))) {
      if (US_STATES[token[0]] && !/^(?:IN|OR|ME|OK|HI)$/.test(token[0]))
        states.add(token[0]);
    }
  }
  if (states.size > 1) {
    result.blocked = true;
    result.warnings.push(
      "Choose one state for this preview, or use the location controls to select multiple states.",
    );
  }
  numeric.state = Array.from(states)[0];
  numeric.minPrice = low == null ? undefined : String(low);
  numeric.maxPrice = high == null ? undefined : String(high);
  numeric.maxMileage = maxMileage;
  numeric.radius = radiusMiles;
  const put = (key: string, value: string | undefined, label: string) => {
    if (value == null) return;
    result.filters[key] = value;
    result.labels.push(label);
  };
  const dollars = (value: string) =>
    `$${Number(value).toLocaleString("en-US")}`;
  put(
    "priceMin",
    numeric.minPrice,
    numeric.minPrice ? `Full price from ${dollars(numeric.minPrice)}` : "",
  );
  put(
    "priceMax",
    numeric.maxPrice,
    numeric.maxPrice ? `Full price up to ${dollars(numeric.maxPrice)}` : "",
  );
  if (numeric.minPrice || numeric.maxPrice) {
    result.filters.priceBasis = "cash";
    result.details.pricePolicy = "reported";
    result.warnings.push(
      "The budget uses confirmed full cash or buy-now prices; bids, deposits, payments and unconfirmed prices do not meet that budget.",
    );
  }
  put(
    "mileageMax",
    numeric.maxMileage,
    numeric.maxMileage
      ? `Mileage up to ${Number(numeric.maxMileage).toLocaleString("en-US")} mi`
      : "",
  );
  let minYear = numeric.minYear,
    maxYear = numeric.maxYear;
  const mentionedYears = Array.from(
    numericSource.matchAll(/\b((?:19|20)\d{2})\b/g),
  ).map((match) => Number(match[1]));
  if (
    mentionedYears.some(
      (year) => year < 1950 || year > new Date().getFullYear() + 1,
    )
  ) {
    result.blocked = true;
    result.warnings.push("A model year is outside the supported range.");
  }
  if (
    mentionedYears.length > 1 &&
    !/\b(?:19|20)\d{2}\s*(?:-|–|to|thru|through)\s*(?:19|20)\d{2}\b/i.test(
      numericSource,
    )
  ) {
    result.blocked = true;
    result.warnings.push(
      "Use a single model year or an explicit year range, such as 2018–2022.",
    );
  }
  if (minYear && /\b(?:after|newer than)\s*\d{4}\b/i.test(query))
    minYear = String(Number(minYear) + 1);
  if (
    minYear &&
    !maxYear &&
    !/(?:\d{4}\s*\+|\b(?:after|since|newer than)\b|\d{4}\s+(?:or|and)\s+newer)/i.test(
      query,
    )
  )
    maxYear = minYear;
  if (
    (minYear && Number(minYear) > new Date().getFullYear() + 1) ||
    (maxYear && Number(maxYear) < 1950)
  ) {
    result.blocked = true;
    result.warnings.push(
      "The requested year bound is outside the supported range.",
    );
  }
  put("yearMin", minYear, minYear ? `Year from ${minYear}` : "");
  put("yearMax", maxYear, maxYear ? `Year to ${maxYear}` : "");
  if (
    numeric.zip &&
    !new RegExp(
      `\\b(?:near|zip|around|in|by|of)\\s*:?\\s*${numeric.zip}\\b`,
      "i",
    ).test(remaining)
  ) {
    result.blocked = true;
    result.warnings.push(
      "Label a ZIP with ‘near’ or ‘ZIP’, or use a dollar sign for a budget.",
    );
  }
  if (numeric.zip && numeric.state) {
    result.blocked = true;
    result.warnings.push(
      "Choose either a ZIP-centered search or a state for this preview.",
    );
  }
  if (numeric.zip) {
    result.filters.near = numeric.zip;
    result.filters.lat = "";
    result.filters.lng = "";
    result.filters.states = [];
    result.labels.push(`ZIP ${numeric.zip}`);
  } else if (numeric.state) {
    result.filters.states = [numeric.state];
    result.filters.near = "";
    result.filters.lat = "";
    result.filters.lng = "";
    result.filters.radius = "";
    result.labels.push(US_STATES[numeric.state]?.[0] || numeric.state);
  }
  if (numeric.radius && Number(numeric.radius) <= 1000)
    put("radius", numeric.radius, `Within ${numeric.radius} mi`);
  else if (numeric.radius) {
    result.blocked = true;
    result.warnings.push(
      "Market radius searches support up to 1,000 miles. Choose Nationwide for a wider search.",
    );
  }
  if (result.needsNearby)
    result.labels.push("Use your applied or saved location");
  if (numeric.radius && !numeric.zip && !result.needsNearby) {
    result.needsNearby = true;
    result.labels.push("Use your applied or saved location");
  }
  if (result.needsNearby && (numeric.zip || numeric.state)) {
    result.blocked = true;
    result.warnings.push("Choose one location: near me, a ZIP, or a state.");
  }
  if (numeric.state)
    consume(
      new RegExp(
        `\\b(?:in|state|near)\\s*:?\\s*(?:${numeric.state}|${escape(String(US_STATES[numeric.state]?.[0] || ""))})\\b`,
        "gi",
      ),
    );
  if (numeric.zip)
    consume(
      new RegExp(
        `\\b(?:near|zip|around|in|by|of)\\s*:?\\s*${numeric.zip}\\b`,
        "gi",
      ),
    );
  for (const spec of SPECS) {
    const matches = Array.from(remaining.matchAll(spec.expression));
    const values = new Set(
      matches
        .map((match) => normalizeVehicleSpec(spec.key, match[0]))
        .filter(Boolean),
    );
    if (values.size > 1) {
      result.blocked = true;
      result.warnings.push(
        `Choose one ${spec.key === "fuelType" ? "fuel type" : spec.key} in this preview; alternatives need exact filters.`,
      );
    } else if (values.size === 1) {
      const value = Array.from(values)[0]!;
      result.details[spec.key] = value;
      result.labels.push(value);
      consume(spec.expression);
    }
  }
  const bodies = Array.from(remaining.matchAll(BODY)).map((match) => ({
    text: match[0],
    value: /suv|utility/i.test(match[0])
      ? "SUV"
      : /pickup|truck/i.test(match[0])
        ? "Pickup"
        : /minivan/i.test(match[0])
          ? "Van"
          : match[0]
              .replace(/s$/i, "")
              .replace(/^./, (letter) => letter.toUpperCase()),
  }));
  if (new Set(bodies.map((body) => body.value)).size > 1) {
    result.blocked = true;
    result.warnings.push("Choose one body style in this preview.");
  } else if (bodies.length) {
    result.details.body = bodies[0].value;
    result.labels.push(bodies[0].value);
    consume(BODY);
  }
  const colors = Array.from(remaining.matchAll(COLORS)).map((match) =>
    match[0].toLowerCase(),
  );
  if (new Set(colors).size > 1) {
    result.blocked = true;
    result.warnings.push("Choose one exterior color in this preview.");
  } else if (colors.length) {
    result.details.color = colors[0];
    result.labels.push(`${colors[0]} exterior`);
    consume(COLORS);
  }
  if (/\bclean[ -]title\b/i.test(remaining)) {
    result.filters.conditions = ["clean_title"];
    result.labels.push("Reported clean title");
    consume(/\bclean[ -]title\b/gi);
    result.warnings.push(
      "A reported clean title does not establish accident-free history.",
    );
  }
  const found = vehicleMakeTerms().flatMap(({ term, make }) => {
    const expression = new RegExp(`\\b${escape(term)}\\b`, "i");
    const match = remaining.match(expression);
    return match ? [{ term, make, index: match.index! }] : [];
  });
  const makes = Array.from(new Set(found.map(({ make }) => make)));
  if (makes.length > 1) {
    result.blocked = true;
    result.warnings.push(
      "Multiple makes need paired make/model filters. Choose one make for this preview.",
    );
  } else if (found.length) {
    result.filters.makes = makes;
    result.labels.push(makes[0]);
    // Reuse the existing model parser after removing attribute tokens so "Audi wagon" never becomes model=Wagon.
    const identity = parseVehicleQuery(remaining);
    const model =
      identity.make === "Ford" && /^f[1-5]50$/i.test(identity.model || "")
        ? identity.model!.replace(/^f/i, "F-")
        : identity.model;
    if (
      model &&
      !/^(?:a|an|the|good|great|cheap|best|suitable|nice|cars?|vehicles?|used|new|cpo|please|looking)$/i.test(
        model,
      )
    ) {
      result.filters.model = model;
      result.labels.push(model);
      consume(new RegExp(`\\b${escape(model).replace("-", "[- ]?")}\\b`, "i"));
    } else {
      result.filters.model = "";
      result.labels.push("Any model");
    }
    for (const match of found)
      consume(new RegExp(`\\b${escape(match.term)}\\b`, "gi"));
  }
  consume(
    /\b(?:between\s+)?(?:after|before|since|newer than|older than|up to|until|pre)?\s*(?:19|20)\d{2}(?:\s*(?:-|–|to|and|thru|through)\s*(?:19|20)\d{2})?\s*\+?(?:\s*(?:or|and)\s*(?:newer|older|earlier))?/gi,
  );
  if (numeric.zip)
    consume(
      new RegExp(
        `\\b(?:near|zip|around|in|by|of)?\\s*:?\\s*${numeric.zip}\\b`,
        "gi",
      ),
    );
  if (numeric.state)
    consume(
      new RegExp(
        `\\b(?:(?:in|state|near)\\s*:?\\s*)?(?:${escape(US_STATES[numeric.state]?.[0] || "")}|${numeric.state})\\b`,
        "gi",
      ),
    );
  remaining = remaining
    .replace(
      /\b(?:and|with|for|a|an|the|please|find|show|me|cars?|vehicles?|listings?)\b/gi,
      " ",
    )
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/\d/.test(remaining)) {
    result.blocked = true;
    result.warnings.push(
      "A number could not be converted safely. Use explicit price, mileage, model-year or location units.",
    );
  }
  if (remaining) {
    result.filters.q = remaining;
    result.labels.push(`Literal keywords: ${remaining}`);
    result.warnings.push(
      "Unconverted words stay literal keywords. History, equipment and lifestyle suitability are not inferred.",
    );
  } else result.filters.q = "";
  return result;
}
