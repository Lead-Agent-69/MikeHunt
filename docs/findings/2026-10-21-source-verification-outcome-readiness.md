# Source price observations and outcome review

Recent source observation and actual owner transactions are separate evidence. This change improves both collection paths without manufacturing either.

- The polite crawler returns the time a response body was fetched or conditionally revalidated. Reading a cached body retains its original time.
- D&G native inventory price evidence carries that observation time through the shared dealer CMS crawl.
- The write guardian compares unchanged price observation timestamps by UTC day, preserving the exact source timestamp in each saved payload. Changed prices or evidence meaning still require a write. Existing daily write limits remain enforced.
- Shared dealer detail enrichment records explicit purchase, payment or reference terms only after matching the vehicle identity. Related cars, scripts and site-wide finance advertisements are excluded. A different known VIN cannot replace the current vehicle's details.
- Unlabelled structured offer amounts remain unverified. Conflicting cash prices fail closed in the shared acquisition-price classifier, including when stored descriptions are reinterpreted during ingestion.
- A detail page without explicit terms retains a price already established on the inventory card, with the card's own observation time.
- Manually entered historical or undated purchases cannot capture today's forecast. Calibration also excludes legacy predictions captured on a later calendar day than purchase. Existing actual history is retained.
- Outcomes and learning has a filter for reported sales needing review, specific missing details on each record, and editor shortcuts to those fields. Missing expenses are not filled with zeros. Completed records leave the review list after a confirmed save.

## Evidence before release

Read-only production audit at 2026-10-21 19:10 UTC found zero owner outcome records. It found 155 recently observed D&G listings with asking-price evidence but no observation date. Those are historical observations, not a statement of current inventory availability.

A fresh, policy-checked D&G inventory probe at 19:14 UTC parsed 150 current eligible listings. All 150 carried asking-price evidence and the actual response observation time through the updated parser. The probe performed zero database writes. Normal ingestion must refresh production records; this release does not mass-label other sources' amounts as cash.

Validation and release receipts are saved separately with the exact commit and deployment identifiers. Real purchase dates, sale amounts and reviewed expenses are still required before personal profit calibration can be measured. At least five eligible matched predictions are required per metric. This work does not certify future flip profits or complete market coverage.
