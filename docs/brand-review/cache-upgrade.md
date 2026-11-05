# Branding service-worker cache update

**Implemented; targeted SW/PWA tests and the real-browser update probe pass.
The new full repository gate passed: 5899 tests across 777 files, typecheck,
lint, and production build. PR #636 remains a design-review draft.**

## Problem and scope

The branding assets changed at stable URLs while the service-worker script still
used `DealerHunt-static-v3`. Installed workers could therefore continue serving
the old D mark and icons from their cache-first store. The fix bumps only the
static cache identity to `DealerHunt-static-v4-dh`, changing worker script bytes
so the existing browser registration/update path can install the new version.
`DealerHunt-dynamic-v1` is unchanged. Future stable-URL artwork changes must
advance the static cache generation again; this does not add automatic cache-key
fingerprinting.

A second, related regression was reproduced in Chromium: a retained dynamic
cache entry for the same logo URL can shadow the new static entry when searching
all caches globally. Cache reads now try the current release's static precache
first, then retain the existing global-cache/network fallback. The old dynamic
entry is neither deleted nor rewritten. This is read precedence for branding
freshness, not a new eviction or persistence feature.

Production changes are limited to that cache-name bump and the current-precache
read preference in `public/sw.js`. The static asset list (17 existing files),
install/activation handlers, cache deletion policy, dynamic writes, IndexedDB
helpers, private API bypass, background sync, push handling, and PWARegister UI
are unchanged. No origin-wide storage clearing or user-record eviction was added.

## Install, activate, and refresh

1. The existing PWARegister registers `/sw.js`, observes installation, and calls
   the existing registration update check. Changed script bytes start an update.
2. The new worker precaches into `DealerHunt-static-v4-dh`. The existing install
   promise must finish successfully before skipWaiting runs.
3. On activation, the existing cleanup removes the superseded v3 static cache
   while retaining the current static cache and `DealerHunt-dynamic-v1`. The
   existing clients.claim call follows cleanup.
4. The existing “A new version is ready” / Refresh UI reloads the page. Stable
   artwork URLs now resolve to the new current precache, ahead of any old copy
   that is deliberately retained in the dynamic cache.
5. A failed precache does not call skipWaiting or activation cleanup; old usable
   assets and retained dynamic/private history remain available.

Already-decoded images in an open tab are not force-replaced by this change. The
existing Refresh path or a subsequent normal load fetches from the updated worker.
An offline browser cannot fetch a new worker until connectivity returns. No new
auto-reload, install prompt, storage migration, or unrelated PWA feature was added.

## Regression tests

The existing `app/service-worker-fallback.test.ts` now simulates successive worker
versions sharing CacheStorage. Its upgrade regression checks script byte changes,
successful precaching before activation, old-static cleanup, new SVG/PNG responses
without a network request after activation, and current-precache priority over a
retained old dynamic logo. Both dynamic image bytes and that duplicate remain
unchanged, and no IndexedDB open/delete calls occur in install or activate.

A failed-precache regression verifies that the new worker cannot skip waiting,
claim clients, delete old caches, or change retained data. Existing offline,
install-prompt, notification, and private-API cache-bypass tests remain covered.
Targeted result: **41 tests passed across six existing SW/PWA test files**.

## Real-browser verification

An isolated headless Chromium origin served the actual legacy worker from runtime
commit `33263f7a` and the current worker. The probe mounted the unchanged production
PWARegister component. It seeded a retained dynamic image, an old duplicate logo
entry, and a sentinel IndexedDB history record, then observed a real updatefound /
install / activate lifecycle and used the existing Refresh button to reload.

After refresh, SHA-256 hashes for the D SVG, icon SVG, 192/512 PNG icons, and Apple
icon match the current checked-in assets. The v3 static cache is gone; dynamic
bytes, the old duplicate logo bytes, and the IndexedDB record are intact. This
used a temporary test browser origin/profile, never a user's installed profile or
production database. No real user records were accessed or evicted.

- [Browser results and asset hashes](cache-upgrade-browser.json)
- [Source-scope and unchanged-persistence checks](cache-upgrade-source.json)

Local evidence under `test-results/dh-brand-review/`:

- `cache-targeted-tests.log` — 41 passing targeted tests.
- `cache-browser-checks.json` / `cache-browser.log` — final live browser probe.
- `cache-dynamic-shadow-before-fix.log` — reproduced stale dynamic-logo failure.
- `cache-source-scope-check.json` — exact allowed runtime edits and unchanged handlers.
- `cache-full-verify.log` — new full gate, passed (5899 tests / 777 files, typecheck, lint, build; 1883.0 seconds).
- `cache-production-audit.log` — passed, zero high/critical findings.

Reproduce the committed regression with:

```powershell
npx vitest run app/service-worker-fallback.test.ts app/offline-recovery.test.ts app/install-prompt.test.ts app/install-prompt-interaction.test.ts app/push-recipient-privacy.test.ts app/push-open-deal.test.ts
npm run verify
```

The isolated native-browser probe is retained locally at
`.cache/verify-brand-cache.mjs`; its results and hashes above are included for
remote review without introducing a production PWA feature.

## Limitations

Automated native-worker verification used Chromium; Safari/iOS installed-PWA update
behavior was not manually exercised. The fixture server served explicit test
revisions and controlled install completion; it was not a production deployment.
Existing cache cleanup behavior for other cache names is unchanged. This change
preserves retained dynamic/IndexedDB data; it does not introduce a data migration.
