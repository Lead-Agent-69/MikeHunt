import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

type DetailRow = { source_url?: string | null };
const turns = new Map<string, Promise<void>>();

function hostOf(value?: string | null) {
  try {
    const url = new URL(value || "");
    return /^https?:$/.test(url.protocol) && !url.username && !url.password
      ? url.hostname.toLowerCase().replace(/^www\./, "")
      : null;
  } catch {
    return null;
  }
}

/**
 * Resume after actual attempts, not wall-clock slots or planned batch sizes.
 * Uses the collector's existing mounted cache and atomic-file convention. Same-host
 * runs in this worker serialize so overlapping jobs cannot reuse a stale cursor.
 * This progress metadata never changes a listing's source-observation timestamp.
 */
export async function withDealerDetailRotation<T extends DetailRow, R>(
  sourceUrl: string,
  rows: readonly T[],
  run: (ordered: T[], attempted: (row: T) => void) => Promise<R>,
) {
  const host = hostOf(sourceUrl);
  const eligible = rows.filter(
    (row) => host && hostOf(row.source_url) === host,
  );
  if (!host || !eligible.length) return run([], () => {});
  const file = path.join(
    path.resolve(
      process.env.LOCAL_CACHE_PATH || path.join(process.cwd(), ".cache"),
    ),
    "dealer-detail-rotation",
    `${createHash("sha256").update(host).digest("hex")}.json`,
  );
  const previous = turns.get(file) || Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  turns.set(file, turn);
  await previous;
  try {
    let afterUrl = "";
    try {
      if ((await stat(file)).size > 8192)
        throw new Error("Oversized detail progress");
      const state = JSON.parse(await readFile(file, "utf8"));
      if (
        state?.version === 1 &&
        typeof state.afterUrl === "string" &&
        hostOf(state.afterUrl) === host
      )
        afterUrl = state.afterUrl;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.warn(
          "[DealerDetails] progress unavailable; keeping inventory usable",
        );
    }
    const sorted = [...eligible].sort((a, b) =>
      String(a.source_url).localeCompare(String(b.source_url)),
    );
    let start = afterUrl
      ? sorted.findIndex(
          (row) => String(row.source_url).localeCompare(afterUrl) > 0,
        )
      : 0;
    if (start < 0) start = 0;
    const ordered = [...sorted.slice(start), ...sorted.slice(0, start)];
    const allowed = new Set(eligible.map((row) => row.source_url));
    let lastAttempted: string | undefined;
    try {
      return await run(ordered, (row) => {
        if (row.source_url && allowed.has(row.source_url))
          lastAttempted = row.source_url;
      });
    } finally {
      if (lastAttempted) {
        try {
          await mkdir(path.dirname(file), { recursive: true });
          const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
          await writeFile(
            temporary,
            JSON.stringify({ version: 1, afterUrl: lastAttempted }),
            { mode: 0o600 },
          );
          await rename(temporary, file);
        } catch {
          console.warn(
            "[DealerDetails] progress save deferred; inventory retained",
          );
        }
      }
    }
  } finally {
    release();
    if (turns.get(file) === turn) turns.delete(file);
  }
}
