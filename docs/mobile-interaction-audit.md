# Mobile Interaction Audit

October 4, 2026. Local server :3002; existing signed-in session. This is a partial interaction audit, not exhaustive end-to-end certification.

| Surface              | Exercised                                                                                   | Result                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header location      | Open while page is scrolled, search Missouri and New Hampshire, toggle, dismiss with Escape | Reproduced clipped overlay. Fixed with body portal, independent scrolling, viewport sizing, focus restoration, labelled selection and 44px targets. Verified at 320px and current mobile width.                  |
| Location preferences | Code path for unsuccessful HTTP save                                                        | Fixed false-success behavior. Actual remote persistence and multi-state results still need live verification.                                                                                                    |
| Account menu         | Open and navigate to Settings                                                               | Reproduced menu remaining open; handlers now close before navigating. Escape and larger targets added.                                                                                                           |
| Settings             | Open and inspect controls                                                                   | Loads; dealer-first copy, mixed save behavior and notification delivery claims still need review. No credentials changed.                                                                                        |
| Saved                | Open, inspect active card, click unavailable filter                                         | Fixed cramped filters, internal `gone` label and literal HTML entities. Empty filtered list still confusingly changes cloud readiness; must separate filter results from account readiness. No vehicles deleted. |
| Pipeline             | Navigate and inspect empty state                                                            | Opens. Owned-vehicle actions untested because this session has no owned units; no purchase fabricated.                                                                                                           |
| Deal Check           | Navigate, submit incomplete text                                                            | Friendly failure and retry present, but photo-specific error was wrong for text input. Corrected to request vehicle details; extracted output still requires validation.                                         |

## Next Interaction Coverage

- Discover and Scan: apply/clear single and multi-state location, budget, source and title filters; inspect exact returned request scope.
- Location: save/reopen/reload; failed save must retain retryable selection; test soft keyboard, all selected states, and long names at 390/430/768/1440px.
- Saved: selection/comparison, available and unavailable rows, recoverable removal, cloud sync failure, replacements.
- Auction: watchlists, current bid versus buy-now, source link, missing closing time.
- Pipeline: owned test fixture, task progression, quotes/costs/outcomes, rollback of test changes.
- Login/register/onboarding: confirmation, show password, persistence and recovery; production and admin must be verified separately.
- Settings: immediate toggle persistence, explicit profile save, accurate notification status.
- Source/admin views: authorization-negative tests and raw diagnostic isolation.
- Deal detail still has legacy heuristic panels, duplicate outcome controls, and unverified purchase calculations outside the top evidence notice. They are not certified by this usability pass.

No geolocation permission accepted, no passwords changed, no purchases recorded, and no production deployment performed.
