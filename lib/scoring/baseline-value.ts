// Free, offline baseline resale estimate (no paid API). Segment new-value × an age depreciation
// curve × a mileage adjustment. Used two ways in the analyzer: as the resale estimate when we have
// no trustworthy comps (instead of the old circular ask×1.25), and as a SANITY GATE so a single
// outlier comp (e.g. a $42k Shelby polluting base-V6 "Mustang") can't set a wild resale value.
// Pure + deterministic.

type Segment =
  | "fullsize_truck"
  | "midsize_truck"
  | "fullsize_suv"
  | "midsize_suv"
  | "compact_suv"
  | "sports"
  | "luxury"
  | "minivan"
  | "sedan";

const BASE_NEW: Record<Segment, number> = {
  fullsize_truck: 42000,
  midsize_truck: 32000,
  fullsize_suv: 48000,
  midsize_suv: 34000,
  compact_suv: 26000,
  sports: 34000,
  luxury: 40000,
  minivan: 33000,
  sedan: 24000,
};

const SEGMENT_CURVES: Record<Segment, number[]> = {
  // Year 1, Year 2-3, Year 4-6, Year 7+ depreciation rates
  fullsize_truck: [0.12, 0.08, 0.06, 0.05],
  midsize_truck: [0.1, 0.07, 0.06, 0.05],
  fullsize_suv: [0.15, 0.1, 0.08, 0.07],
  midsize_suv: [0.16, 0.11, 0.09, 0.08],
  compact_suv: [0.16, 0.12, 0.1, 0.08],
  sports: [0.14, 0.09, 0.07, 0.06],
  luxury: [0.22, 0.15, 0.12, 0.1],
  minivan: [0.18, 0.12, 0.1, 0.08],
  sedan: [0.18, 0.13, 0.11, 0.09],
};

const TITLE_MULTIPLIERS: Record<string, number> = {
  clean: 1.0,
  clear: 1.0,
  salvage: 0.55,
  rebuilt: 0.65,
  junk: 0.3,
  parts: 0.3,
  flood: 0.4,
  hail: 0.85,
};

const has = (s: string, ...needles: string[]) =>
  needles.some((n) => s.includes(n));

export function classifySegment(make: string, model: string): Segment {
  const m = (model || "").toLowerCase();
  const mk = (make || "").toLowerCase();

  if (
    has(
      m,
      "f-250",
      "f250",
      "f-350",
      "f350",
      "f-150",
      "f150",
      "silverado 1500",
      "silverado",
      "sierra",
      "ram 1500",
      "ram 2500",
      "ram 3500",
      "tundra",
      "titan",
    )
  )
    return has(m, "250", "350", "2500", "3500", "hd")
      ? "fullsize_truck"
      : "fullsize_truck";
  if (
    has(
      m,
      "tacoma",
      "ranger",
      "colorado",
      "canyon",
      "frontier",
      "ridgeline",
      "gladiator",
    )
  )
    return "midsize_truck";
  if (
    has(
      m,
      "sequoia",
      "tahoe",
      "suburban",
      "yukon",
      "expedition",
      "navigator",
      "escalade",
      "armada",
      "wagoneer",
    )
  )
    return "fullsize_suv";
  if (
    has(
      m,
      "4runner",
      "pilot",
      "highlander",
      "explorer",
      "grand cherokee",
      "traverse",
      "durango",
      "pathfinder",
      "telluride",
      "palisade",
      "tahoe",
    )
  )
    return "midsize_suv";
  if (
    has(
      m,
      "rav4",
      "cr-v",
      "crv",
      "escape",
      "rogue",
      "equinox",
      "tucson",
      "sportage",
      "cx-5",
      "forester",
      "wrangler",
    )
  )
    return "compact_suv";
  if (
    has(
      m,
      "mustang",
      "camaro",
      "corvette",
      "challenger",
      "charger",
      "supra",
      "gt-r",
      "miata",
      "86",
      "brz",
    )
  )
    return "sports";
  if (has(m, "odyssey", "sienna", "pacifica", "carnival", "grand caravan"))
    return "minivan";
  if (
    has(
      mk,
      "bmw",
      "mercedes",
      "audi",
      "lexus",
      "porsche",
      "cadillac",
      "lincoln",
      "jaguar",
      "land rover",
      "infiniti",
      "acura",
    )
  )
    return "luxury";
  return "sedan";
}

