import type { DiscoverCoverage } from "@/lib/discovery/coverage";

export type CoverageNotice = {
  tone: "none" | "thin";
  headline: string;
  detail: string;
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Buyer-facing coverage notice for Discover. Only for status "thin" or "none";
 * "ok", "unavailable" and a missing block return null so nothing extra shows.
 * Every number is read straight from the API's coverage block.
 */
export function coverageNotice(
  coverage: DiscoverCoverage | null | undefined,
): CoverageNotice | null {
  if (!coverage) return null;
  if (coverage.status !== "thin" && coverage.status !== "none") return null;

  const days = coverage.windowDays;
  const states = coverage.byState.map((s) => s.state);
  const where = states.length ? states.join(", ") : "all states";

  if (coverage.status === "none" || coverage.freshRows === 0) {
    return {
      tone: "none",
      headline: `No fresh listings in ${where} in the last ${plural(days, "day")}.`,
      detail:
        "We only show listings we have actually seen recently, so this area is empty for now.",
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
