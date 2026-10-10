import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { orderCuratedSitesForPlan, type CuratedSite } from "./curated-sites";

export interface CuratedRotation {
  version: 1;
  lastAttempted: Record<string, number>;
}

export function curatedSiteKey(site: Pick<CuratedSite, "url">) {
  return new URL(site.url).hostname.toLowerCase().replace(/^www\./, "");
}

export function planCuratedRotation<
  T extends Pick<CuratedSite, "url" | "state">,
>(
  sites: readonly T[],
  rotation: CuratedRotation,
  states: readonly string[] = [],
): T[] {
  // Demand wins ties, but cannot indefinitely starve older or never-attempted dealers.
  return orderCuratedSitesForPlan(sites, states)
    .map((site, rank) => ({ site, rank }))
    .sort(
      (a, b) =>
        (rotation.lastAttempted[curatedSiteKey(a.site)] || 0) -
          (rotation.lastAttempted[curatedSiteKey(b.site)] || 0) ||
        a.rank - b.rank,
    )
    .map(({ site }) => site);
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
    return { version: 1, lastAttempted } as CuratedRotation;
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
