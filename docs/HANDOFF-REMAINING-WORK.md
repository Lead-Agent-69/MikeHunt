# HomeIQ + Cars — Handoff: What's Built vs What's Left

**Single source of truth.** Read this before building anything. Every "already built" item
below was verified with `grep` / file reads / `list_migrations` on **2026-07-01**.

## ⚠️ CRITICAL — check the branch first

All recent housing work lives on **`feat/reso-mls-connector`**, NOT on `main`. If you `grep`
on `main` (or a stale checkout) you will find _nothing_ and wrongly conclude features are
missing. Confirm with:

```bash
git branch --show-current            # should be feat/reso-mls-connector
git cat-file -e feat/reso-mls-connector:lib/housing/rent.ts && echo EXISTS
```

The shared prod DB (`rjfqszrohjjxsvgohmjq`) already has the housing tables applied even though
the code is unmerged — so `list_migrations` is authoritative for what exists in prod.

---

## ✅ ALREADY BUILT — do NOT rebuild (verified file paths)

### Sources (13+ live housing connectors)

- GovDeals, AllSurplus, HUD Homes, GSA Real Estate, PublicSurplus, Municibid — `lib/housing/sources/*`
- **Redfin gis-csv** (the MLS firehose, plain 200, no anti-bot) — `lib/housing/sources/redfin-gis.ts`
  (`harvestRedfinGis` for-sale + `harvestRedfinSold` comps). The old fleet-gated `redfin.ts` is replaced.
- Fannie HomePath REO — `lib/housing/sources/homepath.ts`
- Land banks: Detroit, Cuyahoga, Genesee, Lucas — `lib/housing/sources/*-landbank.ts`
- Open-data (Socrata/ArcGIS) engine + configs — `lib/housing/sources/open-data-sources.ts`
- Portals (Zillow/Realtor/Homes/Movoto/Trulia) — `lib/housing/sources/portals.ts` (fleet-gated by design)
- RESO OData client — `lib/housing/sources/reso.ts` (dormant; **settled as NOT needed** — gis-csv covers ~95%)

### Pipeline

- **Staleness/expired sweep** — `reconcileStaleProperties()` + `last_seen_at` in `lib/housing/store.ts`
  (migration `homeiq_property_freshness`, APPLIED). Retires unseen-21d listings each harvest.
- **Cross-source address stacking** — `applyStacking()` (`app/api/homeiq/leads/route.ts`) +
  `lib/housing/address-normalize.ts` + `crossEnrich()` in `store.ts`. True "on N lists" across records.
- **Price history + self-detected price drops** — `lib/housing/lead-score.ts` (6b-iii signal),
  Property cols `prev_price/price_changed_at/price_drops`, `💸 Price cut` category.
  ⛔ Migration `20260701000000_homeiq_property_price_history.sql` written but **NOT YET APPLIED** (see Approval Gates).

### Valuation (real, comp-driven — NOT coarse $/sqft)

- **Live sold-comp ARV** — `lib/housing/live-psf.ts` (`aggregateSoldPsf`, ≥4 comps/ZIP) injected as the
  top ARV tier; `zip-ppsf.json` (24,530 ZIPs), county/state fallbacks — `lib/housing/arv-psf.ts`.
- **ZORI rent / cashflow / BRRRR** — `lib/housing/rent.ts` (`rentCashflow`: cap rate, 50% rule),
  `zillow-zori.ts`, `zip-rent.json` (**8,444 ZIPs**). ⚠️ Do NOT "replace with HUD FMR" — FMR is a downgrade.
- 70%-rule flip math + confidence ladder — `lib/housing/deal-analyzer.ts` (arvSource/arvComps/arvConfidence).

### Lead intelligence

- **Unified motivation score** with distress signals + ×1.25 stacking bonus — `lib/housing/lead-score.ts`.
- **Learned calibration** from realized outcomes (dormant until ≥50 resolved) — `lib/housing/outcomes.ts`,
  `calibration.ts`, `CalibrationCard.tsx`. Pricing learns from comps; scoring learns from outcomes.

### Alerts / export / CRM (all LIVE)

- **Housing alerts** — `lib/housing/match-searches.ts` + `app/api/homeiq/saved-searches/route.ts`
  - `sendPropertyMatchEmail` (Resend). Migration `homeiq_saved_searches` **APPLIED in prod**.
- **CSV / direct-mail export** — `exportLeadsCsv()` in `app/homeiq/leads/page.tsx` (owner + mailing + math).
- **Saved pipeline** (Kanban) — `app/homeiq/saved/page.tsx` + `saved_properties` (APPLIED).

### UI (full pass done)

- Shared chrome (TopNav/BottomNav/layout), ⌘K palette, Houses⇄Cars switch, count-up hero, live ticker.
- Market page: scatter (price vs sqft + trend), equity waterfall, rental-yield, KPIs, heatmap, filter bar.
- Detail page: ValuationBasis + OfferSolver + DecisionHeader, price-drop chip.
- Fully responsive (list/map toggle, mobile filters, single-stage pipeline). All gate-green.

---

## 🔨 REMAINING WORK — what's actually left (prioritized)

Legend: **[migration]** = needs a prod DB change → explicit per-migration approval.
Risk is honest; ignore any "2-hour" estimates from prior handoffs.

### P1 — biggest volume, lowest risk (scale the engine we already have)

