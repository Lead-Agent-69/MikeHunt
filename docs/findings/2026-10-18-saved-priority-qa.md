# Saved Priority QA

Scope: local signed-in QA for #444. This is not a production rollout receipt or
whole-app performance, inventory, alert-delivery or recovery certification.

## Changes

- Remove the device-only count from primary navigation instead of presenting it
  as an account total. Account/device sections keep their explicitly scoped counts.
  This intentionally replaces the proposed union badge with no numeric badge;
  there is no new global saved-count request or polling.
- Keep optional URL import collapsed, with a visible labeled disclosure. Leave
  availability filters visible. Use one filter row at 390px without smaller targets.
- Put account-saved titles and price evidence before the image on mobile/tablet;
  reserve side-by-side photos and actions for desktop width.
- Invalidate both page and infinite-collection caches for only the confirmed save's
  owner. A cached empty Saved page must not hide a successful Market save.

## Observed Browser Checks

Local server: `http://localhost:3006`, explicitly connected to local Supabase, with
external alert/AI credentials excluded from the server process. Used clearly marked
local QA fixtures, not production watchlist mutations.

| Check                                                | Result                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Visit empty Saved, save from Market, return to Saved | Initially reproduced stale empty account view; after fix a second save appeared without reload                          |
| Save/reload persistence                              | Account rows and advertised amounts present                                                                             |
| 390 x 844                                            | First title and price visible; price bottom 635px, bottom navigation top 786px; no horizontal overflow                  |
| 768 x 1024                                           | Initial cramped content column found and fixed; price bottom 591px, full-width readable content; no horizontal overflow |
| 1440 x 900                                           | Side photo and price visible; no horizontal overflow                                                                    |
| Source images                                        | Both local fixture preview images loaded; reused fixture imagery is not production source accuracy proof                |
| Add a listing link                                   | Expands to a visible input at least 44px high; collapses again without submitting                                       |
| Account isolation regression                         | Invalidating one owner's saves leaves another owner's cached data and requests untouched                                |
| Off-page cache invalidation regression               | No request until the collection mounts; one refreshed request then displays the new save                                |

Private screenshots are outside Git under the operator evidence directory. No
production account rows, auth cookies, keys or backup archives are committed here.

## Release Checklist

- [ ] Final-source typecheck, lint, complete unit suite and production build pass.
- [ ] PR CI passes for the exact reviewed head; merge and deploy verified separately.
- [ ] Read-only signed-in production check at phone/tablet/desktop after deployment.
- [ ] Production backup exported, encrypted, downloaded and restored independently.

The last item remains blocked on the existing primary database credential and
independent recovery-key custody. Keep the installed retention job inactive.
