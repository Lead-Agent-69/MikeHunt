export type SourceAvailabilityGroup =
  | "ready"
  | "blocked"
  | "needs_login"
  | "needs_run"
  | "no_rows";

/** Customer-facing groups must partition all sources, including policy and setup gates. */
export function sourceAvailabilityGroup(
  readiness?: string | null,
): SourceAvailabilityGroup {
  switch (readiness) {
    case "ready":
    case "needs_login":
    case "needs_run":
    case "no_rows":
      return readiness;
    default:
      return "blocked";
  }
}
