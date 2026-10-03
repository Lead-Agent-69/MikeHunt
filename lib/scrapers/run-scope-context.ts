import { AsyncLocalStorage } from "node:async_hooks";
import type { BuyerScope } from "./buyer-scope";

const storage = new AsyncLocalStorage<BuyerScope>();

export function withScrapeRunScope<T>(
  scope: BuyerScope | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (!scope) return run();
  return storage.run(scope, run);
}

export function getScrapeRunScope(): BuyerScope | undefined {
  return storage.getStore();
}
