import type { ScrapeRunScope } from "./run-scope-context";

export const DEFAULT_SOURCE_TIMEOUT_MS = 5 * 60_000;
export const REFRESH_SOURCE_TIMEOUT_MS = 15 * 60_000;

/** Slow, explicitly operator-marked refreshes may finish a polite dealer detail walk. */
export function sourceTimeoutMs(scope?: ScrapeRunScope) {
  return scope?.refreshExisting === true
    ? REFRESH_SOURCE_TIMEOUT_MS
    : DEFAULT_SOURCE_TIMEOUT_MS;
}