1. **Scale open-data configs** — `lib/housing/sources/open-data-sources.ts`. **In progress.** Added +3
   verified live (2026-07, ~82k leads): New Orleans code-enforcement (7,249), **Montana statewide absentee**
   (31,192), **Massachusetts statewide absentee / MassGIS L3** (44,167). Clean statewide absentee layers
   (MT/MA/NY/AZ) are the high-leverage adds >> address-only city code feeds.
   **METHODOLOGY**: discover URLs via `https://www.arcgis.com/sharing/rest/search?q=...&f=json` (guessing
   org-hash URLs = ~0% hit); probe `{url}/0?f=json`; **require a clean owner-STATE field** (`OWN_STATE`/
   `MAIL_STATE`) + street address + recency before adding.
   **LARGELY TAPPED**: a 53-service sweep found 0 _new_ usable statewide layers (hits were NY-dupes or tiny
   counties); Wisconsin-schema states (`STATE` = property state, no owner-state) can't do clean absentee.
   **Unresolved big-market candidate**: NJ MOD-IV (huge market, non-standard field names, exact service URL
   not yet found — worth a deeper hunt). Diminishing returns per probe from here.
2. **Expand FSBO metros** — `lib/housing/sources/fsbo.ts` `METRO_QUERIES` array. Config-only. Risk: zero.
3. **More land banks** — new `lib/housing/sources/*-landbank.ts` (4 built, ~200 exist). Patterns known:
   embedded JS var (best), Framer `data-framer-name`, WordPress markers, ASP (fleet). Risk: low, per-site effort.

### P2 — cheap intelligence adds (free, real, additive)

4. ✅ **CODE DONE — Census ACS neighborhood-trajectory score** — `lib/housing/neighborhood.ts` +
   `scripts/fetch-census-acs.ts` (`npm run data:acs`) + wired (scorer 7c, detail card). **ACTION: run
   `npm run data:acs` on a networked box** to populate `lib/housing/data/zip-acs.json` (seeded empty; the
   whole feature no-ops until then). This dev sandbox proxy-blocks census.gov.
   ✅ **DONE — BRRRR (refinance & hold)** — `lib/housing/brrrr.ts` + detail card. Pure, live now.
5. ✅ **DONE — FEMA flood-zone flag** — `lib/housing/sources/fema-flood.ts` (`floodZone(lat,lng)` → NFHL,
   best-effort/cached/graceful-null) + detail "🌊 Flood zone" chip. VERIFIED LIVE (Miami→AE, Denver→X).
   Note: network works when the Bash sandbox is disabled — the earlier "WebSEAL/blocked" note was the
   _sandboxed_ result; keyless public APIs (FEMA/Socrata/ArcGIS) are reachable unsandboxed.
6. ✅ **DONE — Holding-cost calculator** — `lib/housing/holding-cost.ts` (taxes+insurance+utilities+
   hard-money interest, months ≈ 3 + ZIP DOM/30); detail-page "Holding cost" card w/ net-after-carry.
7. **Owner → queryable columns** **[migration]** — add `owner_name/owner_mailing/owner_state` cols to
   `properties`, populate in `store.ts` from `signals`. Enables cross-owner (portfolio-landlord) queries.
   Export already works without this; it's a nice-to-have. Risk: low.
8. ✅ **DONE — Anomaly detection** — `lib/housing/anomaly.ts` (robust MAD outlier vs same-state/type
   $/sqft peers) → "🎯 N% below comps" signal + "🎯 Underpriced" category + card/detail badges.

### P3 — genuinely new sources (high value, HARD — not "1-2 days")

These are per-county **court/record** systems, mostly NOT Socrata — stateful, captcha, per-jurisdiction.
Pilot ONE end-to-end (pick a clean-portal state) before committing to the grind. 9. **Pre-foreclosure / lis pendens** — the #1 investor lead type. Start with a state that has a clean
central docket (e.g. county recorder on Socrata, or a well-structured clerk portal). 10. **Probate / inherited** — county probate court dockets + assessor cross-reference. 11. **Eviction / tired-landlord** — civil-court dockets; landlord with 3+ filings/12mo + old property. 12. **Tax-sale auction calendars** — county treasurer "upcoming sale" lists (30-60 day countdown); we have
tax-_delinquent_ but not the auction _date_. RealAuction/GovEase aggregate many. 13. **Craigslist housing (FSBO)** — adapt the existing CL cars scraper to `/rea/`. Anti-bot caveat.
The scorer already has empty slots for foreclosure/sheriff/bankruptcy signals these would fill.

### P4 — cars-side + heavier

14. **NHTSA complaint trends** (cars) — we decode VINs (`lib/api/vin.ts`) but don't pull complaint/recall
    trends. Free official API → discount valuation on high-complaint models. Risk: low.
15. **Photo/condition AI** (both) — Gemini Vision (already wired for cars) to grade condition / detect
    vacant-boarded from images. NOT free (tokens/latency); output is an estimate → must be labeled. Defer.

---

## ⏭️ SKIP / DEFER (legit-sounding but wrong)

- **HUD FMR rent** — downgrade of our ZORI data (FMR = Section-8 ceilings, not market rent).
- **Predictive ML price model / learning-to-rank** — premature: no populated outcome data to train on
  (same reason the score calibration is still dormant). Revisit once outcomes accumulate.
- **RESO MLS** — settled as not needed; Redfin gis-csv gives ~95% free. Client stays dormant.
- **Scraping CarComplaints / RockAuto / Reddit** — ToS/anti-bot risk; not truly "$0."

---

## 🔐 Approval gates (need explicit per-item user OK — prod DB)

1. Apply migration `20260701000000_homeiq_property_price_history` (price-drop tracking). Code is written
   and no-ops until applied.
2. Any P2 #7 owner-columns migration.
3. **Merge `feat/reso-mls-connector` → `main`** — the single best move to end "does it exist" confusion;
   ~13 commits of housing work are unmerged.
