import { goProfitFloor } from "@/lib/scoring/go-policy";

/** Query policy and serialized verdicts must agree before legacy rows are rescored. */
export function applyGoVerdictFilter(
  query: any,
  verdict: string,
  targetProfit?: number | null,
) {
  const floor = goProfitFloor(targetProfit);
  if (verdict === "go")
    return query.eq("deal_verdict", "go").gte("true_net_profit", floor);
  if (verdict === "hold")
    return query.or(
      `deal_verdict.eq.hold,and(deal_verdict.eq.go,true_net_profit.lt.${floor}),and(deal_verdict.eq.go,true_net_profit.is.null)`,
    );
  return query.eq("deal_verdict", verdict);
}
