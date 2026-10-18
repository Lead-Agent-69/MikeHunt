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

Further upgrades worth doing:

| Area                        | Evidence in the current UI/code                                                                                                 | Useful next change                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zoom and pan                | Both viewers fit photos to the viewport; neither has photo-specific zoom controls.                                              | Add accessible zoom/reset and pan, with tap-to-cycle disabled while magnified. Preserve the current close and focus behavior.                              |
| Photo context on return     | Market restores the listing position, but each mounted card starts at its first photo.                                          | Remember the selected photo by listing and source URL so returning from details preserves the inspection position. Expire positions when galleries change. |
| Inline photo failure states | Saved and Compare thumbnails still use plain image elements; the enlarged viewer now has retry.                                 | Reuse the existing supplied-photo fallback policy in those thumbnails and keep listing/source actions available when all images fail.                      |
| Per-photo context           | Saved snapshots can outlive a source photo; galleries expose a count but no photo-specific observation date.                    | Carry source observation dates into inspection views and label stock/source photos consistently. Do not imply a photo proves current condition.            |
| Broader product acceptance  | Earlier completion evidence still leaves source coverage, real-device alerts/PWA behavior and realized sale/cost accuracy open. | Prioritize permitted source enrichment and received-device proof over adding more dashboard widgets. These are not certified by photo UI tests.            |

Interaction regression coverage includes both tap directions, wraparound, retained arrows, gesture cancellation, single-photo behavior, failed-photo retry, focus restoration, and keeping modal actions from opening the containing listing. Browser coverage exercises the actual Market UI at desktop and 390px touch widths with labeled, local-only photo fixtures; it is not live source-data acceptance.
