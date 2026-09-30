import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const CACHE_VERSION = 1;
const MAX_ITEM_IDS = 100_000;

function cacheFile(): string {
  const root = process.env.LOCAL_CACHE_PATH?.trim() || path.resolve(process.cwd(), ".cache");
  return path.join(root, "sold-item-ids.json");
}

/** Load successfully persisted sale IDs. Missing or malformed cache files safely behave as empty. */
export async function loadSoldItemCache(): Promise<Set<string>> {
  try {
    const raw = await readFile(cacheFile(), "utf8");
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
export async function saveSoldItemCache(itemIds: Iterable<string>): Promise<void> {
  const file = cacheFile();
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
