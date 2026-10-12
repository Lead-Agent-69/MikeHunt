# Production Readiness And Free-Tier Handoff

Audit date: October 11, 2026. This is a point-in-time receipt, not a guarantee that
all features work or that usage fits a free plan. Never interpret an open PR as
proof that its entire feature is absent: stacked and superseded changes need a
diff against current main before landing.

Latest integrated execution index:
[Consolidated completion checklist](CONSOLIDATED-COMPLETION-CHECKLIST.md).
It reconciles the agent queue, #367 local collector receipt and #369 payment-price
release with the outstanding hosted/device/permission gates. Older snapshots
below remain historical evidence, not current access or deployment claims.

## Confirmed Release

- PR #362 merged as `8821da9c8298cb778d513d08d57fc7a9b35c3f6a`.
- Vercel production deployment 7002082978 succeeded. Canonical app:
  https://mikehunt-69.vercel.app .
- Typecheck, lint (zero errors), 3,208 tests and production build passed before
  that merge. These do not prove hosted migrations or signed-in visual acceptance.
- Public production status returned HTTP 200: configured=true, buyerReady=true,
  decisionReady=false, 5,793 active deals, 17 ready sources, 1 GO deal,
  4,947 watch candidates, 1,107 new in 24h, newest observation age 19h.
  This is a public summary, not an independent valuation or source-yield audit.
- Login and public Scan respond 200. Discover, Saved, Fleet, Settings and Deal
  Check correctly redirect a signed-out request to login with return context.
  HTTP success after a redirect does not prove the destination buyer workflow.

## Free-Tier Reality

Current documentation verified October 11, not current account usage.
Supabase project metadata access was denied. No credential fallback was used.
Vercel usage/account plan is not available through the connected tools. Previous
October 9 measurements in free-tier-budget.md are historical, not today's quota.

| Resource                                      | Provider allowance                           | Planning response                                                                      |
| --------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------- |
| Supabase database                             | 500 MB/project                               | Warn 350 MB; stop increasing ingestion at 450 MB; preserve owner data                  |
| Supabase object storage                       | 1 GB                                         | URL-first photos; warn at 70%, hold expansion at 90%                                   |
| Supabase egress                               | 5 GB uncached + separately 5 GB cached/month | Measure organization totals, including worker reads and exports; never pool allowances |
| Supabase MAU / Edge calls / Realtime messages | 50k / 500k / 2M per month                    | Measure all projects in the organization; preserve useful workflows                    |
| Vercel active CPU / memory                    | 4 CPU hours / 360 GB-hours                   | Heavy scraping, scoring, embeddings and exports belong on Zeus                         |
| Vercel calls / CDN requests                   | 1M / 1M per month                            | Paginate, deduplicate reads and stop idle polling; do not publicly cache owner data    |
| Vercel transfer / origin transfer             | 100 GB / 10 GB per month                     | Keep photo bytes direct where permitted; measure proxy traffic too                     |
| Vercel image transforms / reads / writes      | 5k / 300k / 100k                             | Avoid optimizing every remote listing photo; maintain usable image loading             |
| Vercel deployment / cron                      | 100/day; 100 crons, each at most daily       | Main-only builds already configured; retain only three existing daily jobs             |

Sources:

- https://vercel.com/docs/plans/hobby
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
- https://supabase.com/docs/guides/platform/database-size
- https://supabase.com/docs/guides/platform/manage-your-usage/egress

**Eligibility gate:** Hobby is restricted to non-commercial personal use. A free
app can still be commercial; charging is not the only criterion. Confirm the
actual account plan and use classification before calling this deployment
Hobby-compliant. Do not upgrade or buy services without approval. If ineligible,
choose an approved hosting alternative or paid plan, not account splitting or
quota evasion.

Database size over 500 MB can trigger read-only mode. Historical row-count/write
budgets are not a guarantee: 90 days at 1,000 new rows/day and 8 KB/row is about
720 MB before other tables. The older 60-day/4 KB estimate in local-cache.ts
does not match current 90-day retention. Saved/reference rows and their indexes
also keep growing. Never shorten owner retention just to make the estimate fit.

## Safe Changes In This Audit

