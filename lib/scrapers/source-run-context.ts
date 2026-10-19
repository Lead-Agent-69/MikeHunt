import { AsyncLocalStorage } from "node:async_hooks";

export interface ScrapePersistenceReceipt {
  calls: number;
  dealsFound: number;
  dealsSaved: number;
}

interface ScrapeRunContext {
  sourceId: string;
  persistence: ScrapePersistenceReceipt;
}

const storage = new AsyncLocalStorage<ScrapeRunContext>();

function createContext(sourceId: string): ScrapeRunContext {
  return {
    sourceId,
    persistence: { calls: 0, dealsFound: 0, dealsSaved: 0 },
  };
}

/** Keep the registered adapter id attached to every async persistence call in a source run. */
export function withScrapeSourceId<T>(
  sourceId: string,
  run: () => Promise<T>,
): Promise<T> {
  return storage.run(createContext(sourceId), run);
}

/** Execute a source and return the persistence evidence emitted by the shared intake pipeline. */
export function withScrapeRunReceipt<T>(
  sourceId: string,
  run: () => Promise<T>,
): Promise<{ result: T; receipt: ScrapePersistenceReceipt }> {
  const context = createContext(sourceId);
  return storage.run(context, async () => {
    const result = await run();
    return { result, receipt: { ...context.persistence } };
  });
}

/** Record discovered and stored rows without coupling individual adapters to executor accounting. */
export function recordScrapePersistence(
  dealsFound: number,
  dealsSaved: number,
): void {
  const persistence = storage.getStore()?.persistence;
  if (!persistence) return;
  const count = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  persistence.calls += 1;
  persistence.dealsFound += count(dealsFound);
  persistence.dealsSaved += count(dealsSaved);
}

export function getScrapeSourceId(): string | undefined {
  return storage.getStore()?.sourceId;
}
