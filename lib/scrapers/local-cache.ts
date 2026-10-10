import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CachedListing {
  hash: string;
  synced: boolean;
  lastSeenAt: string;
  /** Last time deals.last_seen_at was written for this row (insert, update, or touch). */
  dbSeenAt?: string;
  data?: Record<string, unknown>;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CachedListing>;
  quota: { day: string; inserts: number; updates: number; touches?: number };
}

export interface LocalCacheOptions {
  path?: string;
  batchSize?: number;
  maxDailyInserts?: number;
  maxDailyUpdates?: number;
  /** Cheap last_seen_at bumps for unchanged rows. Default 20000/day. */
  maxDailyTouches?: number;
  /** Bump an unchanged row at most this often. Default 12h. */
  touchIntervalMs?: number;
  cacheOnly?: boolean;
  onQuota?: (quota: CacheFile["quota"], paused: boolean) => void;
  beforeWrite?: () => Promise<boolean>;
}

export interface PersistResult {
  rows: Record<string, any>[];
  saved: number;
  skipped: number;
  inserts: number;
  updates: number;
  touches: number;
  priceChangedKeys: Set<string>;
  paused: boolean;
}

/**
 * Daily write budgets for the thin free-tier Supabase project. Writes pause at 80% of each.
 * ~1,000 effective new rows/day at ~4 KB/row on disk (row + indexes) keeps the 60-day retention
 * window near 60k rows / ~240 MB, under the 500 MB free database.
 */
export const DEFAULT_MAX_DAILY_INSERTS = 1250;
export const DEFAULT_MAX_DAILY_UPDATES = 2500;

/** Columns needed to compare stored rows with incoming ones. Never `*` (embeddings are large). */
export function classifyColumns(rows: Record<string, any>[]): string {
  const cols = new Set<string>(["source", "source_deal_id", "last_seen_at"]);
  for (const row of rows)
    for (const key of Object.keys(row))
      if (/^[a-z_][a-z0-9_]*$/.test(key)) cols.add(key);
  return Array.from(cols).join(",");
}

/** Unchanged rows whose deals.last_seen_at is due for a bump. */
export function touchIsDue(
  entry: CachedListing | undefined,
  intervalMs: number,
  now = Date.now(),
): boolean {
  if (!entry?.synced) return false;
  const last = entry.dbSeenAt ? Date.parse(entry.dbSeenAt) : NaN;
  return !Number.isFinite(last) || now - last >= intervalMs;
}

const VOLATILE_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "last_seen_at",
  "first_seen_at",
]);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !VOLATILE_FIELDS.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, stable(child ?? null)]),
    );
  }
  return value ?? null;
}

export function listingHash(row: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(row)))
    .digest("hex");
}

function matchesStoredRow(
  stored: Record<string, any>,
  incoming: Record<string, any>,
): boolean {
  const comparable: Record<string, unknown> = {};
  for (const key of Object.keys(incoming)) {
    if (!VOLATILE_FIELDS.has(key)) comparable[key] = stored[key] ?? null;
  }
  return listingHash(comparable) === listingHash(incoming);
}

export function stableListingId(deal: Record<string, unknown>): string {
  const existing = deal.source_deal_id || deal.id;
  if (existing) return String(existing).slice(0, 240);

  const source = String(deal.source || "unknown");
  const vin = String(deal.vin || "")
    .trim()
    .toUpperCase();
  if (vin)
    return `local:${createHash("sha256").update(`${source}|vin:${vin}`).digest("hex")}`;

  const url = String(deal.source_url || "").trim();
  if (url) {
    try {
      const parsed = new URL(url);
      parsed.hash = "";
      for (const key of Array.from(parsed.searchParams.keys())) {
        if (/^(utm_|ref$|referrer$|fbclid$|gclid$)/i.test(key))
          parsed.searchParams.delete(key);
      }
      const identity = `${source}|${parsed.origin}${parsed.pathname.replace(/\/$/, "")}|${parsed.searchParams.toString()}`;
      return `local:${createHash("sha256").update(identity).digest("hex")}`;
    } catch {
      // Fall through to a deterministic title identity for malformed URLs.
    }
  }

  const identity = [
    source,
    deal.year,
    deal.make,
    deal.model,
    deal.trim,
    deal.title,
    deal.location_state,
  ]
    .map((part) =>
      String(part || "")
        .trim()
        .toLowerCase(),
    )
    .join("|");
  return `local:${createHash("sha256").update(identity).digest("hex")}`;
}

