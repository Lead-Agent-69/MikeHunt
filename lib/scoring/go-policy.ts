export const MIN_GO_NET_PROFIT = 3000;

export function goProfitFloor(targetProfit?: number | null): number {
  return typeof targetProfit === "number" && Number.isFinite(targetProfit)
    ? Math.max(MIN_GO_NET_PROFIT, targetProfit)
    : MIN_GO_NET_PROFIT;
}

/** A profit floor can demote a GO, never promote a weaker evidence verdict. */
export function enforceGoProfitFloor(
  verdict: "GO" | "HOLD" | "PASS",
  profit: number | null | undefined,
  targetProfit?: number | null,
): "GO" | "HOLD" | "PASS";
export function enforceGoProfitFloor(
  verdict: "go" | "hold" | "pass",
  profit: number | null | undefined,
  targetProfit?: number | null,
): "go" | "hold" | "pass";
export function enforceGoProfitFloor<T extends string | null | undefined>(
  verdict: T,
  profit: number | null | undefined,
  targetProfit?: number | null,
): T | "hold" | "HOLD";
export function enforceGoProfitFloor(
  verdict: string | null | undefined,
  profit: number | null | undefined,
  targetProfit?: number | null,
): string | null | undefined {
  if (verdict?.toLowerCase() !== "go") return verdict;
  if (
    typeof profit === "number" &&
    Number.isFinite(profit) &&
    profit >= goProfitFloor(targetProfit)
  )
    return verdict;
  return verdict === "GO" ? "HOLD" : "hold";
}

/** Protect already-stored verdicts until the approved inventory is rescored. */
export function applyGoProfitPolicy<T extends Record<string, any>>(
  row: T,
  targetProfit?: number | null,
): T {
  const raw = row.true_net_profit ?? row.trueNetProfit ?? row.netProfit;
  const profit =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number(raw)
        : null;
  const out = { ...row };
  let demoted = false;
  for (const key of ["deal_verdict", "dealVerdict", "verdict"] as const) {
    if (typeof row[key] === "string") {
      const verdict = enforceGoProfitFloor(row[key], profit, targetProfit);
      demoted ||= verdict !== row[key];
      Object.assign(out, { [key]: verdict });
    }
  }
  if (demoted) {
    if ("is_arbitrage_opportunity" in row)
      Object.assign(out, { is_arbitrage_opportunity: false });
    const withoutBuyUrgency = (prediction: Record<string, any>) => ({
      ...prediction,
      urgency: "none",
      ...(Array.isArray(prediction.reasons)
        ? {
            reasons: prediction.reasons.filter(
              (reason: unknown) =>
                typeof reason !== "string" ||
                !/act now|won't last/i.test(reason),
            ),
          }
        : {}),
    });
    if (row.prediction && typeof row.prediction === "object")
      Object.assign(out, { prediction: withoutBuyUrgency(row.prediction) });
    for (const key of ["dealAnalysis", "deal_analysis"] as const) {
      const analysis = row[key];
      if (analysis?.prediction && typeof analysis.prediction === "object")
        Object.assign(out, {
          [key]: {
            ...analysis,
            prediction: withoutBuyUrgency(analysis.prediction),
          },
        });
    }
  }
  return demoted ? out : row;
}
