# Inventory account QA — 2026-10-20

Follow-up to #499's outcome, Pipeline and mobile checks.

## Confirmed gaps fixed

- Inventory reads authenticated the session but did not confirm the account expected by the requesting screen. A request started for one account could return another account's rows into the earlier account's cache entry. Reads now send an expected owner, verify the response owner and every row, and use account-specific cache keys. The API keeps authorization tied to the server session and prevents caching personal inventory.
- Recon's manual request had no stale-response protection and retained old errors after a successful reload. It now shares the checked inventory fetcher, resets its workspace on account changes, and retries in place. Signed-out users receive a sign-in link.
- Purchase recording had no expected-account check. Purchase, expense, sale and stage writes now send the submitting account and accept only a matching row acknowledgement. The API rejects changed-account requests before querying inventory or creating a database client. Purchase responses use the same mapped item contract as reads and updates.
- Open forms and delayed callbacks could survive account changes. Account-specific workspaces discard drafts on a switch; unmounted forms ignore completed requests and cannot refresh or update the next account's screen.
- Confirmed purchases and stage changes did not invalidate other cached inventory views. The owner's other views now invalidate after confirmation, so client navigation cannot reuse a pre-purchase list or outdated Recon/Pipeline stage. The current confirmed view is preserved, as are other accounts' cache entries.
- Pipeline updates merged into a captured inventory snapshot. Overlapping successful updates now merge into the current cache so they preserve other completed updates.
- Missing results use a compact dash with an accessible explanation, preventing the word "Unavailable" from breaking across narrow metric tiles.
- Recon's calculated carrying costs now explicitly say they are estimates, consistent with Pipeline's separation of recorded and modeled costs.

## Validation

Behavioral tests exercise stale accounts before reads and writes, forged owner fields, mismatched row confirmations, sign-out, delayed responses, draft resets, connection recovery and concurrent cache updates. Local browser tests use two real authenticated accounts against the local database, check purchase and stage acknowledgements, reject stale-account reads and writes, verify row isolation, and clean up their own records. Desktop, 320px and 390px checks cover the Recon-to-Pipeline handoff and financial evidence UI.

Full gate, CI and production results are recorded separately in the release receipt. This change requires no database migration. Physical iPhone performance (#434) and independent recovery-key custody (#445) remain separate external checks.
