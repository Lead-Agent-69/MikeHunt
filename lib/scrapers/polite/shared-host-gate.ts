import Redis from "ioredis";
import { randomUUID, createHash } from "node:crypto";

export const ACQUIRE_HOST = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local paused = tonumber(redis.call('GET', KEYS[3]) or '0')
if paused > now then return paused - now end
if redis.call('EXISTS', KEYS[1]) == 1 then return math.max(100, redis.call('PTTL', KEYS[1])) end
local next = tonumber(redis.call('GET', KEYS[2]) or '0')
if next > now then return next - now end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('SET', KEYS[2], now + tonumber(ARGV[3]), 'PX', math.max(tonumber(ARGV[3]) * 2, 86400000))
return 0`;
export const RELEASE_HOST = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
const PAUSE_HOST = `local t=redis.call('TIME'); local now=tonumber(t[1])*1000+math.floor(tonumber(t[2])/1000); local untilAt=math.max(tonumber(redis.call('GET',KEYS[1]) or '0'),now+tonumber(ARGV[1])); redis.call('SET',KEYS[1],untilAt,'PX',untilAt-now); return untilAt`;

let redis: Redis | undefined;
function connection() {
  const url = process.env.REDIS_URL;
  if (!url)
    throw new Error(
      "Shared host quota unavailable: REDIS_URL required for collection",
    );
  return (redis ??= new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5000,
  }));
}
export function closeSharedHostGate() {
  redis?.disconnect();
  redis = undefined;
}
function keys(host: string) {
  const id = createHash("sha256")
    .update(host.toLowerCase().replace(/^www\./, ""))
    .digest("hex");
  return [
    `integrity:host:{${id}}:lease`,
    `integrity:host:{${id}}:next`,
    `integrity:host:{${id}}:pause`,
  ];
}
async function ready() {
  const client = connection();
  if (client.status === "wait") await client.connect();
  if (client.status !== "ready")
    throw new Error("Shared host quota unavailable; collection deferred");
  return client;
}

/** Ownership is atomic across workers; no local fallback when coordination is unavailable. */
export async function withSharedHost<T>(
  host: string,
  gapMs: number,
  task: () => Promise<T>,
): Promise<T> {
  const client = await ready();
  const owner = randomUUID();
  const k = keys(host);
  const wait = Number(
    await client.eval(
      ACQUIRE_HOST,
      3,
      ...k,
      owner,
      90_000,
      Math.max(5000, gapMs),
    ),
  );
  if (!Number.isFinite(wait) || wait !== 0)
    throw new Error(`Shared host quota deferred (${Math.ceil(wait / 1000)}s)`);
  try {
    return await task();
  } finally {
    await client.eval(RELEASE_HOST, 1, k[0], owner);
  }
}

export async function pauseSharedHost(host: string, durationMs: number) {
  const client = await ready();
  await client.eval(PAUSE_HOST, 1, keys(host)[2], Math.max(5000, durationMs));
}
