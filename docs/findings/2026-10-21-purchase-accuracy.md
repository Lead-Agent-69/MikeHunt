# Purchase accuracy and professional workflow audit

## Confirmed and repaired

- A lost purchase acknowledgement allowed another inventory insert. The purchase form now retains an opaque, account-and-listing-specific ID in the current browser tab; the database primary key makes repeated and overlapping requests replay the saved purchase. Different paid amounts, dates, vehicle identities or costs return a conflict instead of replacing recorded facts. Account filters apply to both reads and conflict recovery.
- Purchase creation accepted missing paid amounts, unsupported precision, negative costs, arbitrary stages and malformed vehicle fields. The server now validates these before opening the database, requires an explicit actual purchase date and paid amount, starts purchases at Acquired, and preserves unknown condition and reference values.
- Inventory creation dropped `deal_id`, photos and mileage. Source-linked purchases now retain the server's vehicle identity, photo evidence and mileage, including zero. Pipeline displays the shared gallery and a link back to the source listing. A stored photo URL is not proof that it still loads; unavailable images retain an honest fallback.
- Purchase outcome seeding ignored returned database errors. Purchase confirmation now reports outcome tracking separately from the successful inventory write. A deterministic seed ID prevents seed retries from duplicating the outcome; retries do not reconstruct a later prediction. Historical purchase entries do not receive a newly captured prediction. Auto-seeded costs remain unreviewed.
- Purchase recording used entry time as the acquisition date. The owner now enters the actual calendar date, stored consistently in the inventory and outcome record. Future and impossible dates are rejected.
- Pipeline cost rows rounded actual amounts to whole dollars. Recorded cost rows and the summary retain cents.
- The summary's “Total Invested” mixed recorded costs with modeled holding. It now displays recorded costs separately. “Estimated Profit” displayed zero without a reference; the replacement reference spread shows unavailable when no reference exists and names how many active units contribute. This is a spread before unrecorded costs, not net profit.
- Capital pressure capped the displayed ratio at 100%. Only the bar width is now capped; the text retains ratios above 100%, and zero capital produces an unavailable ratio.
- Expense updates silently rounded unsupported precision and permitted oversized totals. They now reject invalid actual amounts and totals. A recovered sale outcome preserves an explicit zero purchase and uses the inventory ID for seed retry safety. Update errors no longer expose raw database messages.

## Live evidence, 2026-10-21 07:23 UTC

Read-only queries against the MikeHunt project and the public status endpoint found:

| Evidence                                               | Observed count |
| ------------------------------------------------------ | -------------: |
| Stored active rows                                     |         36,507 |
| Current buyer-visible photo rows, source-health rollup |          2,219 |
| Current rows with source links                         |          2,219 |
| Current rows with location                             |          1,474 |
| Current rows with VIN                                  |          1,170 |
| Current rows with mileage                              |          1,720 |
| Current rows with price presence                       |          2,155 |
| Current rows with title data                           |          2,051 |
| Completed owner outcome records                        |              0 |

These are time-specific observations. “Price presence” does not establish a confirmed cash price. In the fresh photo set, 1,117 rows lacked an explicit stored price-evidence kind; 1,038 were asking, 43 reference, and 21 unknown. Runtime evidence parsing can further classify a stored row; missing tags are not permission to treat advertised amounts as purchase prices.

The public status reported buyer readiness true and decision readiness false. Its broader fresh-photo count was 2,291; the source rollup also excludes ended auctions and applies the customer visibility rules. Neither count means nationwide completeness or working photos on every source.

## Next evidence work

1. Expand current, source-confirmed coverage and location detail. Keep retained historical rows separate from current inventory; measure coverage by source and geography rather than citing the raw stored count.
2. Enrich missing price evidence from source detail pages. Preserve asking prices, bids, payments, buy-now amounts and reference values separately; never infer a cash price merely to improve completeness.
3. Collect real, reviewed purchase/sale outcomes with every expense before evaluating resale or profit accuracy. Current listing volume cannot establish transaction prediction accuracy. Preserve the existing readiness gates and evidence thresholds.
4. Recheck image reachability and freshness through the existing bounded maintenance pipeline. An available gallery frame and a stored image URL are separate checks.
5. Complete the separately tracked physical iPhone performance check and independent backup recovery-key custody check. The encrypted off-device backup and isolated restore proof already exist.

## Verification and practical limits

Regression tests cover malformed purchase bodies, actual amount/date bounds, zero values, source mismatches, owner isolation, duplicate insert conflicts, lost acknowledgements, stage changes, separate seed failures and conservative prediction recovery. Browser QA uses real local accounts and database writes, drops a successful response deliberately, retries the same record, checks one inventory/outcome pair, and cleans up its own fixtures. Phone widths include 320 and 390 pixels.

No database migration or fabricated production records are required. Retry IDs persist within one browser tab when session storage is available; they do not deduplicate an independently initiated purchase from another tab or device. Blocked session storage retains retry safety only while the form remains mounted. This release does not certify every listing, nationwide completeness, physical iPhone performance, or prediction accuracy.
