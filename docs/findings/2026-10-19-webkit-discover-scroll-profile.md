# Discover WebKit scroll-tail profile

## Scope

This is a bounded synthetic diagnosis for issue #434, not physical-device FPS
certification. The run used Playwright 1.63 WebKit with its iPhone 13 profile on
a Windows host, a local Next.js development server, blocked service workers and
a controlled 16-card Discover rail. Each card used a unique URL for the same
234,410-byte local WebP so network variability and production account data were
excluded. The rail was scrolled into the viewport before the final samples.

The metric is a 1.5-second `requestAnimationFrame` interval sample during 1,086
pixels of programmatic smooth horizontal movement. It is not presented-frame
FPS, field INP or a physical Safari trace.

## Finding

The global `img { content-visibility: auto; }` rule in `app/mobile.css` was the
repeatable tail amplifier. Native `loading="lazy"` already defers the listing
image transfer; applying `content-visibility` to each replaced image made
WebKit recalculate card images as the horizontal rail moved.

| Condition                                         | p95 rAF interval | Gaps over 50 ms | Movement |
| ------------------------------------------------- | ---------------: | --------------: | -------: |
| Matched blank rail, median of 3                   |            17 ms |               0 | 1,110 px |
| Card rail, images still loading, 2 runs           |       94 / 97 ms |           4 / 4 | 1,086 px |
| Card rail, all images decoded, before fix, 2 runs |       93 / 91 ms |           4 / 4 | 1,086 px |
| On-screen decoded card rail, before fix, 2 runs   |     106 / 111 ms |           4 / 4 | 1,086 px |
| On-screen decoded card rail, after fix, 3 runs    |  30 / 30 / 31 ms |       3 / 2 / 3 | 1,086 px |

Blocking image requests, waiting for network idle, removing scroll-snap and
disabling card effects did not produce the same consistent improvement.
Removing the image nodes or forcing their `content-visibility` back to
`visible` did. The shipped change removes the global rule rather than adding a
browser sniff or hiding images. Native lazy loading, asynchronous decoding,
card controls, reduced-motion behavior and scroll snapping remain intact.

The responsive readiness sample now scrolls the target rail into view, asserts
that more than 50 vertical pixels are visible and records pending images with
the frame sample. This avoids treating an offscreen animation as a meaningful
buyer interaction.

## Verification and remaining gate

- The focused presentation safeguard passed: 8 tests.
- Full verification passed: typecheck, lint with no errors, 665 test files / 4,748
  tests and the Next.js production build.
- The final controlled WebKit sample had no pending rail images and retained the
  same movement distance.

Headless WebKit still produced two or three isolated intervals above 50 ms and
maximum intervals of 131-153 ms. Issue #434 therefore remains open for initial
and settled traces on physical iOS Safari and representative tablet/desktop
hardware, with a matched control and decode/layout/render evidence. This result
supports the scoped fix; it does not support a 60 FPS certification.
