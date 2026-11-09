import type { ScrapeRunScope } from "./run-scope-context";

export const DEFAULT_SOURCE_TIMEOUT_MS = 5 * 60_000;
export const TARGETED_DEALER_TIMEOUT_MS = 8 * 60_000;
export const REFRESH_SOURCE_TIMEOUT_MS = 15 * 60_000;

export function sourceTimeoutMs(
  scope?: ScrapeRunScope,
  sourceIds?: readonly string[],
) {
  if (scope?.refreshExisting === true) return REFRESH_SOURCE_TIMEOUT_MS;

  // A single dealer can require dozens of paced inventory and detail requests.
  const dealerTargets =
    (scope?.dealerSourceIds?.length ?? 0) + (scope?.dealerHosts?.length ?? 0);
  return sourceIds?.length === 1 &&
    sourceIds[0] === "curated_dealers" &&
    dealerTargets === 1
    ? TARGETED_DEALER_TIMEOUT_MS
    : DEFAULT_SOURCE_TIMEOUT_MS;
}
