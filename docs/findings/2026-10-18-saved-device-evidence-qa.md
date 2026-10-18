# Saved Device Evidence QA

Scope: #447 and #448, following #446. Not a whole-app readiness, source accuracy,
quota, alert delivery or production recovery certification.

## Changes

- Preserve source price evidence through the Market save handoff and device snapshot.
  A bid, payment or reference value must not become an asking price.
- Legacy device records stay explicitly unverified. Missing, invalid and zero
  amounts say `Not reported`, not `$0`. No market estimate substitutes for a price.
- Put device price meaning immediately below a wrapping vehicle title, retain
  labeled source access and provide 44px action targets.
- Keep account photos in a stable 16:9 frame below desktop width, with containment
  rather than cropping. Desktop side thumbnails also contain the source image.
- No new dependencies, migrations, requests, polling or worker changes.

## Local Verification

Local server uses local Supabase only. Fixtures are clearly marked and are not
evidence that production source photos match a vehicle or that a valuation is valid.

- Account save confirmed in Market and displayed on Saved. Visually inspected
  phone (390 x 844), tablet (768 x 1024), desktop (1440 x 900).
- Tablet source image is fully contained; title and price precede the image.
- A disposable E2E account save was removed through the local test API, scoped by
  its exact owner and vehicle. The browser backup was deliberately left in place
  to exercise the device-only fallback. No production mutation occurred.
- Regression tests cover all eight price kinds through Market -> save handoff ->
  device snapshot -> presentation, including an amount different from `askPrice`.
- Invalid and missing amounts, legacy records and saved-card photo framing have
  focused regression coverage.

## Follow-ups And Release Gates

- The local sign-in page's `Preview live Scan` link returned to sign-in; guest
  preview access is not certified by this work.
- Run full normal pre-push verification and exact-head CI before merging.
- Verify the production deployment's exact merge commit and read-only signed-in
  phone, tablet and desktop presentation separately after deployment.
- Production backup/restore (#445) still needs the authorized primary database
  credential and separate recovery-key custody. Keep retention cleanup paused.

Private screenshots stay outside Git. This document contains no account records,
private production identifiers, credentials or database archives.
