/** Shared, evidence-only categories for source text, search predicates and facet counts. */
const word = (pattern: string) =>
  `(?:^|[^a-z0-9])(?:${pattern})(?:$|[^a-z0-9])`;
const fuel = {
  PHEV: word(
    "phev|plug[ -]?in[ -]?(?:hybrid|electric hybrid)|hybrid[ -]?plug[ -]?in",
  ),
  Hybrid: word(
    "hev|hybrid|(?:gas(?:oline)?|diesel)[ /+-]+electric|electric[ /+-]+(?:gas(?:oline)?|diesel)",
  ),
  Electric: word("bev|ev|electric|electricity"),
  "Flex fuel": word(
    "flex[ -]?fuel|ffv|e[ -]?85|gas(?:oline)?[ /+-]+ethanol|ethanol[ /+-]+gas(?:oline)?",
  ),
  Diesel: word("diesel"),
  Gas: word("gas(?:oline)?|petrol|unleaded"),
};
const transmission = {
  DCT: word("dct|dsg|pdk|dual[ -]?clutch"),
  CVT: word("e[ -]?cvt|cvt|continuously[ -]?variable"),
  Automatic: word(
    "automatic|auto|a[ /-]?t|[1-9][ -]?at|a[1-9]|automated[ -]?manual|amt",
  ),
  Manual: word("manual|stick(?:[ -]?shift)?|m[ /-]?t|[1-9][ -]?mt|m[1-9]"),
};
const drivetrain = {
  AWD: word("awd|all[ -]?wheel(?:[ -]?drive)?"),
  "4WD": word(
    "4wd|4[ -]?x[ -]?4|four[ -]?wheel(?:[ -]?drive)?|4[ -]?wheel(?:[ -]?drive)?",
  ),
  FWD: word("fwd|front[ -]?wheel(?:[ -]?drive)?"),
  RWD: word("rwd|rear[ -]?wheel(?:[ -]?drive)?"),
};

type Rule = { value: string; pattern: string; exclude?: string };
const except = (...patterns: string[]) =>
  patterns.map((pattern) => `(?:${pattern})`).join("|");
const rules: Record<VehicleSpecKey, Rule[]> = {
  fuelType: [
    { value: "PHEV", pattern: fuel.PHEV },
    { value: "Hybrid", pattern: fuel.Hybrid, exclude: fuel.PHEV },
    {
      value: "Electric",
      pattern: fuel.Electric,
      exclude: except(
        fuel.PHEV,
        fuel.Hybrid,
        fuel["Flex fuel"],
        fuel.Diesel,
        fuel.Gas,
      ),
    },
    {
      value: "Flex fuel",
      pattern: fuel["Flex fuel"],
      exclude: except(fuel.PHEV, fuel.Hybrid, fuel.Electric, fuel.Diesel),
    },
    {
      value: "Diesel",
      pattern: fuel.Diesel,
      exclude: except(
        fuel.PHEV,
        fuel.Hybrid,
        fuel.Electric,
        fuel["Flex fuel"],
        fuel.Gas,
      ),
    },
    {
      value: "Gas",
      pattern: fuel.Gas,
      exclude: except(
        fuel.PHEV,
        fuel.Hybrid,
        fuel.Electric,
        fuel["Flex fuel"],
        fuel.Diesel,
      ),
    },
  ],
  transmission: [
    { value: "DCT", pattern: transmission.DCT },
    { value: "CVT", pattern: transmission.CVT, exclude: transmission.DCT },
    {
      value: "Automatic",
      pattern: transmission.Automatic,
      exclude: except(transmission.DCT, transmission.CVT),
    },
    {
      value: "Manual",
      pattern: transmission.Manual,
      exclude: except(
        transmission.DCT,
        transmission.CVT,
        transmission.Automatic,
      ),
    },
  ],
  drivetrain: Object.entries(drivetrain).map(([value, pattern]) => ({
    value,
    pattern,
    exclude: except(
      ...Object.entries(drivetrain)
        .filter(([other]) => other !== value)
        .map(([, other]) => other),
    ),
  })),
};
export type VehicleSpecKey = "fuelType" | "transmission" | "drivetrain";
export const VEHICLE_SPEC_OPTIONS = {
  fuelType: ["Gas", "Diesel", "Hybrid", "PHEV", "Electric", "Flex fuel"],
  transmission: ["Automatic", "Manual", "CVT", "DCT"],
  drivetrain: ["AWD", "4WD", "FWD", "RWD"],
} as const;

const UNKNOWN_SPEC =
  "^[ ]*(?:unknown|not[ -]?reported|not[ -]?specified|n/?a|none)?[ ]*$";
const unknownSpec = new RegExp(UNKNOWN_SPEC, "i");
const compiledRules = Object.fromEntries(
  Object.entries(rules).map(([key, entries]) => [
    key,
    entries.map((rule) => ({
      value: rule.value,
      pattern: new RegExp(rule.pattern, "i"),
      exclude: rule.exclude ? new RegExp(rule.exclude, "i") : undefined,
    })),
  ]),
) as Record<
  VehicleSpecKey,
  { value: string; pattern: RegExp; exclude?: RegExp }[]
>;

export function normalizeVehicleSpec(
  key: VehicleSpecKey,
  raw: unknown,
  fallback?: unknown,
): string | undefined {
  for (const text of [raw, fallback]) {
    if (typeof text !== "string") continue;
    const match = compiledRules[key].find(
      (rule) =>
        rule.pattern.test(text) && (!rule.exclude || !rule.exclude.test(text)),
    );
    if (match) return match.value;
    if (text === raw && !unknownSpec.test(text)) return undefined;
  }
  return undefined;
}

/** Fixed allowlisted regexes only; the caller never supplies PostgREST grammar. */
export function vehicleSpecPredicate(
  key: VehicleSpecKey,
  value: string,
): string | undefined {
  const rule = rules[key].find((entry) => entry.value === value);
  if (!rule) return undefined;
  const column = {
    fuelType: "fuel_type",
    transmission: "transmission",
    drivetrain: "drivetrain",
  }[key];
  const match = (field: string, entry: Rule) => {
    const parts = [`${field}.imatch.${JSON.stringify(entry.pattern)}`];
    if (entry.exclude)
      parts.push(`${field}.not.imatch.${JSON.stringify(entry.exclude)}`);
    return parts.length > 1 ? `and(${parts.join(",")})` : parts[0];
  };
  // A recognized primary report wins over a contradictory fallback in options.
  return [
    match(column, rule),
    `and(or(${column}.is.null,${column}.imatch.${JSON.stringify(UNKNOWN_SPEC)}),${match(`options->>${key}`, rule)})`,
  ].join(",");
}
