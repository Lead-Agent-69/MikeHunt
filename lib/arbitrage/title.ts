// lib/arbitrage/title.ts
// Title lanes for resale comps. Built on the repo's titleClass (lib/discovery/categorize) and adds
// the one class it does not name: "rebuildable" (a salvage-branded car sold as repairable), which
// rides the salvage lane. A branded car is never valued off clean comps directly; see engine.ts.

import { titleClass } from "@/lib/discovery/categorize";

export type TitleLane = "clean" | "rebuilt" | "salvage" | "parts" | "unknown";

export function titleLane(title?: string | null): TitleLane {
  const c = String(title || "").toLowerCase();
  if (/rebuildable/.test(c)) return "salvage";
  return titleClass(c);
}

export function isBrandedLane(
  lane: TitleLane,
): lane is "rebuilt" | "salvage" | "parts" {
  return lane === "rebuilt" || lane === "salvage" || lane === "parts";
}

/**
 * Which comp lanes may value a listing in `lane` at face value (no discount):
 *   salvage (incl. rebuildable) → salvage comps only
 *   rebuilt                      → rebuilt comps only
 *   parts                        → parts comps only
 *   clean / unknown              → clean + unknown-title comps. An unknown-title comp can only be
 *                                  worth LESS than clean (it may be branded), so pooling it under a
 *                                  clean/unknown listing errs low, never inventing profit. Unknown
 *                                  listings are flagged title_unverified and lose confidence.
 */
export function compLanesFor(lane: TitleLane): readonly TitleLane[] {
  switch (lane) {
    case "salvage":
      return ["salvage"];
    case "rebuilt":
      return ["rebuilt"];
    case "parts":
      return ["parts"];
    default:
      return ["clean", "unknown"];
  }
}
