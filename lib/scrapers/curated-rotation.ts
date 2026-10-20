import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { nearbyStates } from "@/lib/geo/us-states";
import { orderCuratedSitesForPlan, type CuratedSite } from "./curated-sites";

export interface CuratedRotation {
  version: 1;
  lastAttempted: Record<string, number>;
  /** Started attempt slots since the last wider-market slot; retained across restarts. */
  preferredStreak?: number;
}

export function curatedSiteKey(site: Pick<CuratedSite, "url">) {
  return new URL(site.url).hostname.toLowerCase().replace(/^www\./, "");
}

/** Prefer actual buyer anchors, not the sweep's additional national-coverage slots. */
export function curatedPriorityStates(plan?: {
  states?: unknown;
  demandStates?: unknown;
}) {
  const planned = (Array.isArray(plan?.states) ? plan.states : []).filter(
    (state): state is string =>
      typeof state === "string" && /^[A-Z]{2}$/.test(state),
  );
  const demand = (
    Array.isArray(plan?.demandStates) ? plan.demandStates : []
  ).filter(
    (state): state is string =>
      typeof state === "string" && planned.includes(state),
  );
  return demand.length ? Array.from(new Set(demand)) : planned;
}

export function planCuratedRotation<
  T extends Pick<CuratedSite, "url" | "state">,
>(
  sites: readonly T[],
  rotation: CuratedRotation,
  states: readonly string[] = [],
): T[] {
  const ordered = orderCuratedSitesForPlan(sites, states)
    .map((site, rank) => ({ site, rank }))
    .sort(
      (a, b) =>
        (rotation.lastAttempted[curatedSiteKey(a.site)] || 0) -
          (rotation.lastAttempted[curatedSiteKey(b.site)] || 0) ||
        a.rank - b.rank,
    )
    .map(({ site }) => site);
  const preferredStates = new Set(states.map((state) => state.toUpperCase()));
  if (!preferredStates.size) return ordered;
  const preferred = ordered.filter((site) =>
    preferredStates.has(site.state || ""),
  );
  const wider = ordered.filter(
    (site) => !preferredStates.has(site.state || ""),
  );
  const result: T[] = [];
  let streak = validStreak(rotation.preferredStreak);
  let p = 0;
  let w = 0;
  // The head can be the only dealer attempted before the deadline. Persist its
  // slot, so short runs cannot repeatedly restart at the preferred-market head.
  while (p < preferred.length || w < wider.length) {
    if (p < preferred.length && (streak < 2 || w >= wider.length)) {
      result.push(preferred[p++]);
      streak = Math.min(2, streak + 1);
    } else {
      result.push(wider[w++]);
      streak = 0;
    }
  }
  return result;
}

function validStreak(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 2
    ? Number(value)
    : 0;
}

/** Charge attempted slots (including failures), never merely planned/deferred dealers. */
export function recordCuratedAttempt(
  rotation: CuratedRotation,
  site: Pick<CuratedSite, "url" | "state">,
  states: readonly string[],
  now = Date.now(),
) {
  rotation.lastAttempted[curatedSiteKey(site)] = now;
  if (states.length)
    rotation.preferredStreak = states.some(
      (state) => state.toUpperCase() === site.state,
    )
      ? Math.min(2, validStreak(rotation.preferredStreak) + 1)
      : 0;
}

export function curatedRotationPath() {
  return path.resolve(
    process.env.LOCAL_CACHE_PATH || path.join(process.cwd(), ".cache"),
    "curated-rotation.json",
  );
}

export async function loadCuratedRotation(
  file = curatedRotationPath(),
): Promise<CuratedRotation> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    if (
      parsed?.version !== 1 ||
      !parsed.lastAttempted ||
      typeof parsed.lastAttempted !== "object" ||
      Array.isArray(parsed.lastAttempted)
    )
      return { version: 1, lastAttempted: {} };
    const lastAttempted = Object.fromEntries(
      Object.entries(parsed.lastAttempted).filter(
        ([, value]) =>
          typeof value === "number" && Number.isFinite(value) && value > 0,
      ),
    );
    return {
      version: 1,
      lastAttempted,
      ...(parsed.preferredStreak !== undefined
        ? { preferredStreak: validStreak(parsed.preferredStreak) }
        : {}),
    } as CuratedRotation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn(
        "[CuratedSites] rotation read failed:",
        (error as Error).message,
      );
    return { version: 1, lastAttempted: {} };
  }
}

export async function saveCuratedRotation(
  rotation: CuratedRotation,
  file = curatedRotationPath(),
) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(rotation), { mode: 0o600 });
  await rename(tmp, file);
}

/**
 * States a buyer-scoped run asked for (location-demand kick: home + saved search states). Empty for
 * plain sweeps and for dealer-targeted runs, which keep the rotation order.
 */
export function scopeDemandStates(
  scope?: { state?: unknown; states?: unknown } | null,
): string[] {
  const raw = [
    ...(Array.isArray(scope?.states) ? scope.states : []),
    scope?.state,
  ];
  const out: string[] = [];
  for (const s of raw) {
    const st = String(s || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(st) && !out.includes(st)) out.push(st);
  }
  return out;
}

/** How many closest states (self included) form a demanded state's curated ring. */
export const CURATED_RING_SIZE = 4;

/**
 * Demanded states first (in the order the buyer gave them), then each one's nearest neighbours.
 * A dealer two hours over the state line is still a buyer's market.
 */
export function curatedRingStates(
  anchors: readonly string[],
  size = CURATED_RING_SIZE,
): string[] {
  const out = anchors.map((s) => s.toUpperCase());
  for (const anchor of out.slice()) {
    const near = Array.from(nearbyStates(anchor, size)).filter(
      (s) => s !== anchor,
    );
    for (const st of near) if (!out.includes(st)) out.push(st);
  }
  return out;
}

/**
 * Sites for a buyer-demand run: only dealers in the demanded states' rings, demanded states first,
 * least-recently-attempted first within a state. Membership is the registry's `state` tag, so a
 * newly added dealer joins its state's ring with no other wiring. Falls back to the normal rotation
 * when no curated dealer sits in the ring.
 */
export function selectCuratedSitesForDemand<
  T extends Pick<CuratedSite, "url" | "state">,
>(
  sites: readonly T[],
  rotation: CuratedRotation,
  anchors: readonly string[],
): T[] {
  const ring = curatedRingStates(anchors);
  const rank = new Map(ring.map((s, i) => [s, i]));
  const inRing = sites.filter((site) =>
    rank.has(String(site.state || "").toUpperCase()),
  );
  if (!inRing.length) return planCuratedRotation(sites, rotation, ring);
  const anchorSet = new Set(anchors.map((s) => s.toUpperCase()));
  const tier = (site: T) =>
    anchorSet.has(String(site.state || "").toUpperCase()) ? 0 : 1;
  return inRing
    .map((site, i) => ({ site, i }))
    .sort(
      (a, b) =>
        tier(a.site) - tier(b.site) ||
        (rotation.lastAttempted[curatedSiteKey(a.site)] || 0) -
          (rotation.lastAttempted[curatedSiteKey(b.site)] || 0) ||
        rank.get(String(a.site.state).toUpperCase())! -
          rank.get(String(b.site.state).toUpperCase())! ||
        a.i - b.i,
    )
    .map(({ site }) => site);
}
