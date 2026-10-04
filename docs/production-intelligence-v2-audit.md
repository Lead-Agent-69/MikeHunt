# Production Intelligence V2: First Safeguard Batch

Updated October 4, 2026. This is an implementation map, not a declaration of production readiness.

## Authorities and Current Status

| Surface                     | File / function                                                 | Status                                                                                                                                                          |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scenario arithmetic         | lib/scoring/profit-calculator.ts / calculateProfit              | Implemented; explicit zero overrides now retained. Default repairs and selling-time assumptions remain scenarios, not evidence.                                 |
| Scraped valuation / scoring | lib/scoring/deal-analyzer.ts / analyzeDeal                      | Implemented; legacy baseline, title multipliers and ask anchoring still need cohort validation. Numerical outputs are not independently verified market values. |
| Recommendation eligibility  | lib/intelligence/decision-guard.ts / assessDecisionEvidence     | Tightened: require usable identity, non-low valuation confidence and explicit purchase evidence gates. Legacy GO alone cannot satisfy checks.                   |
| Spotlight ranking           | app/api/deals/best-buy/route.ts                                 | Research fallback retained. ROI denominator changed to recorded total costs. Ranking still uses legacy heuristic liquidity; no validated demand forecast.       |
| Spotlight requests          | components/deal/NextBestBuySpotlight.tsx                        | Abort and ignore superseded requests; clear old scoped result; friendly retry on failed requests. Highest-margin claim removed.                                 |
| Deal Check                  | app/api/deals/[id]/route.ts; app/(dashboard)/deal/[id]/page.tsx | Non-ready GO demoted; evidence notice replaces purchase/profit/forecast panels until gates pass. User calculators and research remain available.                |
| VIN enrichment              | lib/vehicle/nhtsa.ts / decodeVinBatch                           | Prior local changes tested; not an offline database implementation.                                                                                             |

## Evidence Gate Contract

`dealAnalysis.evidenceGates` / stored `deal_analysis.evidenceGates` supports boolean
`priceMeaningConfirmed`, `titleReviewed`, `conditionInspected`, `costsConfirmed`.
Only literal true passes. These must be written by authorized evidence workflows,
not inferred from a listing's price, a seller's clean-title claim or a legacy score.
No new evidence-writing endpoint is added in this batch. Historical records without
these checks intentionally stay research-only. A candidate is not purchase approval.

Next phase must attach provenance, dates, jurisdiction, scope, evidence versions and
inspection/quote references to each check and validate them before promotion.
Comparables remain asking-price evidence unless transactions are independently established.

## Remaining Work and Gates

1. Normalize price types and price provenance at adapter ingestion (bid, buy-now, down payment, finance terms, unknown).
2. Add versioned evaluation snapshots with nullable unsupported valuation, profit, ROI and maximum price across all consumers. Legacy numeric estimates still exist in storage/APIs; hiding a panel is not a data migration.
3. Unify card, comparison, alert and pipeline authorities with the same scenario and evaluation version.
4. Implement provenance-backed inspection/title/cost workflows before enabling evidence gate writers.
5. Audit permitted pilot source retrieval, real detail fixtures, partial-run retirement safety and related-source deduplication. No new source enabled here.
6. Verify normal login, onboarding save, Google OAuth and real save/purchase/repair/sale mutations. Prior production login failure remains unresolved.
7. Validate pricing cohorts and demand with holdouts and outcome evidence before publishing accuracy or national coverage claims.

## Rollout and Recovery

No database migration or production source switch is performed. Deploy code only
after checks. Existing estimates remain intact and must not be labeled recalibrated.
Rollback is a code-release rollback; it does not require deleting evidence or saved vehicles.
Do not bypass this research gate to restore the old quantity of buy recommendations.
