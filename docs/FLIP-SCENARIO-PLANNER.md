# Flip scenario planner

Reseller and dealer desks open a listing, then **Plan and record → Costs, seller, and private notes**. The planner is a user-entered scenario, separate from verified purchase decisions and logged outcomes.

- Every cost must be entered, including an explicit zero where none applies. Missing costs suppress all calculated returns and purchase limits.
- Purchase/resale amounts, fixed and percentage buyer/selling fees, tax/title/registration, repair/preparation, transport, total holding/financing costs, reserve and target profit are explicit inputs. Quotes must be checked again when a purchase price changes.
- Current cash asking or buy-now evidence can be copied on request. Bids, deposits, payments, reference values, unknown amounts and stale price observations cannot silently seed purchase costs. A supported resale estimate can be copied with its evidence label; manual resale assumptions remain possible.
- Total cost includes selling fees. ROI is net profit divided by all-in cost; margin is net profit divided by resale. Break-even resale accounts for percentage selling fees. Purchase limits are rounded down to preserve the entered profit target and never establish a verified bid recommendation.
- The two downside tests use explicitly labeled 10% lower resale and, for the combined test, double the entered holding cost. They are scenarios, not estimated probabilities or sale forecasts.
- Explicitly saved drafts use local browser storage, namespaced by signed-in account and listing. The save timestamp and a quote recheck reminder accompany restored drafts. They do not synchronize across devices, record a sale or complete inspection/evidence gates.

`POST /api/deal/max-bid` uses the same arithmetic in `lib/scoring/flip-scenario.ts`. Send `{ "scenario": { ... } }` using the fields exported as `SCENARIO_FIELDS`. Numeric values or decimal strings are accepted, with at most two decimals. Missing values return `status: "needs_inputs"`, `metrics: null` and `max_bid: null`; invalid inputs return HTTP 400. Complete responses distinguish `roi_pct` from `margin_pct`. `acquisitionReady` is always false for this calculation. Legacy field aliases remain accepted, but source names no longer imply fee quotes and missing fees never default to zero.

The old unused `components/shared/MaxBidCalculator.tsx`, which invented resale, repair and transport defaults, is retired. The backend arbitrage fee heuristic remains in its existing modeled/evidence-gated engine; it is not used to supply this planner's costs. Automatic buy recommendations still require current sold comparisons, identity, title/inspection and confirmed costs under the existing decision guard.
