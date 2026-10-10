import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_VERSION = 1;
const MAX_ITEM_IDS = 100_000;

/**
 * Cache scope for one Supabase project: its hostname ("qupzqpezslsbobhugswp.supabase.co" ->
 * "qupzqpezslsbobhugswp"). Ids written to a local or staging database must never hide sales from the
 * hosted one, which is what a single shared file did.
 */
export function soldCacheScope(supabaseUrl: string | undefined): string {
  try {
    const host = new URL(String(supabaseUrl || "")).hostname.toLowerCase();
    const label = host.endsWith(".supabase.co") ? host.split(".")[0] : host;
    return label.replace(/[^a-z0-9-]/g, "-").slice(0, 63) || "default";
  } catch {
    return "default";
  }
}

function cacheFile(scope?: string): string {
  const root = process.env.LOCAL_CACHE_PATH?.trim() || path.resolve(process.cwd(), ".cache");
  return path.join(root, scope ? `sold-item-ids.${scope}.json` : "sold-item-ids.json");
}

/** Load successfully persisted sale IDs. Missing or malformed cache files safely behave as empty. */
export async function loadSoldItemCache(scope?: string): Promise<Set<string>> {
  try {
    const raw = await readFile(cacheFile(scope), "utf8");
    const parsed = JSON.parse(raw) as { version?: number; itemIds?: unknown };
    if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.itemIds))
      return new Set();
    return new Set(
      parsed.itemIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      console.warn("[sold-cache] cache read failed; continuing without cache:", (error as Error).message);
    return new Set();
  }
}

/** Persist IDs only after the database accepted the corresponding upsert batch. */
export async function saveSoldItemCache(
  itemIds: Iterable<string>,
  scope?: string,
): Promise<void> {
  const file = cacheFile(scope);
  const directory = path.dirname(file);
  const ids = Array.from(new Set(itemIds)).filter(Boolean).slice(-MAX_ITEM_IDS);
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(
      temporary,
      JSON.stringify({ version: CACHE_VERSION, itemIds: ids }),
      "utf8",
    );
    await rename(temporary, file);
  } catch (error) {
    console.warn("[sold-cache] cache write failed; database data is still saved:", (error as Error).message);
  }
}
