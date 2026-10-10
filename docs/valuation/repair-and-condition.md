# Repair-cost range, condition scale, net range (production gap audit IV, items 1 + 3)

Modules: `lib/valuation/repair-baseline.ts`, `lib/valuation/condition-scale.ts`, `lib/valuation/net-range.ts`.
All pure, no I/O, not yet wired into `/api/arbitrage` (see "Wiring" below).

## What is data-backed vs heuristic

| Piece                                                                                  | Basis                                                                                                                 | Status                                                                                     |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `baseMid` (repair dollars per damage keyword)                                          | Existing `estimateRepairCost` table in `lib/scoring/profit-calculator.ts`                                             | Heuristic, already in production, unchanged                                                |
| Condition-only repair baseline                                                         | Existing `conditionReconBaseline` in `lib/arbitrage/constants.ts`                                                     | Heuristic, already in production, unchanged                                                |
| Low/high spread (`REPAIR_SPREAD`)                                                      | Round multipliers: ×0.6–×1.6 for visible body damage, ×0.5–×2.0 for flood/fire/frame/all-over/mechanical/unrecognised | **New heuristic**. Skewed up because hidden damage makes overruns more likely than savings |
| Seller-stated repair band                                                              | ×0.8–×1.5 around the listing's own estimate                                                                           | **New heuristic**                                                                          |
| Premium-make factor ×1.3                                                               | Higher parts list prices and specialised labor (aluminium bodies, ADAS recalibration)                                 | **New heuristic**, round number, no dataset                                                |
| Old-car factor ×0.85 (>= 15 years)                                                     | Used/aftermarket parts widely available                                                                               | **New heuristic**, round number, no dataset                                                |
| Severity factors (parts 0.20, fire 0.30, flood/severe 0.38, moderate 0.58, minor 0.85) | **Mirror** `SEVERITY_RULES` in `lib/scoring/condition-value.ts` (production)                                          | Heuristic, already in production; a test pins parity                                       |
| Grade factors (excellent 1.05, good 1.00, fair 0.90)                                   | excellent mirrors the certified/CPO uplift in condition-value; fair is a round number                                 | Heuristic                                                                                  |
| Net range arithmetic                                                                   | Same formula as `lib/arbitrage/engine.ts` (net = resale − ask − fees − transport − recon − repair − 9% selling)       | Arithmetic on the above                                                                    |

## Why no public repair dataset

We looked for free, licence-compatible data mapping make/model/year/damage type to parts and labor
dollars. Insurer and estimating-platform data (CCC, Mitchell, Audatex) is proprietary. NHTSA
(complaints, recalls, crash tests) and FARS have no repair-cost fields. RepairPal and consumer
guides publish ranges, but their terms don't allow bulk reuse. So the band is a documented
heuristic around the numbers we already ship, and every keyword-based estimate is labelled
`confidence: "low"`. Model is deliberately not used: we have no basis for per-model numbers.

## Calibration path

`deal_outcomes` captures real outcomes per closed deal. Once there are enough rows per damage
bucket (say n >= 20), replace `REPAIR_SPREAD` with observed p25/p75 of actual/estimated repair,
and the make factor with observed premium/non-premium ratios.

## Rules

- `estimateRepairCost` is unchanged; `estimateRepairRange(...).baseMid === estimateRepairCost(damage)`
  for every damage string (tested). With no make/year (or `{ vehicleFactors: false }`) `mid` is
  also identical.
- No damage and no condition → `0/0/0`, `confidence: "none"`: unknown, not a claim of no damage.
- The condition factor is vs a clean, typical comp. Title brands are handled by the arbitrage
  engine's same-title comps / `TITLE_DISCOUNT`; don't stack this factor on
  `titleSeverityMultiplier`, which already contains these damage numbers.
- Net range: low = low resale + high repair; high = high resale + low repair. Holding cost only when
  the caller passes it (opt-in).

## Wiring (deferred)

The engine (`lib/arbitrage/engine.ts`) and `constants.ts` are touched by open PRs #254, #268 and #276.
After they land, a small PR adds `spread.repairRange` and `spread.netRange` from these modules,
with `spread.repair` and `spread.net` unchanged (= mid / expected with no vehicle factor), so May's UI
contract does not move.