// Trim tier → a multiplier on the segment baseline, so a Shelby/Raptor isn't valued like a base V6,
// and a work truck isn't valued like a loaded one. Coarse but trim-aware; pure.
const PERF =
  /\b(shelby|gt500|gt350|raptor|hellcat|redeye|trackhawk|srt|scat ?pack|trd ?pro|rubicon|denali|platinum|king ranch|high country|limited|laramie|type ?r|type ?s|amg|sahara|z71|zr2)\b/i;
const BASE_TRIM =
  /\b(base|work ?truck|tradesman|fleet|ls|se|sv|standard|value)\b/i;

export function trimTierMultiplier(trim?: unknown): number {
  // Defensive: a scraper can hand us a non-string trim (e.g. an object) — coerce so one bad row
  // can't crash the whole scoring batch.
  const t = (typeof trim === "string" ? trim : "").toLowerCase();
  if (!t) return 1;
  if (PERF.test(t)) return 1.25;
  if (BASE_TRIM.test(t)) return 0.88;
  return 1;
}

/** Realistic resale value from age + mileage (+ trim tier), no external data. */
export function estimateBaselineValue(
  year: number | null | undefined,
  make: string | null | undefined,
  model: string | null | undefined,
  mileage?: number | null,
  trim?: string | null,
  titleType?: string | null,
): number {
  if (!year || year < 1950) return 0;
  const seg = classifySegment(make || "", model || "");
  let value = BASE_NEW[seg] * trimTierMultiplier(trim);

  const nowYear = new Date().getFullYear();
  const age = Math.max(0, Math.min(25, nowYear - year));
  const curve = SEGMENT_CURVES[seg];

  for (let i = 0; i < age; i++) {
    const rate =
      i === 0
        ? curve[0]
        : i <= 2
          ? curve[1]
          : i <= 5
            ? curve[2]
            : i <= 13
              ? curve[3]
              : // 14+ years: the gentle long-term rate left 20-yr-old trucks "worth" ~$11k. Real old
                // vehicles slide toward residual faster — but keep it modest so mid-age cars aren't
                // cratered (the comp engine, not the baseline, carries popular cars).
                curve[3] * 1.4;
    value *= 1 - rate;
  }

  // Residual floor: the compounding curve can OVER-depreciate a mid-age car (a clean 8-yr-old crossover
  // shouldn't read as $10k). Floor the clean value at a conservative age-residual of its base so the
  // baseline doesn't under-value when comps are thin. Two-stage: gentle to 12 yrs (helps mid-age), then
  // steep — so it does NOT prop up 20-yr-old vehicles (whose floor would loosen their comp cap and
  // re-inflate them). Title + mileage adjustments still cut below this.
  const residual =
    age <= 12
      ? Math.pow(0.92, age)
      : Math.pow(0.92, 12) * Math.pow(0.8, age - 12);
  value = Math.max(value, BASE_NEW[seg] * trimTierMultiplier(trim) * residual);

  // Title adjustment
  const tType = (titleType || "clean").toLowerCase();
  let titleMult = 1.0;
  for (const [key, mult] of Object.entries(TITLE_MULTIPLIERS)) {
    if (tType.includes(key)) {
      titleMult = mult;
      break;
    }
  }
  value *= titleMult;

  // Mileage adjustment. CAP the "expected" miles — otherwise a 23-yr-old car is assumed to tolerate
  // 23×13k = 299k miles, so a 186k clunker reads as LOW mileage and dodges any penalty. Cap at 130k so
  // high-mileage old vehicles actually get docked (~4% of value per 10k excess).
  if (mileage && mileage > 0) {
    const expected = Math.min(age * 13000, 130000);
    const excess = mileage - expected;
    if (excess > 0) value -= (excess / 10000) * value * 0.04;
  } else if (age >= 12) {
    // Missing mileage on an old vehicle: don't hand it full value — assume average-high wear.
    value *= 0.9;
  }

  return Math.max(1200, Math.round(value));
}
