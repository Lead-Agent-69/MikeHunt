import type { DiscoverCoverage } from "@/lib/discovery/coverage";

export type CoverageNotice = {
  tone: "none" | "thin" | "scanning" | "unavailable";
  headline: string;
  detail: string;
};

export type CoverageWarming = {
  /** True when the user recently saved home/search locations and Zeus may still be filling in. */
  scanning?: boolean;
  states?: string[];
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Missing and adequate coverage stay quiet; unavailable coverage is never treated as empty.
 * Every number is read straight from the API's coverage block.
 *
 * A recent location preference save is not evidence of a running collection job.
 * Keep that acknowledgement separate from inventory counts; never promise an ETA.
 */
export function coverageNotice(
  coverage: DiscoverCoverage | null | undefined,
  warming?: CoverageWarming | null,
): CoverageNotice | null {
  if (!coverage) return null;
  if (coverage.status === "unavailable")
    return {
      tone: "unavailable",
      headline: "We couldn't check inventory coverage.",
      detail:
        "Available results may be incomplete. This does not mean there are no cars for sale; we couldn't confirm how recently the sources were checked.",
    };
  if (coverage.status !== "thin" && coverage.status !== "none") return null;

  const days = coverage.windowDays;
  const states = coverage.byState.map((s) => s.state);
  const where = states.length ? states.join(", ") : "nationwide";
  const scanStates =
    warming?.states?.filter((s) => /^[A-Z]{2}$/.test(s)) || states;
  const scanWhere = scanStates.length ? scanStates.join(", ") : where;

  const sameSearchArea =
    states.length > 0 &&
    states.length === scanStates.length &&
    scanStates.every((state) => states.includes(state));
  if (warming?.scanning && sameSearchArea) {
    return {
      tone: "scanning",
      headline: `Search area updated: ${scanWhere}.`,
      detail:
        coverage.status === "none" || coverage.freshRows === 0
          ? "No recent listings have been seen here yet. Changing your search area doesn't guarantee an immediate source refresh. Save a search for alerts or widen your area."
          : `${plural(coverage.freshRows, "recent listing")} seen in the last ${plural(days, "day")}. Changing your search area doesn't guarantee an immediate source refresh. These results are not the whole market.`,
    };
  }

  if (coverage.status === "none" || coverage.freshRows === 0) {
    return {
      tone: "none",
      headline: `No recent listings for ${where} yet.`,
      detail:
        "This isn't a complete view of cars for sale. Only listings our sources have seen appear here; updates aren't instant. Widen your area or save a search for alerts.",
    };
  }

  const count = `${coverage.capped ? "at least " : ""}${plural(coverage.freshRows, "recent listing")}`;
  const perState =
    coverage.byState.length > 1
      ? ` (${coverage.byState.map((s) => `${s.state} ${s.rows.toLocaleString()}`).join(", ")})`
      : "";
  const sources = plural(coverage.sourceCount, "source");
  return {
    tone: "thin",
    headline: `Limited results for ${where}.`,
    detail: `${count} seen in the last ${plural(days, "day")}${perState}, from ${sources}. These results are not the whole market; updates aren't instant.`,
  };
}
