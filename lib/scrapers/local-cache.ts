import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { US_STATES } from "@/lib/geo/us-states";
import { getSweepPlan } from "./sweep-plan";
import { getScrapeRunScope } from "./run-scope-context";
import { writeCapacity } from "./write-capacity";
import { maintainListingPhotos } from "./photo-maintenance";
import { pendingDealerIntake } from "./pending-dealer-intake";
import {
  mayTouchDeferredObservation,
  sameSourceObservation,
} from "./source-observation";

type ObservationGuard = { version: string; observedAt: string };

export interface CachedListing {
  hash: string;
  synced: boolean;
  lastSeenAt: string;
  /** Last time deals.last_seen_at was written for this row (insert, update, or touch). */
  dbSeenAt?: string;
  data?: Record<string, unknown>;
  /** Recovery found this key already stored; only a fresh source run may update it. */
  recoveryExisting?: boolean;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CachedListing>;
  quota: { day: string; inserts: number; updates: number; touches?: number };
  photoMaintenance?: { nextAt: number; stateIndex: number };
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
  allowInsert?: (client: SupabaseClient) => Promise<boolean>;
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
 * Daily write budgets; writes pause at 80% of each. These counts do not bound
 * database size: row/index sizes, embeddings and owner-protected history vary.
 * Source expansion also needs the measured storage guard and provider usage checks.
 */
export const DEFAULT_MAX_DAILY_INSERTS = 1250;
export const DEFAULT_MAX_DAILY_UPDATES = 2500;

/** Only disposable previews and already-synced fingerprints expire. Never discard queued data. */
export function compactCacheEntries(
  entries: Record<string, CachedListing>,
  now = Date.now(),
): number {
  let removed = 0;
  for (const [key, entry] of Object.entries(entries)) {
    const age = now - Date.parse(entry.lastSeenAt);
    const ttl = key.startsWith("scan-preview|") ? 86_400_000 : 180 * 86_400_000;
    if (
      Number.isFinite(age) &&
      age > ttl &&
      (entry.synced || key.startsWith("scan-preview|"))
    ) {
      delete entries[key];
      removed++;
    }
  }
  return removed;
}

/** Columns needed to compare stored rows with incoming ones. Never `*` (embeddings are large). */
export function classifyColumns(rows: Record<string, any>[]): string {
  const cols = new Set<string>([
    "source",
    "source_deal_id",
    "last_seen_at",
    "updated_at",
  ]);
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
  private allowInsert?: LocalCacheOptions["allowInsert"];
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
    this.allowInsert = options.allowInsert;
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
    compactCacheEntries(this.state.entries);
    const temp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(this.state), { mode: 0o600 });
    await rename(temp, this.filePath);
  }

  photoChecksDue(): boolean {
    return (
      !this.cacheOnly &&
      (!this.state.photoMaintenance ||
        this.state.photoMaintenance.nextAt <= Date.now()) &&
      writeCapacity(this.getQuota()).updatesRemaining > 0
    );
  }

  /** Idle-only checks share inventory's update budget and persist their hourly cadence. */
  async verifyListingPhotos(
    supabase: SupabaseClient,
    states: string[] = ["MO"],
  ) {
    return this.exclusive(async () => {
      this.rollDay();
      const now = Date.now();
      const prior = this.state.photoMaintenance;
      if (this.cacheOnly || (prior && prior.nextAt > now)) return null;
      const available = writeCapacity(this.getQuota()).updatesRemaining;
      const limit = Math.min(5, available);
      if (!limit || (this.beforeWrite && !(await this.beforeWrite())))
        return null;
      const scope = Array.from(
        new Set(["MO", ...states.filter((state) => /^[A-Z]{2}$/.test(state))]),
      );
      const index = (prior?.stateIndex ?? 0) % scope.length;
      this.state.photoMaintenance = {
        nextAt: now + 3600_000,
        stateIndex: (index + 1) % scope.length,
      };
      // Persist cadence before network work so restarts cannot repeatedly consume the same budget.
      await this.save();
      const receipt = await maintainListingPhotos(supabase, {
        state: scope[index],
        limit,
        signal: AbortSignal.timeout(45_000),
        beforeWrite: async () =>
          !this.beforeWrite || (await this.beforeWrite()),
        onWrite: async (row) => {
          this.rollDay();
          this.state.quota.updates++;
          const entry =
            this.state.entries[`${row.source}|${row.source_deal_id}`];
          if (entry) entry.synced = false;
          await this.save();
          const quota = this.getQuota();
          this.onQuota?.(quota, writeCapacity(quota).paused);
        },
      });
      return {
        ...receipt,
        nextAt: new Date(this.state.photoMaintenance.nextAt).toISOString(),
      };
    });
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
      this.onQuota?.(quota, writeCapacity(quota).paused);
      return count;
    });
  }

  /** Bounded insert-only recovery; callers must supply actual current buyer markets. */
  async publishPendingDealers(
    supabase: SupabaseClient,
    states: readonly string[],
  ) {
    const capacity = writeCapacity(this.getQuota());
    if (this.cacheOnly || capacity.insertsRemaining <= 0 || !states.length)
      return 0;
    const rows = pendingDealerIntake(
      Object.values(this.state.entries),
      states,
      Math.min(25, capacity.insertsRemaining),
    );
    if (!rows.length) return 0;
    const result = await this.persistRows(
      rows,
      supabase,
      "source,source_deal_id",
      { insertOnly: true },
    );
    return result.inserts;
  }

  async persistRows(
    inputRows: Record<string, any>[],
    supabase: SupabaseClient,
    selectColumns: string,
    options: { insertOnly?: boolean } = {},
  ): Promise<PersistResult> {
    return this.exclusive(async () => {
      this.rollDay();
      const rows: Record<string, any>[] = inputRows.map((row) => {
        const observation: Record<string, any> = {
          ...row,
          source_deal_id: stableListingId(row),
        };
        // Old buffered payloads can carry these fields too. Let insert defaults
        // set them, and leave them out of every ON CONFLICT update.
        delete observation.created_at;
        delete observation.first_seen_at;
        return observation;
      });
      // Unchanged rows still prove the listing is live. They skip the full upsert, but
      // deals.last_seen_at must still move or every unchanged car looks stale and the
      // 30-day retention job deactivates listings that are still for sale.
      const toTouch: Record<string, any>[] = [];
      const observationGuards = new Map<string, ObservationGuard>();
      const candidates = rows.filter((row) => {
        const key = `${row.source}|${row.source_deal_id}`;
        const entry = this.state.entries[key];
        const hash = listingHash(row);
        // A concurrent fresh run may have synced this key since recovery planned it.
        if (options.insertOnly && entry?.synced) return false;
        if (entry?.synced && entry.hash === hash) {
          entry.lastSeenAt = new Date().toISOString();
          if (touchIsDue(entry, this.touchIntervalMs)) toTouch.push(row);
          return false;
        }
        return true;
      });

      // Persist observations before any remote read/write or budget gate. Only
      // a confirmed remote match/write may remove the unsynced payload again.
      for (const row of candidates) {
        const key = `${row.source}|${row.source_deal_id}`;
        this.state.entries[key] = {
          hash: listingHash(row),
          synced: false,
          lastSeenAt: new Date().toISOString(),
          dbSeenAt: this.state.entries[key]?.dbSeenAt,
          data: row,
        };
      }
      if (candidates.length) await this.save();

      if (this.cacheOnly) {
        if (!candidates.length) await this.save();
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
        const touches = await this.touchRows(toTouch, supabase, rows);
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
      const operatorRefresh = getScrapeRunScope()?.refreshExisting === true;
      // Ordinary collection keeps the 20% safety reserve. A reviewed operator refresh may
      // spend that reserve on already-stored rows only; insert capacity remains unchanged.
      const updateThreshold = Math.max(
        1,
        operatorRefresh
          ? this.maxDailyUpdates
          : Math.floor(this.maxDailyUpdates * 0.8),
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
      // Spend scarce full updates on seller changes before model-only recalculations.
      const modelOnly = (row: Record<string, any>) => {
        const prior = existing.get(`${row.source}|${row.source_deal_id}`);
        return prior && sameSourceObservation(prior, row) ? 1 : 0;
      };
      const prioritized = [...candidates].sort(
        (a, b) => modelOnly(a) - modelOnly(b),
      );
      const plan = getSweepPlan();
      const prioritizeLocatedInserts =
        !getScrapeRunScope() &&
        plan?.demandStates?.some(
          (state) =>
            plan.states.includes(state) &&
            Object.prototype.hasOwnProperty.call(US_STATES, state),
        );
      for (const row of prioritized) {
        const key = `${row.source}|${row.source_deal_id}`;
        const prior = existing.get(key);
        const oldEntry = this.state.entries[key];
        const hash = listingHash(row);
        // Buffered snapshots must never overwrite or renew an existing listing.
        if (options.insertOnly && prior) {
          this.state.entries[key].recoveryExisting = true;
          continue;
        }
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
        // Market sweeps retain unlocated observations locally, without spending
        // their limited intake on cars that cannot yet match a buyer's location.
        // Never infer a vehicle's state from the search center or demand plan.
        if (
          kind === "insert" &&
          prioritizeLocatedInserts &&
          !Object.prototype.hasOwnProperty.call(
            US_STATES,
            String(row.location_state || "")
              .trim()
              .toUpperCase(),
          )
        )
          continue;
        if (
          kind === "insert" &&
          this.allowInsert &&
          !(await this.allowInsert(supabase))
        )
          continue;
        if (kind === "insert" ? insertsAvailable <= 0 : updatesAvailable <= 0) {
          if (
            prior &&
            mayTouchDeferredObservation(prior, row) &&
            touchIsDue(
              {
                hash,
                lastSeenAt: oldEntry?.lastSeenAt || row.last_seen_at,
                synced: true,
                dbSeenAt: oldEntry?.dbSeenAt || prior.last_seen_at,
              },
              this.touchIntervalMs,
            )
          ) {
            // The new calculation remains unsynced. Only verified, unchanged
            // seller facts can renew freshness, with an optimistic row-version guard.
            toTouch.push(row);
            observationGuards.set(key, {
              version: prior.updated_at,
              observedAt: row.last_seen_at,
            });
          }
          continue;
        }
        if (kind === "insert") insertsAvailable -= 1;
        else updatesAvailable -= 1;
        accepted.push({
          row,
          kind,
          priceChanged: prior
            ? Number(prior.ask_price) !== Number(row.ask_price)
            : true,
        });
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
              // Also protect against a concurrent insertion after classification.
              ignoreDuplicates: options.insertOnly === true,
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

      const touches = await this.touchRows(
        toTouch,
        supabase,
        rows,
        observationGuards,
      );

      await this.save();
      const quota = this.getQuota();
      const paused = writeCapacity(quota).paused;
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
    observations = rows,
    guards = new Map<string, ObservationGuard>(),
  ): Promise<number> {
    if (!rows.length || this.cacheOnly) return 0;
    let available = Math.max(
      0,
      this.maxDailyTouches - (this.state.quota.touches || 0),
    );
    let touched = 0;
    const latest = new Map(
      observations.map((row) => [`${row.source}|${row.source_deal_id}`, row]),
    );
    const bySource = new Map<
      string,
      { source: string; ids: string[]; guard?: ObservationGuard }
    >();
    for (const row of rows) {
      const source = String(row.source);
      const guard = guards.get(`${source}|${row.source_deal_id}`);
      const key = JSON.stringify([source, guard?.version, guard?.observedAt]);
      const group = bySource.get(key) || { source, ids: [], guard };
      if (!group.ids.includes(String(row.source_deal_id)))
        group.ids.push(String(row.source_deal_id));
      bySource.set(key, group);
    }
    for (const { source, ids, guard } of Array.from(bySource.values())) {
      for (const batch of listingIdBatches(ids)) {
        if (available <= 0) return touched;
        if (this.beforeWrite && !(await this.beforeWrite())) return touched;
        const chunk = batch.slice(0, available);
        const seenAt = guard?.observedAt || new Date().toISOString();
        let confirmed: number | undefined;
        try {
          let query = supabase
            .from("deals")
            .update({ last_seen_at: seenAt }, { count: "exact" })
            .eq("source", source);
          if (guard)
            query = query
              .eq("updated_at", guard.version)
              .lte("last_seen_at", seenAt)
              .abortSignal(AbortSignal.timeout(10_000));
          const { error, count } = await query.in("source_deal_id", chunk);
          if (error) throw new Error(error.message);
          if (
            typeof count === "number" &&
            Number.isSafeInteger(count) &&
            count >= 0 &&
            count <= chunk.length
          )
            confirmed = count;
        } catch (error) {
          console.warn(
            `[LocalCache] last_seen_at bump failed for ${source}: ${error instanceof Error ? error.message : "unverified outcome"}`,
          );
        }
        if (confirmed === chunk.length) {
          for (const id of chunk) {
            const entry = this.state.entries[`${source}|${id}`];
            if (entry) entry.dbSeenAt = seenAt;
          }
        } else {
          // A count without row IDs cannot identify partial matches. Reclassify
          // the whole batch next time, preserving its newest received payloads.
          for (const id of chunk) {
            const key = `${source}|${id}`;
            const row = latest.get(key);
            if (!row) continue;
            const entry = this.state.entries[key];
            this.state.entries[key] = {
              hash: listingHash(row),
              synced: false,
              data: row,
              lastSeenAt: entry?.lastSeenAt || seenAt,
              dbSeenAt: entry?.dbSeenAt,
            };
          }
        }
        touched += confirmed ?? 0;
        // Reserve attempted row capacity even when the outcome is uncertain.
        // The returned touches count reports only confirmed matching rows.
        available -= chunk.length;
        this.state.quota.touches =
          (this.state.quota.touches || 0) + chunk.length;
      }
    }
    return touched;
  }
}
