import { COVERAGE_WINDOW_DAYS } from "@/lib/discovery/coverage";

export function sourceProofReadiness(input: {
  enabled: boolean;
  requiresAuth?: boolean;
  termsOff?: boolean;
  sharedImporter?: boolean;
  activeRows?: number;
  lastSeenAt?: string | null;
  lastRunStatus?: string | null;
  lastRunAt?: string | null;
  now?: number;
}) {
  if (input.termsOff) return "disabled";
  if (!input.enabled) return input.requiresAuth ? "needs_login" : "disabled";
  if (["error", "failed"].includes(input.lastRunStatus || "")) return "blocked";
  const now = input.now ?? Date.now();
  const recent = (value?: string | null) => {
    const time = value ? Date.parse(value) : NaN;
    return (
      Number.isFinite(time) &&
      time <= now + 300_000 &&
      time >= now - COVERAGE_WINDOW_DAYS * 86_400_000
    );
  };
  if ((input.activeRows || 0) > 0 && recent(input.lastSeenAt)) return "ready";
  // A network-wide run cannot prove that an individual dealer was checked.
  if (
    !input.sharedImporter &&
    input.lastRunStatus === "success" &&
    recent(input.lastRunAt)
  )
    return "no_rows";
  if (input.requiresAuth && !input.lastRunStatus && !input.activeRows)
    return "needs_login";
  return "needs_run";
}
