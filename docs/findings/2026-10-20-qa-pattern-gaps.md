# QA pattern gaps — 2026-10-20

Follow-up to the actual-outcome release (#498) and earlier inventory/mobile QA.

## Confirmed gaps fixed

- Pipeline average margin used inventory defaults instead of reviewed actual costs. Its net and sale-timing metrics now use the same complete outcome ledger as Intelligence, matched to sold inventory. Wholesale units no longer count as active capital. Holding cost is explicitly modeled using the recorded daily rate or $35/day fallback.
- Browser screenshot review also exposed independently cached capital panels after a sale. All Pipeline panels now share the same inventory snapshot. Sold/wholesale cards no longer accrue modeled holding costs; recorded inventory totals remain separate from projections to avoid double counting.
- Numeric zero sale proceeds vanished during inventory mapping. Zero and missing amounts now remain distinct across reloads.
- A successful Pipeline sale could silently fail to copy into its outcome record. The API checks errors and revision-write acknowledgements, preserves existing sales, and returns the separate review status. The UI confirms the saved sale and links to actual-cost review; it does not invite a second sale write. Acquisitions retain their recorded purchase date in the seed.
- Outcome save acknowledgements checked amounts but omitted dates and notes. Shared comparison now checks normalized money, dates, sale channel and notes. Late replies after the editor unmounts cannot run its saved callback. Record IDs are canonicalized before server confirmation.
- Conflict reload failure could remove the editor. Drafts remain mounted and reload errors are caught; retries use the same record ID. Successful writes remain confirmed even if a subsequent history refresh fails.
- Duplicate complete outcome selection depended on input ordering in some consumers. Shared deduplication now takes the newest complete record; timing queries explicitly order bounded results. Calibration uses that same selector.
- Discover's summary presented asking-price movement as a buy/wait instruction. It now describes observed asking-price trends, requires at least five observations, and omits nonfinite changes. The timing API's explanation likewise avoids asserting future returns.
- A transient connectivity probe failure left the global offline banner stuck until a browser online event. The provider now retries failures, rechecks on focus/visibility, ignores superseded requests and cancels probes on unmount.
- Earlier recovery status documentation was stale. The private October 19 receipt confirms the production restore/upload proof; independent off-device recovery-key custody is still pending.

## Validation

Focused behavioral tests cover reviewed metrics, losses, missing costs, wholesale exclusion, zero-sale mapping, revision races, failed outcome copies, stale acknowledgements, reload failure and account changes. Local browser coverage exercises actual saves with a deliberately lost response after the write succeeds, then an idempotent retry and loss edit, in both themes at desktop, 320px and 390px. A separate mocked Pipeline browser flow checks the real UI's zero-sale handoff and narrow-screen overflow without adding inventory records.

Full verification, CI and live deployment results belong in the release receipt. This audit does not certify every possible app state. #434 still requires physical Safari/iOS performance verification; #445 still requires independent owner-controlled recovery-key custody. Retention cleanup remains paused.
