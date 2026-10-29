import { AsyncLocalStorage } from "node:async_hooks";
import {
  parseIntakeCounts,
  sumIntakeCounts,
  type ScrapeIntakeCounts,
} from "./intake-counts";

export interface ScrapePersistenceReceipt {
  calls: number;
  dealsFound: number;
  dealsSaved: number;
  intake?: ScrapeIntakeCounts;
  intakeCalls?: number;
}

interface ScrapeRunContext {
  sourceId: string;
  persistence: ScrapePersistenceReceipt;
  onPersistence?: (receipt: ScrapePersistenceReceipt) => void;
}

const storage = new AsyncLocalStorage<ScrapeRunContext>();

function createContext(
  sourceId: string,
  onPersistence?: (receipt: ScrapePersistenceReceipt) => void,
): ScrapeRunContext {
  return {
    sourceId,
    onPersistence,
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
  onPersistence?: (receipt: ScrapePersistenceReceipt) => void,
): Promise<{ result: T; receipt: ScrapePersistenceReceipt }> {
  const context = createContext(sourceId, onPersistence);
  return storage.run(context, async () => {
    const result = await run();
    return { result, receipt: { ...context.persistence } };
  });
}

/** Record discovered and stored rows without coupling individual adapters to executor accounting. */
export function recordScrapePersistence(
  dealsFound: number,
  dealsSaved: number,
  intake?: ScrapeIntakeCounts,
): void {
  const persistence = storage.getStore()?.persistence;
  if (!persistence) return;
  const count = (value: number) =>
    Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  persistence.calls += 1;
  persistence.dealsFound += count(dealsFound);
  persistence.dealsSaved += count(dealsSaved);
  const measured = parseIntakeCounts(intake);
  if (
    measured &&
    measured.received === count(dealsFound) &&
    measured.persisted === count(dealsSaved)
  ) {
    const combined = persistence.intake
      ? sumIntakeCounts(persistence.intake, measured)
      : persistence.intakeCalls
        ? undefined
        : measured;
    persistence.intake = combined;
    if (combined) persistence.intakeCalls = (persistence.intakeCalls || 0) + 1;
  }
  storage.getStore()?.onPersistence?.({ ...persistence });
}

export function getScrapeSourceId(): string | undefined {
  return storage.getStore()?.sourceId;
}
