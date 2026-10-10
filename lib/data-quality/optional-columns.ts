// lib/data-quality/optional-columns.ts
// New deals columns ship in code before their migration is signed and applied on hosted. The
// non-local upsert self-heals an unknown column, but the Zeus local-cache path throws on one, which
// would stop every write. So probe once per process (cached 10 min) and strip columns the hosted
// schema doesn't have yet. One `limit(0)` select per column set; no rows read.

type Probe = { ok: boolean; at: number };
const cache = new Map<string, Probe>();
const TTL_MS = 10 * 60_000;

type SelectClient = {
  from: (table: string) => {
    select: (cols: string) => {
      limit: (n: number) => PromiseLike<{ error: unknown }>;
    };
  };
};

/** True when every column in `cols` exists on `table`. Errors other than a missing column count as present. */
export async function columnsExist(
  sb: SelectClient,
  table: string,
  cols: readonly string[],
  now = Date.now(),
): Promise<boolean> {
  const key = `${table}:${cols.join(",")}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.ok;
  let ok = true;
  try {
    const { error } = await sb.from(table).select(cols.join(",")).limit(0);
    const msg = String((error as { message?: string } | null)?.message || "");
    const code = String((error as { code?: string } | null)?.code || "");
    if (
      error &&
      (code === "42703" ||
        code === "PGRST204" ||
        /column .* does not exist|Could not find the/i.test(msg))
    )
      ok = false;
  } catch {
    ok = true; // network blip: let the write path's own error handling decide
  }
  cache.set(key, { ok, at: now });
  return ok;
}

/** Copy of rows without `cols` (used when columnsExist() said the migration isn't applied yet). */
export function stripColumns<T extends Record<string, unknown>>(
  rows: T[],
  cols: readonly string[],
): T[] {
  return rows.map((r) => {
    const c: Record<string, unknown> = { ...r };
    for (const k of cols) delete c[k];
    return c as T;
  });
}

/** Test hook. */
export function resetColumnProbeCache() {
  cache.clear();
}
