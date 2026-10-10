/**
 * Which runner source is making this request. The executor runs each scraper's fn inside
 * withPoliteSource(id), so the polite layer can scope a static robots exemption to the source it was
 * granted to (Ren #269: ebay-sold's exemption must not cover ebay_motors on the same host).
 * Outside a scraper run there is no source and static exemptions match by host and path only.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string>();

export function withPoliteSource<T>(sourceId: string, fn: () => T): T {
  return storage.run(sourceId, fn);
}

export function currentPoliteSource(): string | undefined {
  return storage.getStore();
}
