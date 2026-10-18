import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<string>();

/** Keep the registered adapter id attached to every async persistence call in a source run. */
export function withScrapeSourceId<T>(
  sourceId: string,
  run: () => Promise<T>,
): Promise<T> {
  return storage.run(sourceId, run);
}

export function getScrapeSourceId(): string | undefined {
  return storage.getStore();
}
