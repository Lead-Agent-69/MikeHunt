# Shared loader layout and motion correction

The shared loader now reserves its configured square size in every state, even
while its artwork is hidden below 200 ms. Compact artwork is centered in that
reservation; expansion at 1000 ms and idle/complete/error transitions keep the
root and adjacent content fixed. The reservation does not shrink in a flex row.
Requests, accessible pending text, content delivery, and startup session/cap
logic retain their existing lifecycle.

Reveal now varies only the opacity of a separate decorative radial accent. The
original mark is unchanged and no animation keyframe changes a filter. All four
indeterminate visual beats use only transforms and opacity. Reduced motion,
explicit static motion, and both app static-motion attributes disable all beats.

Run `node scripts/verify-brand-loader-layout.mjs` for actual Chromium bounding-box
regressions at 20, 48, 64, and 96 px. It checks hidden/compact/full and all resting
states, adjacent-content stability, compact centering, fast pending unmount before
200 ms, animated properties, and the four static-motion mechanisms. The fixture
bundles the actual shared React component and CSS without a backend.

Evidence is written to `test-results/dh-loader-stability/browser-checks.json`,
`full.png`, and `reduced-motion.png`. Existing shared-loader and startup lifecycle
tests also pass. Normal hooks and CI remain required before release.

Limitations: browser layout coverage is Chromium, with controlled timers. This
does not replace manual Safari/iOS or screen-reader speech testing. No artwork,
icons, service worker, backend stages, or task text were changed.
