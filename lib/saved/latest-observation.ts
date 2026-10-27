import { seenTimestampOrNull } from "@/lib/deals/listing-freshness";

type SavedRow = { deal_id?: string; [key: string]: any };
type ReadClient = { from: (table: string) => any };

/** Read only accessible inventory observations; never rewrite a buyer's saved snapshot. */
export async function withLatestObservations<T extends SavedRow>(
  client: ReadClient,
  rows: T[],
): Promise<T[]> {
  const ids = Array.from(
    new Set(
      rows
        .map((row) => row.deal_id)
        .filter(
          (id): id is string =>
            typeof id === "string" &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              id,
            ),
        ),
    ),
  );
  if (!ids.length) return rows;
  const latest = new Map<string, string>();
  const signal = AbortSignal.timeout(2500);
  // One narrow, indexed read per page; bound legacy collections without oversized URLs.
  for (let offset = 0; offset < ids.length && !signal.aborted; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    try {
      const { data, error } = await client
        .from("deals")
        .select("id,last_seen_at")
        .in("id", batch)
        .limit(batch.length)
        .abortSignal(signal);
      if (error || !Array.isArray(data)) continue;
      for (const row of data) {
        const seen = seenTimestampOrNull(row.last_seen_at);
        if (
          batch.includes(row.id) &&
          seen &&
          Date.parse(seen) <= Date.now() + 3600000
        )
          latest.set(row.id, seen);
      }
    } catch {
      // A missing, restricted or unreachable index must not remove a saved vehicle.
    }
  }
  return rows.map((row) =>
    latest.has(row.deal_id || "")
      ? { ...row, latestObservation: { lastSeenAt: latest.get(row.deal_id!) } }
      : row,
  );
}
