import type { DiscoverCoverage } from "@/lib/discovery/coverage";

export type CoverageNotice = {
  tone: "none" | "thin" | "scanning";
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
 * Buyer-facing coverage notice for Discover. Only for status "thin" or "none";
 * "ok", "unavailable" and a missing block return null so nothing extra shows.
 * Every number is read straight from the API's coverage block.
 *
 * When `warming.scanning` is set (prefs.locationDemandAt within the warming window),
 * thin/none copy becomes an honest "Scanning your state…" instead of a dead empty.
 */
export function coverageNotice(
  coverage: DiscoverCoverage | null | undefined,
  warming?: CoverageWarming | null,
): CoverageNotice | null {
  if (!coverage) return null;
  if (coverage.status !== "thin" && coverage.status !== "none") return null;

  const days = coverage.windowDays;
  const states = coverage.byState.map((s) => s.state);
  const where = states.length ? states.join(", ") : "all states";
  const scanStates =
    warming?.states?.filter((s) => /^[A-Z]{2}$/.test(s)) || states;
  const scanWhere = scanStates.length ? scanStates.join(", ") : where;

  if (warming?.scanning) {
    return {
      tone: "scanning",
      headline: `Scanning ${scanWhere}…`,
      detail:
        coverage.status === "none" || coverage.freshRows === 0
          ? "We prioritized your home and search states for the free Zeus scrapers. Fresh local listings usually appear within about an hour; this feed only shows cars we have actually seen."
          : `Coverage is still thin (${plural(coverage.freshRows, "fresh listing")} in the last ${plural(days, "day")}). Keep browsing — new rows land as the scanners finish each source.`,
    };
  }

  if (coverage.status === "none" || coverage.freshRows === 0) {
    return {
      tone: "none",
      headline: `No fresh listings in ${where} in the last ${plural(days, "day")}.`,
      detail:
        "We only show listings we have actually seen recently, so this area is empty for now. Save your home state in Settings to prioritize a scan.",
    };
  }

  const count = `${coverage.capped ? "at least " : ""}${plural(coverage.freshRows, "fresh listing")}`;
  const perState =
    coverage.byState.length > 1
      ? ` (${coverage.byState.map((s) => `${s.state} ${s.rows.toLocaleString()}`).join(", ")})`
      : "";
  const sources = plural(coverage.sourceCount, "source");
  return {
    tone: "thin",
    headline: `Coverage is thin in ${where}: ${count} in the last ${plural(days, "day")}${perState}, from ${sources}.`,
    detail:
      "Results here are a partial view of the market, not everything for sale.",
  };
}
