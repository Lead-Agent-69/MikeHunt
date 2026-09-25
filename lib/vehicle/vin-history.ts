// lib/vehicle/vin-history.ts
// VIN history — the missing "should I buy" piece (prior salvage/accidents/title brands). There is no
// free ANONYMOUS authoritative source (NMVTIS is provider-gated, salvage-auction sites are Cloudflare-
// walled), so this is TIERED with fallbacks so we always have an answer:
//   Tier 1 (free, always)   — mine the listing text + our condition/damage for title brands + clean-
//                             history claims. Catches what the seller disclosed; $0, instant.
//   Tier 2 (key-gated)      — VinAudit NMVTIS API: authoritative brands/total-loss/theft/odometer.
//   Tier 3 (FlareSolverr)   — salvage-auction history (was this VIN at Copart/IAA) — future.
// The point: a flipper instantly sees the red flags, and the authoritative report layers in when a
// key is set — never a hard dependency on one source.

export interface VinHistory {
  source: "nmvtis" | "vin-graph" | "listing-text" | "none";
  authoritative: boolean; // true only for NMVTIS — UI should label estimates as "claimed"
  titleBrands: string[]; // red flags found (salvage, rebuilt, flood, …)
  cleanClaims: string[]; // "no accidents", "clean Carfax", "1 owner" (claimed unless authoritative)
  owners?: number;
  note: string;
}

// The abstraction: we watch the WHOLE market at once, so our own scrape records ARE a history report
// no single-site service has. If a VIN ever showed up at a salvage auction, or was listed as
// rebuilt/branded, or had recorded damage — in ANY past sighting across ANY channel — that's a real
// flag, even when the current listing claims "clean". Free, unique, and it compounds with every scrape.
const AUCTION_SRC: Record<string, string> = {
  copart: "Copart salvage auction",
  iaa: "IAA salvage auction",
  adesa: "ADESA auction",
  manheim: "Manheim auction",
  acv: "ACV auction",
  gov_auction: "government auction",
};

export interface VinSighting {
  source?: string | null;
  condition?: string | null;
  damage_type?: string | null;
  mileage?: number | null;
  created_at?: string | null;
  location_state?: string | null;
}

// A sighting is "branded" if its condition/damage marks it as anything but a clean retail car.
const BRANDED_RE = /salvage|rebuilt|reconstruct|flood|fire|junk|parts|hail|wreck|prior salvage/;
function isBrandedSighting(r: VinSighting): boolean {
  const cond = (r.condition || "").toLowerCase();
  const dmg = (r.damage_type || "").toLowerCase();
  return (
    BRANDED_RE.test(cond) ||
    !!AUCTION_SRC[(r.source || "").toLowerCase().trim()] ||
    (dmg !== "" && dmg !== "none" && dmg !== "unknown")
  );
}
function isCleanClaim(r: VinSighting): boolean {
  const cond = (r.condition || "").toLowerCase();
  const dmg = (r.damage_type || "").toLowerCase();
  return /clean/.test(cond) && !BRANDED_RE.test(cond) && (dmg === "" || dmg === "none");
}

const mi = (v: unknown) => Number(v) || 0;

/** Cross-reference a VIN against our own multi-channel sightings → prior-salvage / branded flags +
 *  ODOMETER ROLLBACK (a later sighting reporting fewer miles than an earlier one). Only our
 *  multi-sighting data catches rollback for free. */