const utcDay = () => new Date().toISOString().slice(0, 10);

export function listingIdBatches(ids: readonly string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let encodedLength = 0;
  for (const id of ids) {
    const length = encodeURIComponent(JSON.stringify(id)).length + 3;
    // PostgREST filters travel in the URL. Long dealer slugs need a byte budget, not just a row cap.
    if (batch.length && (batch.length >= 50 || encodedLength + length > 3000)) {
      batches.push(batch);
      batch = [];
      encodedLength = 0;
    }
    batch.push(id);
    encodedLength += length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export class LocalScraperCache {
  private filePath: string;
  private batchSize: number;
  private maxDailyInserts: number;
  private maxDailyUpdates: number;
  private maxDailyTouches: number;
  private touchIntervalMs: number;
  private cacheOnly: boolean;
  private onQuota?: LocalCacheOptions["onQuota"];
  private beforeWrite?: LocalCacheOptions["beforeWrite"];
  private state: CacheFile = {
    version: 1,
    entries: {},
    quota: { day: utcDay(), inserts: 0, updates: 0 },
  };
  private lock: Promise<void> = Promise.resolve();

  constructor(options: LocalCacheOptions = {}) {
    const cwd = path.normalize(process.cwd());
    const standaloneSuffix = path.normalize(path.join(".next", "standalone"));
    const defaultPath = cwd.endsWith(standaloneSuffix)
      ? path.resolve(process.cwd(), "..", "..", ".cache")
      : ".cache";
    this.filePath = path.resolve(
      options.path || process.env.LOCAL_CACHE_PATH || defaultPath,
      "local-scraper-cache.json",
    );
    this.batchSize = Math.min(50, Math.max(1, options.batchSize || 50));
    this.maxDailyInserts = Math.max(
      1,
      options.maxDailyInserts || DEFAULT_MAX_DAILY_INSERTS,
    );
    this.maxDailyUpdates = Math.max(
      1,
      options.maxDailyUpdates || DEFAULT_MAX_DAILY_UPDATES,
    );
    this.maxDailyTouches = Math.max(
      0,
      options.maxDailyTouches ??
        Number(process.env.MAX_DAILY_TOUCHES || 20_000),
    );
    this.touchIntervalMs = Math.max(
      60_000,
      options.touchIntervalMs ?? 12 * 60 * 60 * 1000,
    );
    this.cacheOnly =
      options.cacheOnly ?? process.env.CACHE_ONLY_MODE === "true";
    this.onQuota = options.onQuota;
    this.beforeWrite = options.beforeWrite;
  }

  async load(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as CacheFile;
      if (parsed.version !== 1 || !parsed.entries || !parsed.quota)
        throw new Error("Unsupported cache format");
      this.state = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          `Local cache is unreadable; refusing to reset quota state (${(error as Error).message})`,
        );
      }
    }
    this.rollDay();
    await this.save();
  }

  async rememberOnly(
    namespace: string,
    records: { id: string; value: Record<string, unknown> }[],
  ): Promise<void> {
    await this.exclusive(async () => {
      const now = new Date().toISOString();
      for (const record of records) {
        const key = `${namespace}|${record.id}`;
        this.state.entries[key] = {
          hash: listingHash(record.value),
          synced: false,
          lastSeenAt: now,
          data: record.value,
        };
      }
      await this.save();
    });
  }

  async records(namespace: string): Promise<Record<string, unknown>[]> {
    await this.load();
    const prefix = `${namespace}|`;
    return Object.entries(this.state.entries)
      .filter(([key]) => key.startsWith(prefix))
      .sort(([, a], [, b]) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .map(([, entry]) => ({
        ...(entry.data || {}),
        cachedAt: entry.lastSeenAt,
        cacheSynced: entry.synced,
      }));
  }

  getQuota() {
    this.rollDay();
    return {
      ...this.state.quota,
      touches: this.state.quota.touches || 0,
      maxInserts: this.maxDailyInserts,
      maxUpdates: this.maxDailyUpdates,
      maxTouches: this.maxDailyTouches,
    };
  }

  private rollDay(): void {
    const day = utcDay();
    if (this.state.quota.day !== day)
      this.state.quota = { day, inserts: 0, updates: 0, touches: 0 };
  }

  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prior = this.lock;
    let unlock!: () => void;
    this.lock = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await prior;
    try {
      return await fn();
    } finally {
      unlock();
    }
  }

  private async save(): Promise<void> {
    const temp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(this.state), { mode: 0o600 });
    await rename(temp, this.filePath);
  }

  /** Reversible auction expiry, serialized with imports and charged to the same update budget. */
  async deactivateEndedAuctions(
    supabase: SupabaseClient,
    limit = 100,
  ): Promise<number> {
    return this.exclusive(async () => {
      this.rollDay();
      if (this.cacheOnly) return 0;
      const available = Math.max(
        0,
        Math.floor(this.maxDailyUpdates * 0.8) - this.state.quota.updates,
      );
      const take = Math.min(100, available, Math.max(0, Math.floor(limit)));
      if (!Number.isFinite(take) || take === 0) return 0;
      if (this.beforeWrite && !(await this.beforeWrite())) return 0;
      const endedAt = new Date().toISOString();
      const { data: candidates, error: readError } = await supabase
        .from("deals")
        .select("id")
        .eq("active", true)
        .lte("auction_end_at", endedAt)
        .order("auction_end_at", { ascending: true })
        .limit(take);
      if (readError)
        throw new Error(`Auction expiry read failed: ${readError.message}`);
      if (!candidates?.length) return 0;
      if (this.beforeWrite && !(await this.beforeWrite())) return 0;
      // Repeat the expiry predicate so a concurrent reschedule cannot deactivate a reopened lot.
      const { data: changed, error: writeError } = await supabase
        .from("deals")
        .update({ active: false })
        .in(
          "id",
          candidates.map((row) => row.id),
        )
        .eq("active", true)
        .lte("auction_end_at", endedAt)
        .select("id,source,source_deal_id");
      if (writeError)
        throw new Error(`Auction expiry update failed: ${writeError.message}`);
      for (const row of changed || []) {
        const entry = this.state.entries[`${row.source}|${row.source_deal_id}`];
        if (entry) entry.synced = false;
      }
      const count = changed?.length || 0;
      this.state.quota.updates += count;
      await this.save();
      const quota = this.getQuota();
      this.onQuota?.(
        quota,
        quota.updates >= Math.floor(this.maxDailyUpdates * 0.8) ||
          quota.inserts >= Math.floor(this.maxDailyInserts * 0.8),
      );
      return count;
    });
  }

  async persistRows(
    inputRows: Record<string, any>[],
    supabase: SupabaseClient,
    selectColumns: string,
  ): Promise<PersistResult> {
    return this.exclusive(async () => {
      this.rollDay();
      const rows: Record<string, any>[] = inputRows.map((row) => ({
        ...row,
        source_deal_id: stableListingId(row),
      }));
      // Unchanged rows still prove the listing is live. They skip the full upsert, but
      // deals.last_seen_at must still move or every unchanged car looks stale and the
      // 30-day retention job deactivates listings that are still for sale.
      const toTouch: Record<string, any>[] = [];
      const candidates = rows.filter((row) => {
        const key = `${row.source}|${row.source_deal_id}`;
        const entry = this.state.entries[key];
        const hash = listingHash(row);
        if (entry?.synced && entry.hash === hash) {
          entry.lastSeenAt = new Date().toISOString();
          if (touchIsDue(entry, this.touchIntervalMs)) toTouch.push(row);
          return false;
        }
        return true;
      });

      if (this.cacheOnly) {
        for (const row of candidates) {
          const key = `${row.source}|${row.source_deal_id}`;
          this.state.entries[key] = {
            hash: listingHash(row),
            synced: false,
            lastSeenAt: new Date().toISOString(),
            data: row,
          };
        }
        await this.save();
        return {
          rows: [],
          saved: 0,
          skipped: rows.length - candidates.length,
          inserts: 0,
          updates: 0,
          touches: 0,
          priceChangedKeys: new Set(),
          paused: false,
        };
      }

      if (!candidates.length) {
        const touches = await this.touchRows(toTouch, supabase);
        await this.save();
        return {
          rows: [],
          saved: 0,
          skipped: rows.length,
          inserts: 0,
          updates: 0,
          touches,
          priceChangedKeys: new Set(),
          paused: false,
        };
      }

      const existing = new Map<string, Record<string, any>>();
      for (const source of Array.from(
        new Set(candidates.map((row) => String(row.source))),
      )) {
        const sourceRows = candidates.filter(
          (row) => String(row.source) === source,
        );
        for (const ids of listingIdBatches(
          sourceRows.map((row) => String(row.source_deal_id)),
        )) {
          let { data, error } = await supabase
            .from("deals")
            .select(classifyColumns(sourceRows))
            .eq("source", source)
            .in("source_deal_id", ids);
          if (error) {
            // An unexpected key on a scraped row must not block classification. Fall back to *.
            ({ data, error } = await supabase
              .from("deals")
              .select("*")
              .eq("source", source)
              .in("source_deal_id", ids));
          }
          if (error)
            throw new Error(
              `Could not classify existing deals for ${source}: ${error.message}`,
            );
          for (const row of (data || []) as unknown as Record<string, any>[])
            existing.set(`${row.source}|${row.source_deal_id}`, row);
        }
      }

      const insertThreshold = Math.max(
        1,
        Math.floor(this.maxDailyInserts * 0.8),
      );
      const updateThreshold = Math.max(
        1,
        Math.floor(this.maxDailyUpdates * 0.8),
      );
      let insertsAvailable = Math.max(
        0,
        insertThreshold - this.state.quota.inserts,
      );
      let updatesAvailable = Math.max(
        0,
        updateThreshold - this.state.quota.updates,
      );
      const accepted: {
        row: Record<string, any>;
        kind: "insert" | "update";
        priceChanged: boolean;
      }[] = [];
      for (const row of candidates) {
        const key = `${row.source}|${row.source_deal_id}`;
        const prior = existing.get(key);
        const oldEntry = this.state.entries[key];
        const hash = listingHash(row);
        if (prior && matchesStoredRow(prior, row)) {
          const entry: CachedListing = {
            hash,
            synced: true,
            lastSeenAt: new Date().toISOString(),
            dbSeenAt: oldEntry?.dbSeenAt || prior.last_seen_at || undefined,
          };
          this.state.entries[key] = entry;
          if (touchIsDue(entry, this.touchIntervalMs)) toTouch.push(row);
          continue;
        }
        const kind = prior ? "update" : "insert";
        if (kind === "insert" ? insertsAvailable <= 0 : updatesAvailable <= 0)
          continue;
        if (kind === "insert") insertsAvailable -= 1;
        else updatesAvailable -= 1;
        accepted.push({
          row,
          kind,
          priceChanged: prior
            ? Number(prior.ask_price) !== Number(row.ask_price)
            : true,
        });
        // Preserve the previous entry until Supabase confirms this write.
        if (!oldEntry)
          this.state.entries[key] = {
            hash,
            synced: false,
            lastSeenAt: new Date().toISOString(),
            data: row,
          };
      }

      let saved = 0;
      let inserts = 0;
      let updates = 0;
      const priceChangedKeys = new Set<string>();
      const returnedRows: Record<string, any>[] = [];
      for (let offset = 0; offset < accepted.length; offset += this.batchSize) {
        if (this.beforeWrite && !(await this.beforeWrite())) break;
        const batch = accepted.slice(offset, offset + this.batchSize);
        const { data, error } = await supabase
          .from("deals")
          .upsert(
            batch.map(({ row }) => row),
            {
              onConflict: "source,source_deal_id",
              ignoreDuplicates: false,
            },
          )
          .select(selectColumns);
        if (error) throw new Error(`Local deal batch failed: ${error.message}`);
        const returned = (data || []) as Record<string, any>[];
        const byKey = new Map(
          batch.map((item) => [
            `${item.row.source}|${item.row.source_deal_id}`,
            item,
          ]),
        );
        let batchInserts = 0;
        let batchUpdates = 0;
        for (const persisted of returned) {
          const key = `${persisted.source}|${persisted.source_deal_id}`;
          const item = byKey.get(key);
          if (!item) continue;
          const writtenAt = new Date().toISOString();
          this.state.entries[key] = {
            hash: listingHash(item.row),
            synced: true,
            lastSeenAt: writtenAt,
            dbSeenAt: writtenAt,
          };
          if (item.kind === "insert") {
            inserts += 1;
            batchInserts += 1;
          } else {
            updates += 1;
            batchUpdates += 1;
          }
          if (item.priceChanged) priceChangedKeys.add(key);
        }
        returnedRows.push(...returned);
        saved += returned.length;
        this.state.quota.inserts += batchInserts;
        this.state.quota.updates += batchUpdates;
        await this.save();
        if (offset + this.batchSize < accepted.length)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const touches = await this.touchRows(toTouch, supabase);

      for (const row of candidates) {
        const key = `${row.source}|${row.source_deal_id}`;
        if (!this.state.entries[key])
          this.state.entries[key] = {
            hash: listingHash(row),
            synced: false,
            lastSeenAt: new Date().toISOString(),
            data: row,
          };
      }
      await this.save();
      const quota = this.getQuota();
      const paused =
        quota.inserts >= insertThreshold || quota.updates >= updateThreshold;
      this.onQuota?.(quota, paused);
      return {
        rows: returnedRows,
        saved,
        skipped: rows.length - saved,
        inserts,
        updates,
        touches,
        priceChangedKeys,
        paused,
      };
    });
  }

  /**
   * Bump deals.last_seen_at for unchanged rows. One UPDATE per 100 ids, no returned rows,
   * so egress stays near zero. Never writes price or content. Called inside exclusive().
   */
  private async touchRows(
    rows: Record<string, any>[],
    supabase: SupabaseClient,
  ): Promise<number> {
    if (!rows.length || this.cacheOnly) return 0;
    let available = Math.max(
      0,
      this.maxDailyTouches - (this.state.quota.touches || 0),
    );
    let touched = 0;
    const bySource = new Map<string, string[]>();
    for (const row of rows) {
      const list = bySource.get(String(row.source)) || [];
      list.push(String(row.source_deal_id));
      bySource.set(String(row.source), list);
    }
    for (const [source, ids] of Array.from(bySource.entries())) {
      for (const batch of listingIdBatches(ids)) {
        if (available <= 0) return touched;
        if (this.beforeWrite && !(await this.beforeWrite())) return touched;
        const chunk = batch.slice(0, available);
        const seenAt = new Date().toISOString();
        const { error } = await supabase
          .from("deals")
          .update({ last_seen_at: seenAt })
          .eq("source", source)
          .in("source_deal_id", chunk);
        if (error) {
          // Freshness is best effort. A failed bump must not lose the batch's real writes.
          console.warn(
            `[LocalCache] last_seen_at bump failed for ${source}: ${error.message}`,
          );
          return touched;
        }
        for (const id of chunk) {
          const entry = this.state.entries[`${source}|${id}`];
          if (entry) entry.dbSeenAt = seenAt;
        }
        touched += chunk.length;
        available -= chunk.length;
        this.state.quota.touches =
          (this.state.quota.touches || 0) + chunk.length;
      }
    }
    return touched;
  }
}
