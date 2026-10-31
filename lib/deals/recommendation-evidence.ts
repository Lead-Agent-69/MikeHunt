import { dealBriefEvidence } from "./deal-brief-evidence";
import { SOURCE_PRICE_FIELDS } from "./source-price-context";
import { APP_ORIGIN } from "@/lib/brand";

/** Project the facts required by the existing decision gate, not a legacy score alone. */
export const RECOMMENDATION_FIELDS = `id,year,make,model,trim,vin,active,first_seen_at,location_state,sell_estimate,mmr_value,true_net_profit,recommended_max_bid,deal_verdict,deal_analysis,profit_score,title_source:options->>titleSource,${SOURCE_PRICE_FIELDS}`;

export function recommendationEvidence(row: any) {
  const evidence = dealBriefEvidence(row);
  return {
    ...evidence,
    profit: evidence.ready ? (row.true_net_profit as number) : null,
    maxBid: evidence.ready ? (row.recommended_max_bid as number) : null,
  };
}

export function recommendationText(row: any, allowEconomics: boolean) {
  const evidence = recommendationEvidence(row);
  const amount = evidence.price.amount;
  const parts = [
    `${row.year || "Year unknown"} ${row.make || ""} ${row.model || ""}`.trim(),
    `${evidence.price.label}: ${amount == null ? "not established" : `$${amount.toLocaleString()}`}`,
    evidence.ready
      ? "Buy candidate; confirm final terms"
      : evidence.decision.label,
    `Source: ${row.source || "unknown"}${row.source_url ? ` (${row.source_url})` : ""}`,
    `Observed: ${row.last_seen_at || "unknown"}`,
    `Listing: ${APP_ORIGIN}/deal/${encodeURIComponent(row.id)}`,
  ];
  if (allowEconomics && evidence.ready) {
    parts.push(
      `Evidence-backed estimated net: $${evidence.profit!.toLocaleString()}; maximum bid: $${evidence.maxBid!.toLocaleString()}. Estimates are not guarantees.`,
    );
  } else {
    parts.push(
      "Profit and purchase ceiling are not established for this response.",
    );
  }
  parts.push(`Next check: ${evidence.decision.nextCheck}`);
  return parts.join(" · ");
}
