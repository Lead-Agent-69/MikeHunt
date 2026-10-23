import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { curatedSiteKey } from "./curated-rotation";

export const CURATED_OUTCOME_LIMIT = 500;
const states = [
  "running",
  "accepted_records",
  "no_accepted_records",
  "blocked",
  "failed",
  "cancelled",
] as const;
const reasons = [
  "site_policy",
  "robots",
  "timeout",
  "request_failed",
  "aborted",
] as const;
export type CuratedOutcome = {
  host: string;
  state: (typeof states)[number];
  reason?: (typeof reasons)[number];
  startedAt: number;
  finishedAt: number | null;
  acceptedRecords: number | null;
  // Adapter return values count accepted writes, not all listings or scope matches.
  matchingInventory: null;
  requestedStates: string[];
};
export type CuratedOutcomes = { version: 1; rows: CuratedOutcome[] };

export function curatedOutcomesPath() {
  return path.resolve(
    process.env.LOCAL_CACHE_PATH || path.join(process.cwd(), ".cache"),
    "curated-outcomes.json",
  );
}

export function parseCuratedOutcomes(value: unknown): CuratedOutcomes {
  const input = value as CuratedOutcomes | null;
  if (input?.version !== 1 || !Array.isArray(input.rows))
    return { version: 1, rows: [] };
  const rows = input.rows.flatMap((row) => {
    if (
      !row ||
      typeof row.host !== "string" ||
      row.host.length > 253 ||
      !/^[a-z0-9.-]+$/.test(row.host) ||
      !states.includes(row.state) ||
      !Number.isFinite(row.startedAt) ||
      row.startedAt <= 0 ||
      !(
        row.finishedAt === null ||
        (Number.isFinite(row.finishedAt) && row.finishedAt >= row.startedAt)
      ) ||
      !(
        row.acceptedRecords === null ||
        (Number.isSafeInteger(row.acceptedRecords) && row.acceptedRecords >= 0)
      ) ||
      (row.reason !== undefined && !reasons.includes(row.reason)) ||
      !Array.isArray(row.requestedStates)
    )
      return [];
    if (
      row.state === "running" &&
      (row.finishedAt !== null || row.acceptedRecords !== null)
    )
      return [];
    if (row.state !== "running" && row.finishedAt === null) return [];
    if (
      row.state === "accepted_records" &&
      !(row.acceptedRecords !== null && row.acceptedRecords > 0)
    )
      return [];
    if (row.state === "no_accepted_records" && row.acceptedRecords !== 0)
      return [];
    if (
      ["blocked", "failed", "cancelled"].includes(row.state) &&
      row.acceptedRecords !== null
    )
      return [];
    return [
      {
        host: row.host,
        state: row.state,
        ...(row.reason ? { reason: row.reason } : {}),
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        acceptedRecords: row.acceptedRecords,
        matchingInventory: null,
        requestedStates: Array.from(
          new Set(
            row.requestedStates.filter(
              (s) => typeof s === "string" && /^[A-Z]{2}$/.test(s),
            ),
          ),
        ).slice(0, 50),
      },
    ];
  });
  const byHost = new Map<string, CuratedOutcome>();
  for (const row of rows)
    if (
      !byHost.has(row.host) ||
      byHost.get(row.host)!.startedAt <= row.startedAt
    )
      byHost.set(row.host, row);
  return {
    version: 1,
    rows: Array.from(byHost.values())
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, CURATED_OUTCOME_LIMIT),
  };
}

export async function loadCuratedOutcomes(
  file = curatedOutcomesPath(),
): Promise<CuratedOutcomes> {
  try {
    const body = await readFile(/* turbopackIgnore: true */ file, "utf8");
    if (body.length > 1_000_000) return { version: 1, rows: [] };
    return parseCuratedOutcomes(JSON.parse(body));
  } catch {
    return { version: 1, rows: [] };
  }
}

export async function saveCuratedOutcomes(
  value: CuratedOutcomes,
  file = curatedOutcomesPath(),
) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(parseCuratedOutcomes(value)), {
    mode: 0o600,
  });
  await rename(tmp, file);
}

let pendingWrite: Promise<void> = Promise.resolve();
export function recordCuratedOutcome(
  row: CuratedOutcome,
  file = curatedOutcomesPath(),
): Promise<void> {
  const write = pendingWrite
    .catch(() => {})
    .then(async () => {
      const current = await loadCuratedOutcomes(file);
      await saveCuratedOutcomes(
        { version: 1, rows: [...current.rows, row] },
        file,
      );
    });
  pendingWrite = write;
  return write;
}

export function startCuratedOutcome(
  url: string,
  requestedStates: string[],
  now = Date.now(),
): CuratedOutcome {
  return {
    host: curatedSiteKey({ url }),
    state: "running",
    startedAt: now,
    finishedAt: null,
    acceptedRecords: null,
    matchingInventory: null,
    requestedStates,
  };
}

export function finishCuratedOutcome(
  attempt: CuratedOutcome,
  result: number | "blocked" | "failed" | "cancelled",
  reason?: CuratedOutcome["reason"],
  now = Date.now(),
): CuratedOutcome {
  if (
    typeof result === "number" &&
    (!Number.isSafeInteger(result) || result < 0)
  )
    throw new Error("Invalid accepted-record count");
  return {
    ...attempt,
    state:
      typeof result === "number"
        ? result > 0
          ? "accepted_records"
          : "no_accepted_records"
        : result,
    ...(reason ? { reason } : {}),
    finishedAt: Math.max(now, attempt.startedAt),
    acceptedRecords: typeof result === "number" ? result : null,
    matchingInventory: null,
  };
}
