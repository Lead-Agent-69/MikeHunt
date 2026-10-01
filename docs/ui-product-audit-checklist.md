# MikeHunt UI/Product Audit Checklist

Date: 2026-10-01

Goal: surpass a polished VIN / vehicle intelligence product, not merely run pages. The app should feel intentional, fast, restrained, mobile-first, and honest about data connectivity.

## Quality Bar

- Every route must answer: what is this page for, what can I do now, what data powers it, and what is missing.
- Empty states must be setup guidance, not errors, when Supabase or source ingestion is not configured.
- Pages must not claim AI, live scanning, profits, enterprise release status, or market intelligence unless the backend is actually connected.
- Mobile and tablet must be primary layouts, not squeezed desktop screens.
- Navigation must show fewer, clearer destinations. If a route redirects or is not ready, it should not be advertised as a standalone product surface.
- The product should guide a buyer from intent -> relevant sources -> scoped scrape -> ranked inventory -> decision -> acquisition/fleet/recon.

## Audit Results

Automated checks covered the dashboard nav routes on mobile, tablet, and desktop with Chrome/Playwright:

- No horizontal overflow found on audited pages.
- AI launcher no longer overlaps mobile nav.
- Most protected routes were hidden behind login until a demo session was created.
- Repeated background `500`/`503` API errors appear in the browser console when Supabase is not configured.
- Several pages have weak or missing mobile headings.
- Several pages present internal failure language instead of setup guidance.

## P0: Trust Breakers

- Fix unconfigured-data states across Fleet, Parts, Recon, Finance, List, Bulk, and Intelligence. These should say "Connect inventory database" or "No saved units yet", not "Failed to fetch".
- Remove or gate changelog/marketing claims for AI features that are not connected in this environment.
- Audit all background fetches producing `500` console errors. Clean console matters.
- Decide whether `/flash-deals` is a real page. It currently resolves back to `/discover` in the demo session while navigation presents it as standalone.
- Add a clear data connection banner on every data-dependent page, not only Discover/Sources.

## P1: Product Architecture

- Turn buyer intent into the center of the app:
  - Vehicle type
  - State / region / radius
  - Buying lane
  - Budget
  - Title tolerance
  - Mileage/year
  - Preferred sources
- Pass buyer scope down into scraper functions, not just source selection.
- Add source-specific capability labels:
  - Supports state filter
  - Supports keyword filter
  - Requires auth
  - Public/no-auth
  - Estimated row volume
- Add a "Run smart search" preview before scraper execution showing source count, expected load, and why each source is included.
- Add saved search automation tied to buyer scope.

## P1: Navigation And Information Architecture

- Reduce primary nav to the core journey:
  - Discover
  - Scan
  - Sources
  - Saved
  - Fleet
  - More
- Fold experimental or secondary pages under clear groups.
- Hide admin/dev/status routes from normal users unless admin.
- Remove duplicate concepts:
  - Discover vs Today vs Feed
  - Find vs Arbitrage vs Map
  - Parts vs Recon vs Fleet where empty

## P1: Page-Level Notes

- Discover: strongest page. Needs a sharper first-run command center and fewer generic rails when data is absent.
- Scan: functional, but missing a premium command surface. Add saved scope, smart-run preview, and clearer "no data because backend disconnected" panel.
- Sources: now useful. Needs credential/setup actions and source capability matrix.
- Feed: too empty on no-data state; needs a purpose or should be folded into Discover.
- Market: visually dense; needs progressive disclosure and a clearer "what changed" summary.
- Deal Check: good concept, but needs sample-free extraction states and real upload guidance.
- Fleet / Recon / Finance / List / Parts: should become a connected operations suite; currently feel like isolated internal tools.
- Dealer Network: too many buttons/items on mobile; needs filters, search, and a reason to act.
- Changelog: overclaims compared with configured reality; gate or rewrite.
- Alerts/Searches/Saved: good primitives, but need to be tied to buyer scope and smart scrape.

## P2: Apple-Level UX Details

- Use compact, calm controls and fewer decorative panels.
- Replace emojis in app UI with lucide icons or product-specific symbols.
- Ensure every page has one clear primary action.
- Use consistent section headers, empty states, and setup-state language.
- Avoid "AI" as decoration. Show AI only when provider + data are connected.
- Add skeletons only where data is expected; otherwise show setup state immediately.
- Ensure all buttons have obvious outcomes, not vague labels like "Analyze" without context.

## Current Verified Improvements

- App builds successfully.
- App runs at `http://localhost:3000`.
- Smart scope planner limits scrape runs by lane/state/type.
- Scan no longer treats `source=all` as a literal source.
- State filtering is now a real filter.
- Discover buyer scope persists locally and to preferences when authenticated.
- AI launcher is mobile/tablet safe.

## Next Implementation Batch

1. Build a shared `DataSetupState` component and use it across all data-dependent pages.
2. Clean API behavior so unconfigured Supabase returns `configured:false` JSON instead of `500`/`503`.
3. Simplify nav into the actual core workflow.
4. Pass scope filters into the scraper source functions.
5. Rewrite changelog and upgrade claims to match real available functionality.
