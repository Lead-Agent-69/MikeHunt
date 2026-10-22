import { createHash } from "node:crypto";
import { assessDecisionEvidence } from "@/lib/intelligence/decision-guard";
import { economicsEvidenceReady } from "./economics-evidence";
import { sourcePriceContext } from "./source-price-context";
import { titleBadgeModel } from "./title-badge-model";
import { titleSourceOf } from "./title-category";

/** A saved verdict or provider response cannot bypass today's purchase evidence. */
export function dealBriefEvidence(d: any) {
  const price = sourcePriceContext(d);
  const decision = assessDecisionEvidence({
    ...d,
    damageType: d.damage_type,
    askPrice: price.cashPrice,
    buyNowPrice: price.buyNowPrice,
    priceEvidence: { kind: price.kind },
    dealVerdict: d.deal_verdict,
    dealAnalysis: d.deal_analysis,
  });
  const title = titleBadgeModel({
    condition: d.condition,
    damageType: d.damage_type,
    titleSource: titleSourceOf(d),
  });
  const ready =
    decision.acquisitionReady &&
    economicsEvidenceReady(d.deal_analysis) &&
    price.comparisonEligible &&
    price.observationCurrent &&
    title.category === "clean" &&
    !title.unconfirmed &&
    !title.weak &&
    d.active === true &&
    [d.sell_estimate ?? d.mmr_value, d.recommended_max_bid].every(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    ) &&
    typeof d.true_net_profit === "number" &&
    Number.isFinite(d.true_net_profit);
  const facts = {
    version: 1,
    ready,
    identity: [d.title, d.year, d.make, d.model, d.trim, d.vin, d.mileage],
    listing: [
      d.source,
      d.source_url,
      d.location_state,
      d.active,
      d.last_seen_at,
      d.auction_end_at,
    ],
    title: [d.condition, d.damage_type, title.label],
    price,
    economics: [
      d.sell_estimate,
      d.mmr_value,
      d.true_net_profit,
      d.recommended_max_bid,
      d.deal_verdict,
      d.profit_score,
    ],
    costs: d.deal_analysis?.costs,
    valuation: d.deal_analysis?.valuation,
    gates: d.deal_analysis?.evidenceGates,
  };
  return {
    ready,
    price,
    title,
    decision,
    key: createHash("sha256").update(JSON.stringify(facts)).digest("hex"),
  };
}

export function buildResearchDealBrief(d: any): string {
  const evidence = dealBriefEvidence(d);
  const mileage =
    typeof d.mileage === "number" &&
    Number.isFinite(d.mileage) &&
    d.mileage >= 0
      ? `Mileage reported: ${d.mileage.toLocaleString()} mi.`
      : "Mileage is missing; verify the odometer reading.";
  return [
    "Needs evidence. A purchase recommendation, profit estimate and max bid are not established for this listing.",
    `Risks:\n- ${evidence.title.label}. Verify the title documents.\n- ${mileage}\n- ${evidence.price.label}; confirm the full purchase price, availability and required fees.`,
    `Verify:\n- ${evidence.decision.nextCheck}\n- Confirm inspection findings, repair, transport, selling and holding costs.\n- Use dated, comparable completed sales before estimating resale or profit.`,
  ].join("\n\n");
}
