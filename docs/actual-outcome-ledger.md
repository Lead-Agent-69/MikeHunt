# Actual outcomes and personal learning

Use **Outcomes and learning** (`/insights`), or **Track the actual result** in the listing's Plan and record panel. Save the actual purchase first; edit that same record when the vehicle sells.

Record the vehicle prices before fees, purchase and sale dates, buyer fees, tax/title, repair/preparation, transport, holding/financing, selling expenses and other costs. Enter an explicit zero where a cost does not apply. Zero proceeds are supported for a total-loss exit. Confirm the reviewed amounts before the app calculates net profit, all-in cost and ROI before income tax. Editing clears that confirmation.

Incomplete records and historic gross spreads do not count as net profit. Existing combined fees remain visible for review and allocation; the app does not invent their categories. Pipeline sale transitions need an owner cost review and do not replace an existing reported sale.

These amounts are owner-reported records, not independently verified sale prices. Personal calibration requires at least five complete purchase outcomes with supported predictions captured before the reported sale date; each adjusted metric requires five valid matched pairs. Historical profit agreement remains unavailable without sufficient profit predictions. A completed sale entered retrospectively does not receive a reconstructed prediction. Losses and zero-cost items remain in the statistics. Duplicate records of the same inventory purchase count once.

Saving uses a stable record ID for retries. Updates check both account ownership and the saved revision. A concurrent edit asks the owner to reload the saved version and retains unsaved fields. Predicted values are assigned by the server and frozen in the database; authenticated direct writes cannot manufacture a trusted snapshot. RLS restricts records to their owner.

## Release order and validation

Apply only `supabase/migrations/20261020045530_actual_outcome_cost_ledger.sql` to the verified MikeHunt project, record that migration version, then deploy the application. The additive migration preserves historical rows as unreviewed. Do not apply unrelated pending migrations as part of this release.

Financial and ownership SQL regression: run `supabase/tests/actual_outcome_ledger.sql` against the local QA stack only. It creates temporary fixture accounts within a transaction and rolls back. Unit tests cover financial completeness, prediction evidence, ownership, retry and revision behavior. `e2e/outcome-ledger.spec.ts` exercises the real local save/edit flow and a failed-save retry in both themes at phone and desktop sizes, then removes only its own fixture records. Production verification is read-only.
