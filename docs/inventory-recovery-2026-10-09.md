# Inventory recovery

## Implemented

- Persist dealer attempt history before crawling; older and never-attempted dealers precede recent attempts, with buyer-demand states breaking ties.
- Curated generic imports use direct public HTML with policy and robots checks on every inventory page and redirect, without escalation on access challenges.
- Preserve extracted VINs and offer detail links; do not collapse separate same-year/model vehicles that have distinct URLs, VINs, prices or mileage.
- Stop repeated inventory pages and exclude saved-vehicle account links from automatic discovery.
- Report database-accepted rows for generic and CDG dealers rather than attempted rows.
- Bound PostgREST ID lookup and freshness-touch URLs by encoded length, not just number of listings. A 479-car dealer failed its earlier 500-ID lookup with Bad Request.
- The smoke importer accepts demand states and optional dealer targets, honors cached write quotas, caps daily inserts/updates at 500 (the existing cache pauses at 80%), and reads back active inventory and observed rows.

## Observed

Production database: `qupzqpezslsbobhugswp.supabase.co`.

- Kentucky pass: 12 dealers attempted; 38 accepted rows across three yielding dealers; active independent-dealer inventory increased from 1,092 to 1,103.
- Florida/national pass: 20 dealers attempted; 92 accepted rows across four yielding dealers; active independent-dealer inventory increased from 1,103 to 1,122.
- Targeted Jarrett Ford Dade City retry: 479 vehicles parsed, 478 VIN identities enriched, 370 rows accepted after the bounded-lookup fix. Active independent-dealer inventory increased from 1,122 to 1,492. The smoke import reached its configured quota threshold and did not increase or reset it to write the remaining rows.
- These counts include refreshes. Net active growth is not the same as rows accepted or unique new vehicles; concurrent ingestion can also affect the before/after count.
- The separate local QA pass increased active dealer rows from 371 to 578. Do not count those as production additions.

No fabricated rows, expanded permission grants or database migrations. Policy-blocked sources remain blocked. Missing-price inventory still fails existing quality checks. JavaScript-only sources need an authorized API/feed or an independently reviewed adapter; they are not claimed as covered.

The running Docker worker must use the verified image for these scheduling and import fixes to persist in its always-on operation. Authorized Copart/eBay data access and wider state-by-state coverage remain separate requirements.
