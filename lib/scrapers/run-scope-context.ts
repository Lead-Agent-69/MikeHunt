import { AsyncLocalStorage } from "node:async_hooks";
import type { BuyerScope } from "./buyer-scope";

/** Public normalization never creates refreshExisting; it is an operator-only queue hint. */
export interface ScrapeRunScope extends BuyerScope {
  refreshExisting?: boolean;
  dealerIntake?: boolean;
}

export function targetsDealer(scope?: ScrapeRunScope) {
  return Boolean(scope?.dealerHosts?.length || scope?.dealerSourceIds?.length);
}

const storage = new AsyncLocalStorage<ScrapeRunScope>();

export function withScrapeRunScope<T>(
  scope: ScrapeRunScope | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!scope) return run();
  return storage.run(scope, run);
}

export function getScrapeRunScope(): ScrapeRunScope | undefined {
  return storage.getStore();
}