export function sightingsToHistory(rows: VinSighting[]): VinHistory | null {
  if (!rows?.length) return null;
  const flags = new Set<string>();
  for (const r of rows) {
    const src = (r.source || "").toLowerCase().trim();
    const cond = (r.condition || "").toLowerCase();
    const dmg = (r.damage_type || "").toLowerCase();
    if (AUCTION_SRC[src]) flags.add(`Previously at ${AUCTION_SRC[src]}`);
    if (/salvage|junk|parts/.test(cond))
      flags.add("Prior salvage (our records)");
    if (/flood/.test(cond)) flags.add("Prior flood (our records)");
    if (/\bfire\b/.test(cond)) flags.add("Prior fire (our records)");
    if (/rebuilt/.test(cond)) flags.add("Previously listed rebuilt");
    if (dmg && dmg !== "none" && dmg !== "unknown")
      flags.add(`Recorded damage: ${dmg}`);
  }

  // Odometer rollback: order sightings by time; if a later one reports materially FEWER miles than an
  // earlier one (>5k, beyond listing noise), the odometer was rolled back. A fraud catch competitors
  // can't do free — it needs seeing the same VIN twice, which only our market-wide scraping does.
  const timed = rows
    .filter((r) => mi(r.mileage) > 0 && r.created_at)
    .sort(
      (a, b) =>
        new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime(),
    );
  let peak = 0;
  for (const r of timed) {
    const m = mi(r.mileage);
    if (peak - m > 5000)
      flags.add(
        `Odometer rollback suspected (${peak.toLocaleString()} → ${m.toLocaleString()} mi)`,
      );
    peak = Math.max(peak, m);
  }

  // TITLE WASHING — the headline fraud catch. A VIN that was branded (salvage/auction/damage) in an
  // earlier sighting but is later listed as "clean" had its title laundered (often re-titled across a
  // lenient state). No single-site report can see this; only watching the whole market over time can.
  const byTime = rows
    .filter((r) => r.created_at)
    .sort(
      (a, b) =>
        new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime(),
    );
  let sawBranded = false;
  for (const r of byTime) {
    if (isBrandedSighting(r)) sawBranded = true;
    else if (sawBranded && isCleanClaim(r))
      flags.add(
        "⚠️ Possible title washing — branded in an earlier sighting, now listed clean",
      );
  }

  // Cross-state movement — a branded car retitled in another state is the classic washing route. On its
  // own it's mild; alongside a brand flag it strengthens the case.
  const states = new Set(
    rows.map((r) => (r.location_state || "").toUpperCase().trim()).filter(Boolean),
  );
  if (states.size > 1 && sawBranded)
    flags.add(`Seen branded then moved across states (${Array.from(states).join(" → ")})`);

  if (!flags.size) return null;
  return {
    source: "vin-graph",
    authoritative: false,
    titleBrands: Array.from(flags),
    cleanClaims: [],
    note: `Cross-referenced across ${rows.length} sighting${rows.length === 1 ? "" : "s"} in our multi-channel records — a signal no single-site report sees.`,
  };
}

// Turn VIN-graph flags into a DECISION, not decoration. The useful catch is MISREPRESENTATION: the live
// listing claims clean/good, but our cross-market records say the car was branded, washed, or rolled
// back. That's a trap — the dealer would pay clean-car money for a salvage car — so it must demote the
// verdict + warn, not just show a badge. A car that already DISCLOSES its brand isn't misrepresented
// (the price reflects it); we only fire when the listing hides the history.
export function graphRisk(
  currentCondition: string | null | undefined,
  flags: string[],
): { misrepresented: boolean; severity: "high" | "info"; warning?: string } {
  const cond = (currentCondition || "").toLowerCase();
  const currentClean = /clean/.test(cond) && !/salvage|rebuilt|flood|fire/.test(cond);
  const f = flags.join(" ").toLowerCase();
  const washing = /washing/.test(f);
  const rollback = /rollback/.test(f);
  const branded = /salvage|rebuilt|flood|\bfire\b|junk|auction|damage|across states/.test(f);
  if (rollback)
    return {
      misrepresented: true,
      severity: "high",
      warning: "Odometer rollback suspected from our multi-sighting records.",
    };
  if (currentClean && (washing || branded))
    return {
      misrepresented: true,
      severity: "high",
      warning: washing
        ? "VIN history shows this 'clean' car was previously branded — possible title washing."
        : "VIN history shows prior salvage/branded records that contradict the clean listing.",
    };
  return { misrepresented: false, severity: "info" };
}

// Title-brand red flags (ordered most→least severe). Source text is title + condition + damage + notes.
const BRANDS: Array<[RegExp, string]> = [
  [
    /\bjunk\b|certificate of destruction|\bcod\b/i,
    "Junk / certificate of destruction",
  ],
  [/\bsalvage(d)?\b|salvage_title/i, "Salvage title"],
  [/flood|water damage/i, "Flood damage"],
  [/\bfire\b|burn(t|ed)?/i, "Fire damage"],
  [/lemon|manufacturer buyback|\bbuyback\b/i, "Lemon / manufacturer buyback"],
  [/rebuilt|reconstructed|restored title/i, "Rebuilt / reconstructed"],
  [
    /prior salvage|previously salvage|branded title|salvage history/i,
    "Prior salvage / branded",
  ],
  [/frame damage|bent frame|structural damage/i, "Frame / structural damage"],
  [
    /odometer (rollback|discrepancy|tamper|problem)|true mileage unknown|\btmu\b|not actual miles/i,
    "Odometer issue",
  ],
  [/\bhail\b/i, "Hail damage"],
  [/theft recovery|recovered theft|stolen/i, "Theft recovery"],
];

