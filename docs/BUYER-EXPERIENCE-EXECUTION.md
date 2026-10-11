# Buyer Experience Execution

Updated October 11, 2026. This is the current cars execution ledger, not a claim
of production acceptance. Preserve earlier release handoffs as historical evidence.

## Product Contract

Discover -> evaluate -> save/compare -> purchase plan is the shared buying journey.
Personal, DIY, parts, reseller and dealer modes retain their appropriate tools.
Free workspace expansion never grants admin access. Do not restore retired Listing
Manager, Finance or Bulk screens. Deal Check remains a secondary cost-review tool.

Every card must expose vehicle identity, reported price type, title/condition,
mileage, location, seller/source and freshness. Missing facts stay unknown. A card
opens a real vehicle deep link without intercepting Save, Compare, contact or
disclosure controls. Asking-price estimates, sold evidence, model costs and
inspection findings must remain distinguishable.

## Existing Work To Preserve

- Main e265f2d includes buyer-scoped collection (#357/#359), truthful refresh and
  location evidence (#358), and separation of auction bids from reference values
  (#361). Latest observed production deployment for that SHA succeeded.
- Photo/gallery and occlusion changes (#356), dealer condition wording (#355),
  role-aware navigation, free expanded tools, and unavailable Saved snapshots
  already exist. Verify them; do not rebuild or delete them.
- Discovery whole-card navigation and visible buying context: commit 999c3ea,
  local branch codex/discovery-card-clarity; not yet released.
- Storage/retention protection: separate PR #360, head 19b483d. CI passed, but
  hosted apply and Ren sign-off are pending. Migration must precede web deploy.
  Do not fold this migration into a UI-only release or bypass denied access.
- Existing valuation, repair baselines, VIN history, price history, comparable
  sources, outcome feedback and regional sourcing tools are reusable capabilities,
  not proof that their hosted data is sufficiently complete or fresh.

## Phases And Acceptance

1. **Card and detail consistency (in progress).** Discovery, search and Saved
   share visible buying facts and native deep links. Independent controls work
   with touch and keyboard. Long names/VINs and unknown values do not overflow.
   Test widths 320/390/768/1440, portrait/landscape, loading/error/empty states.
2. **Evidence-first intelligence (in progress).** Fix mileage-curve arithmetic;
   describe observed price trends rather than issuing purchase commands. Label
   seasonal patterns as general heuristics, not measured local price forecasts.
   Preserve all specialist tools. Verify make/model/year/title/region and recency
   eligibility before comparing asking prices or completed sales.
3. **Cohesive workflows (pending acceptance).** Preserve filters and scroll
   across Discover/Search/Map/Swipe/Back. Save, Compare, Find similar, contact,
   transport and Plan must retain vehicle context. Role matrix: personal, DIY,
   parts, reseller, dealer and separate admin. No surprise payment or privileges.
4. **Regional comparison (pending).** Reuse existing market/arbitrage/transport
   engines. Surface same-year/title/condition local vs other-state evidence,
   sample counts, observed dates and total landed costs. Insufficient evidence
   gives an explanation, not a zero or claimed saving. Validate seasonality from
   historical observations before presenting a data-backed seasonal forecast.
5. **Coverage and durable ownership (operator/access gated).** Measure actual
   yield of permitted independent dealers, regional/public feeds and official
   APIs. Track deduplication, exact listing links, photos and field completeness.
   Never enable a restricted source or treat an external search handoff as stored
   inventory. Finish #360 in its reviewed rollout order; prove Saved survival,
   bounded storage, backup/restore and buffered observation replay.
6. **Release acceptance (pending).** Full verify, real desktop/mobile screenshots,
   signed-in role journeys, negative owner/admin tests, production smoke and
   explicit worker-image receipt. Record SHA, migration, deployment URL, counts
   and failures. A local test or merged PR is not a live success receipt.

## Current Implementation Pass

- Saved title links now cover non-interactive card areas; comparison, contact,
  disclosures and footer actions remain above that link. Missing mileage is
  explicit and long vehicle/VIN text can wrap. Source-only saves never get an
  empty internal detail route. No Saved records are deleted or rewritten.
- Search-card keyboard handlers no longer treat child Save/disclosure actions as
  card activation; root Enter/Space prevents accidental page scrolling.
- Mileage-curve interpolation is anchored to its observed first mileage and
  rejects invalid/degenerate points and extrapolation beyond the observed range.
- Market trends describe sampled asking prices rather than saying "Buy now".
  Seasonal advice is labeled as a general heuristic, with distinguishable month
  labels and a mobile-friendly strip. No fabricated local seasonality is added.
- Cross-source market context is moved into Market evidence, not duplicated in
  the advanced widget grid. Seller contact is reachable in Plan for every desk;
  specialist profit/forecast calculators retain their existing role gates.

These are local implementation changes until the release receipts are recorded.

### Follow-Up: Market Evidence Recovery

- PR #362 CI passed at 12c603f. It remains draft pending browser/role acceptance;
  the prior pass is pushed, not live.
- Correct the API trend endpoints to actual sample mileage bounds. The first
  interpolation fix alone was insufficient while the API returned 0/200k points.
- Market/source query failures become explicit unavailable responses, not empty
  markets. Partial UI failures retain available evidence with retry controls.
- Same-VIN rows show their own price type. No claimed cross-source savings from
  mixing current auction bids with retail asks. Missing or invalid source links
  are not clickable placeholders; unknown alternative prices are not $0.

## Current Blockers

- Browser automation exposes no browser in this session: visual and signed-in
  acceptance cannot be claimed from static markup tests.
- Supabase production SQL connector denied access on latest inspection. Current
  production quotas, grants, migrations and cron safety remain unverified.
- Zeus rollout is operator-only under docs/zeus-deploy-checklist.md.
- Approved durable photo archive, cold-storage replay and restore proof remain
  open. Local disk capacity does not expand hosted provider quotas.

Update this ledger with evidence as each phase closes. Do not mark all features
complete from a card polish pass or enable more ingestion before retention is safe.
