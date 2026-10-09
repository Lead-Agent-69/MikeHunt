# Competitive Gap Review: October 9, 2026

This is a workflow and code review, not a claim of production parity, certification,
or better results than competitors. Route existence does not prove a working service.

## Competitor Evidence

- [Copart search and Watchlists](https://www.copart.com/content/us/en/support/how-to-buy/search-vehicles-1):
  vehicle/title/damage/purchase filters, saved searches and same-account mobile/desktop continuity.
- [Visor filters](https://visor.vin/search/filters): granular specifications, unknown-price/mileage inclusion,
  distance/time geography, listing age and inventory facets.
- [Visor API](https://visor.vin/api): listing, VIN, dealer, facet and price-history data;
  paid usage is not an unrestricted free inventory feed.

## Current Improvement

Discover bookmarks previously used only device storage. Persisted listing cards now
use account-owned Saved rows when signed in, with one shared identity/list subscription,
owner-scoped caching, confirmed mutations, checked device backups and visible retry/error states. Guest and
live-search records remain explicitly device-only. Stale-account mutations are rejected
server-side. This closes a code-level continuity gap; real two-device acceptance is pending.

## Remaining Priorities

### Acquisition-Focused Consolidation

The separate Listing Manager, Finance and Bulk screens and their exclusive helpers
are removed. Legacy bookmarks lead to Plan/Pipeline or car search; dedicated bulk
and lender APIs return 410 without reading or changing account data. Existing inventory,
expenses and recorded outcomes are preserved. Feed, Map and Swipe are grouped as
search views, and dealer/source browsing stays available in the focused workspace.
Specialist labels now distinguish car search from arbitrage routes and market exploration.

Ranked Picks uses one budget/strategy-scoped result set instead of a second independently
fetched headline pick and duplicate carousel. Request changes abort old loads; failure,
loading, empty and retry states are explicit. This is recommendation UI correctness,
not proof of ranking quality, sold-comparable coverage or production freshness.

1. **Inventory reliability before more surfaces.** Prove each source yields current inventory,
   record last successful extraction and differentiate unavailable from no matches.
   Recent healthy scraper-container logs still contained several zero-yield sources.
   Copart/eBay coverage needs an authorized data path; do not substitute guessed inventory.
2. **One search contract.** Discover offers core criteria and links to full matches/filters.
   Existing grouped detail filters cover specifications, auction/condition and evidence,
   but their presence is not proof of normalized coverage across every source.
   Scan already has dynamic facets for makes, title, seller and source; extend and validate
   those counts for richer detail fields rather than rebuilding them. Further competitive
   work includes verification of drive-time/distance geography. Explicit unknown-value
   price/mileage policies are now implemented using shared result/facet/view query rules;
   zero mileage remains a reported value, and empty navigation ranges remain unset. Sparse source
   fields need coverage-aware availability, not controls that silently do nothing.
3. **Saved interests to delivered alerts.** Test the complete matching, scheduling,
   notification and unsubscribe lifecycle. A saved watchlist row is not proof of delivery.
4. **Decision evidence.** Verify comparable cohorts, observed-price history and geographic
   cost assumptions. Asking prices are not sold comps. Production embedding freshness
   and want-hit quality across states remain unproven. OEM documentation needs a real provider.
5. **Role-specific acceptance.** Run signed-in desktop/mobile journeys for personal, DIY,
   parts, flipper and dealer, with a separate admin isolation check. Preserve the simple
   Discover > Saved > Plan/Pipeline structure; keep offer review in contextual tools.
   Free expanded access must not become a payment requirement or admin authorization.

## Release Gates

- Run typecheck, lint, full tests and production build; publish to the existing draft PR.
- Browser layout checks do not substitute for real account mutation or two-device checks.
- Hosted Auth policy/redirect/SMTP, scraper yield, retention, monitoring and production
  recommendation performance remain separate release gates.
- The older `visor-migration-audit.md` is historical route-level planning, not acceptance
  evidence; its parity and data-availability claims must not be used as release sign-off.
