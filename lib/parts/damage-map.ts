// lib/parts/damage-map.ts
// Damage → parts intelligence. A teardown estimate is only honest if it accounts for WHAT got
// destroyed: a flood car's electronics are worthless, a front-collision car's drivetrain often
// isn't. This maps a vehicle's damage to a per-part-category value factor so the part-out estimate
// reflects what's actually saleable — and flags the high-value survivors worth pulling first.

export type PartCategory =
  | "engine"
  | "transmission"
  | "body"
  | "interior"
  | "electronics"
  | "suspension"
  | "brakes"
  | "wheels"
  | "other";

export type PartStatus = "intact" | "in-demand" | "discounted" | "scrap";

// factor multiplies a part's estimated value; status drives UI labeling.
interface CategoryEffect {
  factor: number;
  status: PartStatus;
}

const INTACT: CategoryEffect = { factor: 1, status: "intact" };
const BOOST: CategoryEffect = { factor: 1.15, status: "in-demand" };
const DISCOUNT: CategoryEffect = { factor: 0.45, status: "discounted" };
const SCRAP: CategoryEffect = { factor: 0.05, status: "scrap" };

// Per damage class, the categories that deviate from "intact". Anything unlisted stays intact.
const DAMAGE_EFFECTS: Record<
  string,
  Partial<Record<PartCategory, CategoryEffect>>
> = {
  flood: {
    electronics: SCRAP,
    interior: SCRAP,
    engine: DISCOUNT,
    transmission: DISCOUNT,
    brakes: DISCOUNT,
    body: BOOST,
    wheels: BOOST,
    suspension: INTACT,
  },
  water: {
    electronics: SCRAP,
    interior: SCRAP,
    engine: DISCOUNT,
    transmission: DISCOUNT,
    brakes: DISCOUNT,
    body: BOOST,
    wheels: BOOST,
  },
  fire: {
    interior: SCRAP,
    electronics: SCRAP,
    engine: DISCOUNT,
    body: DISCOUNT,
    transmission: DISCOUNT,
    suspension: BOOST,
    wheels: BOOST,
    brakes: INTACT,
  },
  hail: {
    body: DISCOUNT,
    engine: BOOST,
    transmission: BOOST,
    interior: INTACT,
    electronics: INTACT,
    wheels: BOOST,
  },
  front: {
    body: DISCOUNT,
    engine: DISCOUNT,
    electronics: DISCOUNT,
    transmission: BOOST,
    interior: BOOST,
    wheels: BOOST,
    suspension: DISCOUNT,
  },
  rear: {
    body: DISCOUNT,
    engine: BOOST,
    transmission: BOOST,
    interior: BOOST,
    electronics: INTACT,
    suspension: INTACT,
  },
  side: {
    body: DISCOUNT,
    interior: DISCOUNT,
    engine: BOOST,
    transmission: BOOST,
    wheels: BOOST,
  },
  frame: {
    body: DISCOUNT,
    suspension: DISCOUNT,
    engine: BOOST,
    transmission: BOOST,
    interior: BOOST,
    electronics: BOOST,
    wheels: BOOST,
  },
  rollover: {
    body: SCRAP,
    interior: DISCOUNT,
    engine: BOOST,
    transmission: BOOST,
    wheels: BOOST,
  },
  vandalism: {
    electronics: DISCOUNT,
    interior: DISCOUNT,
    body: DISCOUNT,
    engine: INTACT,
    transmission: INTACT,
  },
  theft: {
    electronics: DISCOUNT,
    interior: DISCOUNT,
    wheels: DISCOUNT,
    engine: INTACT,
    transmission: INTACT,
  },
  hail_damage: { body: DISCOUNT, engine: BOOST },
  mechanical: {
    engine: DISCOUNT,
    transmission: DISCOUNT,
    body: BOOST,
    interior: BOOST,
    electronics: BOOST,
    wheels: BOOST,
  },
};

// Map a free-text damage_type string to one of the known damage classes.
function classifyDamage(damageType?: string | null): string | null {
  const d = (damageType || "").toLowerCase();
  if (!d || d === "none" || d === "normal wear") return null;
  if (d.includes("flood") || d.includes("water")) return "flood";
  if (d.includes("fire") || d.includes("burn")) return "fire";
  if (d.includes("hail")) return "hail";
  if (d.includes("front") || d.includes("frontal")) return "front";
  if (d.includes("rear")) return "rear";
  if (d.includes("side") || d.includes("left") || d.includes("right"))
    return "side";
  if (
    d.includes("frame") ||
    d.includes("structural") ||
    d.includes("undercarriage")
  )
    return "frame";
  if (d.includes("rollover") || d.includes("roll over") || d.includes("roof"))
    return "rollover";
  if (d.includes("vandal")) return "vandalism";
  if (d.includes("theft") || d.includes("stripped")) return "theft";
  if (d.includes("mechanical") || d.includes("engine") || d.includes("blown"))
    return "mechanical";
  if (d.includes("all over") || d.includes("total")) return "rollover";
  return null;
}

/**
 * Value factor + saleability status for a part category given the vehicle's damage. Returns a
 * neutral (intact) effect when damage is unknown — never penalizes on missing data.
 */
export function damageEffect(
  category: PartCategory,
  damageType?: string | null,
): CategoryEffect {
  const cls = classifyDamage(damageType);
  if (!cls) return INTACT;
  const effects = DAMAGE_EFFECTS[cls];
  return effects?.[category] ?? INTACT;
}

/** Human-readable note for the teardown UI. */
export function damageSummary(damageType?: string | null): string | null {
  const cls = classifyDamage(damageType);
  if (!cls) return null;
  const effects = DAMAGE_EFFECTS[cls];
  const scrap = Object.entries(effects)
    .filter(([, e]) => e.status === "scrap")
    .map(([c]) => c);
  const inDemand = Object.entries(effects)
    .filter(([, e]) => e.status === "in-demand")
    .map(([c]) => c);
  const parts: string[] = [];
  if (inDemand.length)
    parts.push(`high-demand survivors: ${inDemand.join(", ")}`);
  if (scrap.length) parts.push(`likely scrap: ${scrap.join(", ")}`);
  return parts.length ? `${cls} damage — ${parts.join("; ")}.` : null;
}