/** Tier 1: history signals straight from the listing text we already have. Free, instant. */
export function historyFromText(parts: {
  title?: string | null;
  condition?: string | null;
  damageType?: string | null;
  notes?: string | null;
}): VinHistory {
  const hay = [parts.title, parts.condition, parts.damageType, parts.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const titleBrands = BRANDS.filter(([rx]) => rx.test(hay)).map(([, l]) => l);

  const cleanClaims: string[] = [];
  if (/clean (title|carfax|autocheck|history)/.test(hay))
    cleanClaims.push("Clean title/Carfax claimed");
  if (/no accidents|accident[-\s]?free|never wrecked/.test(hay))
    cleanClaims.push("No accidents claimed");
  if (/carfax (available|certified|report)/.test(hay))
    cleanClaims.push("Carfax available");

  let owners: number | undefined;
  const m = hay.match(/\b(\d)[\s-]*owner/);
  if (m) owners = parseInt(m[1], 10);
  else if (/\bone[\s-]?owner\b/.test(hay)) owners = 1;
  if (owners)
    cleanClaims.push(`${owners} owner${owners > 1 ? "s" : ""} claimed`);

  return {
    source: titleBrands.length || cleanClaims.length ? "listing-text" : "none",
    authoritative: false,
    titleBrands,
    cleanClaims,
    owners,
    note:
      titleBrands.length || cleanClaims.length
        ? "From the listing — a paid NMVTIS report confirms title brands & accidents."
        : "No history disclosed in the listing — run a full report to be sure.",
  };
}

const num = (v: unknown) =>
  Number(String(v ?? "").replace(/[^0-9.]/g, "")) || 0;

/** Tier 2: VinAudit NMVTIS — authoritative. Gated on VINAUDIT_KEY (+ VINAUDIT_ID); null when unset. */
export async function fetchNmvtis(vin: string): Promise<VinHistory | null> {
  const key = process.env.VINAUDIT_KEY;
  const id = process.env.VINAUDIT_ID || "DEMO";
  if (!key || !vin || vin.length !== 17) return null;
  try {
    const res = await fetch(
      `https://api.vinaudit.com/v2/query?key=${key}&id=${encodeURIComponent(id)}&vin=${vin}&format=json`,
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    if (j?.success === false) return null;

    const brandRecs: any[] = j?.brandrecords || j?.brands || [];
    const titleRecs: any[] = j?.titlerecords || [];
    const jsiRecs: any[] = j?.jsirecords || []; // junk/salvage/insurance (total-loss)

    const titleBrands = Array.from(
      new Set(
        [
          ...brandRecs.map((b) => String(b?.brand || b?.type || "").trim()),
          ...jsiRecs.map(
            (r) => `${r?.reportingentitytype || "Salvage"} total-loss record`,
          ),
        ].filter(Boolean),
      ),
    );
    // Distinct title states ≈ owner/registration changes (a rough but real owner signal).
    const owners =
      titleRecs.length > 0
        ? new Set(titleRecs.map((t) => `${t?.state}|${t?.date}`)).size
        : undefined;

    return {
      source: "nmvtis",
      authoritative: true,
      titleBrands,
      cleanClaims:
        titleBrands.length === 0 ? ["No title brands on record"] : [],
      owners,
      note: `NMVTIS report · ${titleRecs.length} title record${titleRecs.length === 1 ? "" : "s"}${
        num(j?.checks?.salvage) ? " · salvage flagged" : ""
      }`,
    };
  } catch {
    return null;
  }
}

/** Combined resolver: authoritative NMVTIS when a key is set, else the free listing-text tier. */
export async function getVinHistory(deal: {
  vin?: string | null;
  title?: string | null;
  condition?: string | null;
  damageType?: string | null;
  notes?: string | null;
}): Promise<VinHistory> {
  if (deal.vin && deal.vin.length === 17) {
    const nm = await fetchNmvtis(deal.vin);
    if (nm) return nm;
  }
  return historyFromText(deal);
}
