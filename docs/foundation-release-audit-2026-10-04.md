# Foundation Release Audit: October 4, 2026

## Included

- Consolidated location selection and preserved remote Discover improvements.
- Removed the CSS override that made dark mode appear light. Theme controls synchronize and persist preferences.
- Offline fallback follows appearance preferences and retains a white tile behind the supplied cobalt M.
- Bumped production offline caches; development unregisters only this app's worker and clears only its named caches.
- Asking-price regression reporting no longer claims held-out transaction accuracy. Fewer than 50 scored observations, invalid observations, or database query failures cannot pass.
- New eBay observations require an explicit sold date, unambiguous USD price and eBay item link. Hidden accepted offers are excluded.

## Branch Review

Remote master work was merged while preserving local app and CI edits. The landing-honesty patch is already equivalent to current work. The kill-LLM-invented-prices branch's relevant files match current safeguards.

Older `cline/322e8` and `cline/a2e9a` branches are preserved, not blindly activated: they contain divergent infrastructure changes and a producer for an intentionally disabled valuation queue. Re-enabling invented-price paths would undermine evidence quality. Machine maintenance scripts and temporary QA media are not application release files and remain local.

## Operational Findings

At inspection, the local scraper, Redis and scraper FlareSolverr containers were healthy. Two Supabase Vector logging containers were unhealthy/restarting. This does not establish successful per-source collection or end-to-end auth correctness. Some existing local service ports bind all interfaces; deployment exposure and firewall policy need a separate review.

Port 3000 had no server; a development server was running on 3002. An installed service worker can show an old offline page when the requested development port is unavailable.

## Remaining Evidence Gaps

- No measured basis for a 99% valuation, repair or condition accuracy claim.
- Asking-price comparisons are in-sample proxies, not confirmed purchase/sale outcomes.
- Existing sold rows need provenance review; this parser change does not retroactively validate them.
- Sold-price medians still need verified title, condition, mileage and recency matching before being treated as directly comparable retail evidence.
- Auction current bids are not final acquisition cost. Unknown damage and fees must not become a confident profit recommendation.
- This pass does not certify every source's terms, 50-state coverage, production OAuth, administrator permissions, or every customer workflow. These require explicit live checks with authorized accounts and real scoped runner results.

## Release Verification

Use repository verification (typecheck, lint, tests and production build), then verify remote main/master revisions and run the local app on port 3000. Live theme checks must include both appearances, the offline page, and mobile/desktop navigation. Do not equate passing code checks with validated market accuracy.