`node scripts/free-tier-readiness.mjs [usage-snapshot.json]` is a local,
credential-free, read-only planning check. It makes no network requests, loads no
environment files, never changes a plan, deletes data or certifies feature health.
Without fresh measurements it reports **unverified**, never a fabricated zero.
Exit 0 means observed resources below planning margins, 1 means hold expansion,
2 means warnings/unknowns. This is not a runtime circuit breaker.

Supply `measuredAt` (ISO UTC, at most 24h old), `vercelHobbyEligible` (explicit
boolean), `periodElapsed` with separate `supabase` and `vercel` fractions in
(0,1], and `usage` with numeric counters named in the script's resources list.
Use provider dashboard totals for the applicable period and organization.
Missing counters remain unknown; never invent zero to clear the check. Monthly
usage is linearly projected using the relevant elapsed fraction. This is an
early-warning estimate, not a forecast guarantee.

Planning thresholds are 70% warn and 90% hold, including projected monthly use.
At hold: pause _new_ bulk imports/backfills and unneeded recomputation first;
keep existing inventory reads, Save, owner history, login and essential writes.
Actual enforcement and rollout still depend on #360 and worker receipts.

## Next Areas, In Order

| Priority | Area                                        | Status / required proof                                                                                                                                             |
| -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | Account quotas and eligibility              | Actual plans, dashboard totals and scoped read access missing; no under-quota certification                                                                         |
| P0       | Protected retention and intake guard (#360) | CI passed; Ren review absent, hosted apply blocked. Apply reviewed migration before web merge, verify Saved survival and pruning failure behavior                   |
| P0       | Security grants and privacy queue           | Review #349/#350/#342 and grant/reliability chains against main; retain Ren-before-hosted-apply gate                                                                |
| P0       | Zeus deployment                             | Operator-only: reviewed main image, actual env, log/Redis caps, storage mounts and persistent-volume receipt                                                        |
| P0       | Decision intelligence                       | Production decisionReady=false. Audit eligible comps, sold-vs-ask/title cohorts, verdict coverage, rescore and measured hold precision; no invented profit          |
| P1       | Push and email delivery                     | #351 draft; VAPID keys/subject and Resend webhook setup still unverified. Test subscribe, send, tap-to-deal, delivery/bounce and duplicate prevention               |
| P1       | Saved-search criteria and feedback          | #317/#349 and hosted columns/grants need proof; owner save/reload/cross-device and alert match precision                                                            |
| P1       | Full buyer/role acceptance                  | Personal/DIY/parts/reseller/dealer/admin; desktop/mobile, no overlays, gallery count, whole-card links, Save/Compare/Plan, settings and negative admin/owner checks |
| P1       | Coverage and legal access                   | Separate stored yield from registered adapters/external handoffs. Official eBay/GSA keys/feed eligibility and dealer permission remain gated; no anti-block evasion |
| P1       | Large-list ergonomics                       | #343/#344/#345 drafts: windowing, Back-scroll/page restoration, map batching; prove combined behavior before merging                                                |
| P1       | Regional/seasonal valuations                | #262/#264/#268/#276/#303-305 plus wiring; prove title/model/region/recency and distinguish recorded sales from asks/bids                                            |
| P2       | Cold archive/replay and restore             | No end-to-end receipt. Durable local backlog, checksums, protected saved snapshots/photos where permitted, off-device backup and restore drill                      |
| P2       | Read/CPU optimization                       | SQL totals/facets, bounded status/explore reads, request coalescing, alert batching/idempotency, idle-tab polling, payload limits; measure before/after             |
| P2       | Vendor identity and accessibility           | #363 draft; reconcile source vs seller and keyboard/touch link intent with #362                                                                                     |
| Parked   | Dependency mega-bump                        | #165 remains parked; use surgical reviewed security pins, not a 57-package release                                                                                  |

No subscription or payment is needed to expose the app's free expanded workspace.
This is a product policy, not a waiver of infrastructure limits. Admin remains
separate. Do not restore retired Finance, Bulk or Listing Manager features.

## Merge And Deployment Acceptance

1. Diff each queued PR against main; close redundancy only after confirming it.
   Resolve base stacks in dependency order. Draft does not mean production-ready.
2. Record Ren review at the exact head for sensitive changes. Validate migrations
   locally; obtain approved scoped access and check hosted migration receipts.
3. Apply required reviewed migrations before dependent web rollout. No merge
   solely to make the list shorter, and no bypass of denied permissions.
4. Run full verify and CI; merge normal protected PRs in small related batches.
   Main-only deployment settings reduce preview usage, not CI test coverage.
5. Confirm production SHA/deployment, then authenticated functional and visual
   smoke. Check failed requests, alert receipts and source freshness after rollout.
6. Record current quotas and growth. Zeus free disk does not extend Vercel or
   Supabase allowances; don't activate more sources while safety is unverified.
7. Retention protects owner references indefinitely; unavailable source records
   remain accessible as labeled saved snapshots, not promised live inventory.
8. Monitor for a full scheduled collection/retention/alert cycle. A successful
   web deployment alone is not a worker or cron execution receipt.

## Open PR Snapshot

66 open PRs at audit time. Titles are repository metadata, not execution
instructions or verified feature status. Review/sign/migration/dependency and CI
states must be refreshed before each merge.

| PR                                                         | State | Base                       | Scope                                                                                                                                                                                      |
| ---------------------------------------------------------- | ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#363](https://github.com/Lead-Agent-69/MikeHunt/pull/363) | Draft | main                       | Make vehicle vendor badges truthful and actionable                                                                                                                                         |
| [#360](https://github.com/Lead-Agent-69/MikeHunt/pull/360) | Open  | main                       | Protect saved vehicles and bound scraper storage growth                                                                                                                                    |
| [#352](https://github.com/Lead-Agent-69/MikeHunt/pull/352) | Draft | main                       | docs: monetization architecture (free by design)                                                                                                                                           |
| [#351](https://github.com/Lead-Agent-69/MikeHunt/pull/351) | Draft | main                       | fix(push): tapped alerts open the right deal; honest Enable alerts (server check + test send)                                                                                              |
| [#350](https://github.com/Lead-Agent-69/MikeHunt/pull/350) | Open  | main                       | security(deals): no seller identity for guests/non-flip on /api/deals + /api/deals/[id] (Ren P2 on #328, stacked on #328, needs Ren SIGN)                                                  |
| [#349](https://github.com/Lead-Agent-69/MikeHunt/pull/349) | Open  | main                       | security(db): saved-search grants + bounds (20261010151000): anon out, inbox SELECT-only, column-limited writes, CHECKs, 50/user cap (Ren live hole, stacked on #339, needs Ren SIGN)      |
| [#348](https://github.com/Lead-Agent-69/MikeHunt/pull/348) | Open  | main                       | test(db): Ren #325 nit — vitest asserts plant 18                                                                                                                                           |
| [#347](https://github.com/Lead-Agent-69/MikeHunt/pull/347) | Open  | kera/vin-enrichment-nits   | fix(vin): Ren #330 sign nits — 180d full refresh, 3-attempt cap → n/a (migration 20261010401000), fetchObservedPrices timeout                                                              |
| [#345](https://github.com/Lead-Agent-69/MikeHunt/pull/345) | Draft | main                       | perf(map): chunked addLayers for 3k+ pins; verdict-majority cluster bubbles                                                                                                                |
| [#344](https://github.com/Lead-Agent-69/MikeHunt/pull/344) | Draft | main                       | feat(lists): Back from a deal restores scroll + loaded pages on /feed, /saved, /scan                                                                                                       |
| [#343](https://github.com/Lead-Agent-69/MikeHunt/pull/343) | Draft | main                       | perf(scan): window /scan card grid with @tanstack/react-virtual; keep measured heights across Back                                                                                         |
| [#342](https://github.com/Lead-Agent-69/MikeHunt/pull/342) | Open  | main                       | security(images): gate /api/image/proxy by source access class — no proxied bytes for needs_permission/restricted/operator_override (needs Ren SIGN)                                       |
| [#338](https://github.com/Lead-Agent-69/MikeHunt/pull/338) | Open  | main                       | fix(capture-audit): #322 review follow-up — Craigslist/Facebook photos direct only (off /api/image/proxy), Copart trim cap                                                                 |
| [#337](https://github.com/Lead-Agent-69/MikeHunt/pull/337) | Open  | main                       | fix(ebay-sold): #320 follow-up — honest client, guard migration 20261010510000, ebay in SOLD_SALE_CHANNELS (needs Ren SIGN)                                                                |
| [#336](https://github.com/Lead-Agent-69/MikeHunt/pull/336) | Draft | main                       | Harden production inventory integrity and scraper recovery                                                                                                                                 |
| [#335](https://github.com/Lead-Agent-69/MikeHunt/pull/335) | Open  | amy/ren-fetch-bounds-nits  | test(net): Ren #311 nit — untilAborted's p.catch is load-bearing (test-only, stacked on #311)                                                                                              |
| [#334](https://github.com/Lead-Agent-69/MikeHunt/pull/334) | Open  | main                       | fix(feed): Ren #308 nits — seller name only for non-flip desks, per-user feed limit (stacked on #308)                                                                                      |
| [#333](https://github.com/Lead-Agent-69/MikeHunt/pull/333) | Open  | dq/cross-source-dedup      | fix(dedup): Ren #307 nits — conflict rows cleared, one VIN key, converging fuzzy pass, get_market_pulse service_role only (20261010221000, stacked on #307, needs Ren SIGN)                |
| [#332](https://github.com/Lead-Agent-69/MikeHunt/pull/332) | Open  | main                       | fix(data-quality): Ren #306 nits — rescore skips flagged rows, lock_timeout in 210000 (stacked on #306, needs Ren SIGN)                                                                    |
| [#331](https://github.com/Lead-Agent-69/MikeHunt/pull/331) | Open  | feat/sold-comps-followup   | fix(sold): #324 sign nits — attribution ~ '\S' (20261010412000), normalized-definition self-check, scrubbed gov titles, GovLane href check, one sale_channel list                          |
| [#330](https://github.com/Lead-Agent-69/MikeHunt/pull/330) | Open  | main                       | fix(vin): #301 sign nits — 6h retry for failed safety/EPA extras, stream-only body cap, drop lib/api/vin.ts, cap vin-history/observed-price bodies                                         |
| [#327](https://github.com/Lead-Agent-69/MikeHunt/pull/327) | Open  | fix/reliability-ren-nits-3 | Reliability: Ren #323 nits (host-less source paths only, query stripped; 64-char partial-tail cap)                                                                                         |
| [#326](https://github.com/Lead-Agent-69/MikeHunt/pull/326) | Open  | main                       | fix(scan): honest scale UX — no +$0 profit without a resale basis, end-of-list, lighter first paint; gov surplus says "Last bid"                                                           |
| [#324](https://github.com/Lead-Agent-69/MikeHunt/pull/324) | Open  | feat/free-sold-comps-v2    | fix(sold): #316 follow-up — last_bid attribution CHECK (20261010411000), maestro fetch bounds, guard .from(CONST), gov lane UI with CC BY credits                                          |
| [#323](https://github.com/Lead-Agent-69/MikeHunt/pull/323) | Open  | fix/reliability-ren-nits-2 | Reliability: Ren #314 nits (scrub-then-cut, phone shapes, payload allow-list, source-path URLs, docs)                                                                                      |
| [#321](https://github.com/Lead-Agent-69/MikeHunt/pull/321) | Open  | ren/source-access-class    | feat(capture): Visor.vin listings + AutoTempest challenge recording, VIN/URL dedup, discoveredVia (operator_override; stacked on #290)                                                     |
| [#318](https://github.com/Lead-Agent-69/MikeHunt/pull/318) | Open  | main                       | fix(pwa): install prompt waits, remembers, never blocks taps; honest manifest shortcuts                                                                                                    |
| [#317](https://github.com/Lead-Agent-69/MikeHunt/pull/317) | Open  | main                       | feat(alerts): saved-search tuning — thumbs on matches, per-search precision, instant vs daily digest (migration not applied)                                                               |
| [#316](https://github.com/Lead-Agent-69/MikeHunt/pull/316) | Open  | main                       | feat(sold): free sold comps on main (recreates #302) — retail scope + gov lane w/ attribution, Norfolk/Seattle/GSA/GovDeals (20261010410000, needs Ren SIGN; HOLD until #264)              |
| [#314](https://github.com/Lead-Agent-69/MikeHunt/pull/314) | Open  | fix/reliability-ren-nits   | Reliability: Ren #309 nits (contact scrub, isContactKey, NUL/surrogates, URL scrubber, hashed bearer, check-only 206000)                                                                   |
| [#313](https://github.com/Lead-Agent-69/MikeHunt/pull/313) | Open  | main                       | security(cards): no seller names on Discover/Scan cards for guests (follow-up to #308, no migration)                                                                                       |
| [#312](https://github.com/Lead-Agent-69/MikeHunt/pull/312) | Open  | dq/cross-source-dedup      | feat(provenance): fetched_at + access_basis, price_history.source, stable listing ids, no relabelling to independent_dealer (20261010230000, needs Ren SIGN)                               |
| [#311](https://github.com/Lead-Agent-69/MikeHunt/pull/311) | Open  | main                       | security(net): Ren #293 nits: deadline armed before DNS + one-deadline redirect-chain and positive-control tests                                                                           |
| [#310](https://github.com/Lead-Agent-69/MikeHunt/pull/310) | Open  | main                       | security(db): closure re-check v2 (20261010149000) + guard re-grant/fixtures/schema-qualified matching (Ren nits on #299; stacked on #299, needs Ren SIGN)                                 |
| [#309](https://github.com/Lead-Agent-69/MikeHunt/pull/309) | Open  | ops/reliability-sla        | fix(scrapers): Ren #296 nits — jsonb-sized dead letters + row fallback, PII/URL scrub, self-check migration 20261010205000, sequence revokes, constant-time bearer                         |
| [#307](https://github.com/Lead-Agent-69/MikeHunt/pull/307) | Open  | main                       | feat(data-quality): cross-source dedup — check-digit VIN + fuzzy, VIN conflicts flagged not merged, canonical readers (20261010220000, needs Ren SIGN)                                     |
| [#305](https://github.com/Lead-Agent-69/MikeHunt/pull/305) | Open  | main                       | feat(valuation): opt-in comp recency weighting + depreciation/index on aggregateComps (audit IV 5)                                                                                         |
| [#304](https://github.com/Lead-Agent-69/MikeHunt/pull/304) | Open  | main                       | feat(valuation): per-listing completeness + missing-photo confidence penalty, one swappable function (audit IV 6)                                                                          |
| [#303](https://github.com/Lead-Agent-69/MikeHunt/pull/303) | Open  | main                       | feat(valuation): market-local ratio from own comps + days-to-sell liquidity + opt-in holding hook (audit IV 2+4)                                                                           |
| [#296](https://github.com/Lead-Agent-69/MikeHunt/pull/296) | Open  | main                       | feat(scrapers): reliability & ops — failure log, source SLA on /status, breaker auto-pause, dead letters, incremental scans, per-source tuning, version stamp                              |
| [#295](https://github.com/Lead-Agent-69/MikeHunt/pull/295) | Open  | main                       | feat(admin): admin-only alert delivery view (depends on #291)                                                                                                                              |
| [#290](https://github.com/Lead-Agent-69/MikeHunt/pull/290) | Open  | main                       | legal(sources): per-source access classification, /status display, access-basis + republish docs                                                                                           |
| [#288](https://github.com/Lead-Agent-69/MikeHunt/pull/288) | Open  | feat/curated-sweep-2       | feat(sources): zero-source-state dealers — 5 clean-terms enabled (DE/HI/SC/MD), 9 registered off awaiting terms; JSON-LD Overfuel/DealerFire/space.auto/ProMax (stacked on #277→#272→#270) |
| [#284](https://github.com/Lead-Agent-69/MikeHunt/pull/284) | Open  | main                       | fix(find): Also search on — real disclosure button, 44px targets, clear external links                                                                                                     |
| [#283](https://github.com/Lead-Agent-69/MikeHunt/pull/283) | Open  | feat/check-any-listing     | feat(find): Check any listing UX — verdict first, one number, honest thin data, a11y                                                                                                       |
| [#281](https://github.com/Lead-Agent-69/MikeHunt/pull/281) | Open  | main                       | db: column + role-membership re-check (20261010145000) + guard catches multi-table/role grants, short invoker-off (Ren nits on #279; stacked on #279)                                      |
| [#280](https://github.com/Lead-Agent-69/MikeHunt/pull/280) | Open  | main                       | feat(sources): gov vehicle outlets for KS/OK/TN/AK/ID/ND (terms-checked) — replaces #231                                                                                                   |
| [#279](https://github.com/Lead-Agent-69/MikeHunt/pull/279) | Open  | main                       | db: stricter market_timing/stripe_events re-check (20261010140000) + guard test hardening (Ren nits on #275; stacked on #275)                                                              |
| [#278](https://github.com/Lead-Agent-69/MikeHunt/pull/278) | Open  | main                       | feat(freshness): not-live labels on Scan table, Similar deals and Arbitrage rows                                                                                                           |
| [#277](https://github.com/Lead-Agent-69/MikeHunt/pull/277) | Open  | main                       | feat(salvage): +6 verified VehiclesNETWORK dealers (TN/ID/MA new, NY/UT/CO)                                                                                                                |
| [#276](https://github.com/Lead-Agent-69/MikeHunt/pull/276) | Draft | main                       | fix(deal-check): sold comps before asks, buyer-home state, title lanes never mix (stacked on #268)                                                                                         |
| [#275](https://github.com/Lead-Agent-69/MikeHunt/pull/275) | Open  | main                       | db: market_timing_signals server-only + stripe_events self-check (20261010120000, needs Ren SIGN)                                                                                          |
| [#271](https://github.com/Lead-Agent-69/MikeHunt/pull/271) | Open  | main                       | feat(gsa): official api.gsa.gov auctions adapter (GSA_API_KEY, DEMO_KEY fallback, throttled, cars & trucks only)                                                                           |
| [#269](https://github.com/Lead-Agent-69/MikeHunt/pull/269) | Open  | main                       | feat(scrapers): polite mode by default for every scraper (randomized per-domain delays, robots always, honest UA)                                                                          |
| [#268](https://github.com/Lead-Agent-69/MikeHunt/pull/268) | Draft | main                       | fix(sold-comps): one soldTitleCategory for sold headlines + title_unverified comp penalty (stacked on #264)                                                                                |
| [#267](https://github.com/Lead-Agent-69/MikeHunt/pull/267) | Open  | main                       | feat(intelligence): tap-to-check advisor line on DealCard — depends on #266/#254                                                                                                           |
| [#266](https://github.com/Lead-Agent-69/MikeHunt/pull/266) | Open  | main                       | feat(intelligence): advisor card on deal detail (Sara's layout, dealId contract) — depends on #254                                                                                         |
| [#264](https://github.com/Lead-Agent-69/MikeHunt/pull/264) | Open  | main                       | fix(sold-comps): normalized model+trim, explicit item state, basis='sold' filter (migration needs Ren)                                                                                     |
| [#262](https://github.com/Lead-Agent-69/MikeHunt/pull/262) | Open  | main                       | fix(market): like-for-like market timing (same-listing trend, mix-adjusted fallback, min sample, confidence)                                                                               |
| [#254](https://github.com/Lead-Agent-69/MikeHunt/pull/254) | Open  | main                       | feat(intelligence): Check any listing: link/VIN/details in, one Buy/Wait/Pass card out                                                                                                     |
| [#251](https://github.com/Lead-Agent-69/MikeHunt/pull/251) | Open  | main                       | fix(honesty): label frozen/stale/ended rows, rank live first, split live vs frozen counts                                                                                                  |
| [#224](https://github.com/Lead-Agent-69/MikeHunt/pull/224) | Open  | main                       | fix(mobile): 390px layout — pinned action bars, tap-safe status banner, 44px state search, map padding                                                                                     |
| [#222](https://github.com/Lead-Agent-69/MikeHunt/pull/222) | Open  | main                       | fix(a11y): WCAG AA contrast, solid focus ring, shared dialog keyboard hook, labelled controls                                                                                              |
| [#208](https://github.com/Lead-Agent-69/MikeHunt/pull/208) | Open  | main                       | feat(map): OpenFreeMap vector tiles (free, no key)                                                                                                                                         |
| [#200](https://github.com/Lead-Agent-69/MikeHunt/pull/200) | Open  | main                       | fix(ui): Auction Lane profit/comps honesty + /arbitrage nav highlight                                                                                                                      |
| [#165](https://github.com/Lead-Agent-69/MikeHunt/pull/165) | Open  | main                       | chore(deps): bump the dependencies group across 1 directory with 57 updates                                                                                                                |
