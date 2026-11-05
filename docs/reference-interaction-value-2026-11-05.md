# Reference-app interaction value

November 5, 2026. Baseline: released application `f928ac12`. This pass extends the existing web components; it does not introduce another navigation, gallery or search system.

| Reference                             | Where the buyer uses it                                        | Practical value                                                                                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nuvio mobile                          | Shared desktop/mobile navigation capsule                       | Preview a destination while dragging, commit once on release, and cancel an abandoned gesture. The rim, inner highlight, pressed state and reduced-motion path are already implemented.                               |
| Instagram                             | Market photographs, Feed photographs and full-photo previews   | Inspect multiple photographs, enlarge details, retry a failed image and retain the selected photograph on return. Feed now uses the existing horizontal-photo gesture while preserving vertical scrolling.            |
| TikTok                                | Discover → Feed                                                | Continue browsing as the next batch loads; retain existing vehicles after a failed request and retry explicitly. The vehicle Feed uses photograph cards, pagination and return anchors.                               |
| Tinder                                | Discover → Swipe                                               | Save or pass with a gesture or equivalent buttons, inspect before deciding, and Undo with persistence feedback. Decorative stamps and departing card copies must not become duplicate assistive or keyboard controls. |
| DoorDash / Apple interaction guidance | Market search, location/radius, quick filters and filter sheet | Refine an existing search, Apply or Cancel a draft, and reach search after a short upward scroll. Keyboard focus and the measured header height must remain consistent as the layout changes.                         |

DealerHunt uses its own search, source collection, account and price-evidence backend. Supplied APK resources and the recorded official Nuvio source inform interaction review; package filenames do not authenticate a version, establish private backend behavior or prove native interaction parity. No supplied APK or ADB is executed for this pass.

## Reproduced gaps addressed

- A claimed navigation drag could leave the capsule vertically, re-enter and still navigate. Vertical exit now cancels and releases capture; a later ordinary click still works.
- Swipe SAVE/PASS decorations were exposed to assistive technology. They are decorative; the real controls remain accessible.
- A departing Swipe card could retain copied focusable controls during its animation. The outgoing copy is now inert.
- The scroll-revealed search could unmount a keyboard-focused Filters button. Keyboard interaction now retains the control; pointer focus does not pin it indefinitely.
- Search visibility assumed a 56px header while TopNav publishes its actual height. It now uses that measured height and responds to resize.
- Feed photographs lacked the horizontal gesture already present in other galleries. The shared hook now supports it without treating vertical scrolling, cancellation or photo buttons as another photo decision.
- Both photo viewers intercepted modified arrow keys. Plain arrows still browse photographs; modified shortcuts retain their native behavior.
- Market's Source shortcut and selector were disabled during the first pending load/debounce. They remain usable after readiness, like the other search controls. Deferred-response tests verify that the latest selection, URL and results survive an older response. This change does not add request cancellation.

## Verification boundaries

Focused regressions exercise the changed controls and their cancellation, focus, retry and selection behavior. Actual-component browser checks are recorded separately from persisted account/workflow tests. Responsive captures and emulated touch do not certify physical iOS/Android, screen-reader output, installed-PWA behavior or a specific frame rate.

The full local gate, CI on the commit being merged, and post-deployment checks remain release requirements. The PR records their final outcomes. Existing source-production, account/recovery and physical-device gates remain in the [pilot register](pilot-next-actions-2026-11-02.md). The previously failed cold ascending-price target is not closed by frontend interaction changes. Price, title and economic evidence rules are unchanged.

## This release's bounded checks

- Eleven focused files: **72 tests passed**, including pending Source selection with real SWR and deferred local responses. These component tests do not create production records.
- Integration type checking passed. Two fixture-only compatibility issues found during integration were corrected and the affected four tests passed again.
- Independent review of the complete integration diff found no actionable blockers.
- Chromium, Firefox and WebKit verified native inert behavior on departing Swipe copies: Tab and programmatic focus cannot enter the copied controls; no console errors or warnings were recorded in that bounded harness.
- The final responsive matrix, full gate, exact-head CI and deployed checks are release receipts in the accompanying PR. They must not be inferred from the focused tests above. Current production browser attachment was unavailable, so a signed-in production click-through is not claimed.

The release changes interaction behavior only. It does not close the recorded cold price-sort performance target, production source verification, complete persisted owner/account recovery journey, independent archive recovery or physical-device/PWA acceptance.
