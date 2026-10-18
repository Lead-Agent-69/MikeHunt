# Photo browsing and usability follow-up

Reviewed October 18, 2026 against the current application components.

This change gives multi-photo viewers left/right taps while retaining arrows and keyboard controls. Both directions wrap. Pointer movement, scrolling, canceled gestures, long presses and multiple fingers do not become extra photo taps. Horizontal swipes in the shared preview advance once.

The shared viewer covers Market, Discover, Feed, Scan/deal cards, account and device Saved, Compare, and the existing alternative galleries. Detail-gallery and photo-evidence viewers retain their existing layouts and gain the same tap direction. Enlarging photos is separate from listing links and saving; closing returns focus to the enlargement button.

Additional fixes found during this work:

- Missing enlargement controls on several browsing and Saved/Compare thumbnails now open the shared viewer.
- The shared preview reports loading and failed photos, allows retry, and avoids displaying an old frame under a new photo counter.
- Discover tries the next supplied photo after a broken cover before showing its placeholder.
- New device saves retain up to 30 supplied gallery URLs as well as the legacy cover field. Existing cover-only saves remain compatible; missing historical URLs are not invented.
- Viewers no longer silently apply the listing helper's 20-photo cap to an already captured gallery.

The next implementation adds shared photo-specific zoom (100-400%), fit/reset, pointer panning, pinch zoom and keyboard controls. Magnified images use arrow keys to pan; visible navigation buttons still change photos and reset zoom. At fit, taps and horizontal swipes browse; dragging down closes. Both full-screen viewer implementations use the same surface, failure/retry state and touch rules.

Selected source URLs are remembered in session storage for up to 24 hours, capped at 80 galleries, with an in-memory fallback when storage is unavailable. A changed gallery starts at its first frame. Market, the detail hero, photo evidence and shared preview buttons use this context. Closing and reopening retains selection without retaining zoom. Replacing or removing a gallery closes its old viewer.

Saved account/device and Compare thumbnails try other supplied photos before an honest unavailable state. Compare fits the whole vehicle. Deal cards now apply the same alternative-photo policy without inserting a generic vehicle picture. Discover retains enlargement/retry access even when its cover photos fail. Full-screen galleries remain stable when a background thumbnail fails, and a successful Market/detail retry restores that photo's inline state. Swipe browsing and photo evidence now also expose the shared enlargement control.

Further upgrades worth doing:

| Area                       | Evidence in the current UI/code                                                                                                 | Useful next change                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-photo context          | Saved snapshots can outlive a source photo; galleries expose a count but no photo-specific observation date.                    | Carry source observation dates into inspection views and label stock/source photos consistently. Do not imply a photo proves current condition. |
| Broader product acceptance | Earlier completion evidence still leaves source coverage, real-device alerts/PWA behavior and realized sale/cost accuracy open. | Prioritize permitted source enrichment and received-device proof over adding more dashboard widgets. These are not certified by photo UI tests. |

Interaction regression coverage includes both tap directions, wraparound, retained arrows, gesture cancellation, single-photo behavior, failed-photo retry, focus restoration, and keeping modal actions from opening the containing listing. Browser coverage exercises the actual Market UI at desktop and 390px touch widths with labeled, local-only photo fixtures; it is not live source-data acceptance.

Additional interaction coverage exercises zoom bounds, clamped panning, pinch release, fit reset, canceled gestures, URL selection after remount, expiry, malformed/blocked storage, changed galleries, cover fallback and retry stability. Browser fixtures exercise desktop, 390px and 320px touch layouts, including zoom/pan, reset, close/reopen and selection after a reload. These fixtures do not certify production inventory or physical-device behavior.
