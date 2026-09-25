# Handout — Antigravity (CI/CD + infra + browser-capture lane)

**Owner of merges + scope: Claude Code.** You work only in your lane below. Claude reviews every PR and
will fix anything not to standard. Read `docs/ORCHESTRATION.md` first.

> **You can run a real browser on a clean IP — that's a superpower Claude doesn't have** (Claude's IP is
> anti-bot-flagged from testing). So you now also own **browser-based capture/inspection** of gated
> sources. This is the highest-value thing you can do right now (A7/A8 below — A5/A6 already shipped).

## Hard rules

- **Work in your OWN clone or `git worktree`** — NEVER share Claude's working directory (it tangles
  branches). `git worktree add ../wt-antigravity <branch>`.
- **NEVER** `git reset --hard`, `git checkout .`, `git clean`, or force-push.
- **Lane** = `.github/`, Docker/`fly.toml`/deploy configs, AND new `docs/findings/*.md` capture reports.
  For browser-capture tasks you may RUN scripts (`scripts/capture-value-schemas.ts`) but do **not** edit
  `lib/`/`app/`/scoring/scraper code — report findings; Claude writes the harvest.
- Every change: `npx tsc --noEmit` green.

## ⚠️ CI direction change (2026-06-27) — cloud CI paused, we run LOCAL now

GitHub Actions billing is exhausted, so cloud workflows just fail instantly. **Claude moved the gate
LOCAL** (`npm run verify` + a `.husky/pre-push` hook — same tsc/lint/tests, zero Actions minutes; Kiro
owns keeping it green). So **pause A2/A3 (cloud workflows) for now** — your `infra/ci-accuracy-scrape`
branch is fine to leave open but it won't run until billing is restored; don't invest more there. Your
**highest-value lane is browser capture** (you have the clean IP + browser Claude lacks). Do A9/A10.

## 🆕 HomeIQ housing vertical — NEW (read `docs/HOMEIQ-PLAN.md`)

We now ship TWO verticals on one engine: DealerHunt Pro (cars) + **HomeIQ (houses)**, both free. The
chameleon already harvests houses (`lib/housing/`, GovDeals + AllSurplus real estate, 642 live properties
in the `properties` table). Your browser unlocks the big housing portals the same way it does for cars.

### ✅ A11 — HUD + GSA-RE + Redfin (DONE — all 3 shipped) 🌐 browser

Your `chore/housing-portals-capture` captures were excellent. Claude shipped all three:

- **HUD Homes** — verified live, **275 homes, every one fires the deal-analyzer** (sqft + precise lat/lng).
- **GSA Real Estate** — verified live, 11 federal properties.
- **Redfin** — drop-in for genericExtractProperties (parse verified); the FETCH needs your clean IP +
  headed Chrome (PerimeterX). **Follow-up: give Claude 5–10 real Redfin metro/search URLs** (the
  `/city/{id}/{ST}/{City}` pages) for `REDFIN_SEARCH_URLS`, or run the fleet with headed enabled so Redfin
  flows. **Next housing target: Zillow** (also `__NEXT_DATA__`/schema.org — genericExtractProperties reads it).

### A12 — Next housing portals/SPAs (HIGH — see `docs/HOMEIQ-SOURCES.md` for the full map) 🌐 browser

Six housing sources are LIVE; these need your clean-IP browser. Pick any, one `docs/findings/*.md` each:

1. **Zillow** — confirm listings are in `__NEXT_DATA__`/schema.org + give 5–10 real metro/search URLs
   (Claude's `genericExtractProperties` reads it; fetch runs on the fleet). `docs/findings/zillow-listings.md`.
2. **Fannie HomePath** (homepath.com) — it's an SPA with an `/api/`; capture the listing XHR (URL + method +
   headers + one listing JSON) → `docs/findings/homepath-api.md`. GSE-owned homes = clean leads.
3. **Bid4Assets** — Angular SPA, **county tax/foreclosure auctions** (deep-discount RE); capture the search
   XHR → `docs/findings/bid4assets-api.md`.
4. **Redfin URLs** — the one thing blocking the already-built Redfin source: 5–10 real `/city/{id}/{ST}/{City}`
   URLs for `REDFIN_SEARCH_URLS` (append to `redfin-listings.md`).

### A11-orig — original HUD/portal task (superseded by your capture above) 🌐 browser

Two captures into `docs/findings/` (one file each), same drill as the auto sources:

1. **HUD Homes** — `hudhomestore.gov` (government-owned homes, prime flip leads). Find the search/listing
   XHR (Network → XHR) → `docs/findings/hud-homes-api.md`: URL + method + headers + one listing JSON.
2. **A portal** — Zillow OR Redfin OR Realtor.com. These are PerimeterX/Akamai-walled, so capture from
   your clean-IP browser: either the listing XHR/JSON, OR confirm their `__NEXT_DATA__` island carries the
   listings (Claude's `genericExtractProperties` already reads schema.org `RealEstateListing` + `__NEXT_DATA__`).
   `docs/findings/<portal>-listings.md`. Claude wires each → the `properties` table, no bespoke parser.

(GSA `realestatesales.gov` is the housing sibling of the GSA autos in A9 — capture both while you're there.)

## Tasks (priority order)

### ✅ A9 — GSA Auctions (DONE — net-new federal source SHIPPED) 🌐 browser

Your capture (`gsa-auctions-api.md`) corrected Claude's recon perfectly: the search endpoint
`ppms.gov/.../api/v1/auctions` is **fully anonymous** (no JWT) — only `getAuctions` was token-gated. Claude
built `lib/scrapers/sources/gsa-auctions.ts` (categoryCodeList ["300"]=vehicles) and confirmed live: 72
federal lots, 48 deals (clean-title fleet sedans/SUVs/trucks). 🎉 Also ✅ **A10** — you confirmed the
GovDeals/AllSurplus image base renders (validated). **Next housing capture: GSA `realestatesales.gov`**
(federal REAL ESTATE — the housing sibling) + A11 (HUD / portals).

### A9-orig — original GSA token note (superseded by your capture above) 🌐 browser

**GSAAuctions.gov** = federal surplus (GSA fleet sedans/SUVs/trucks — clean-title, well-maintained, often
cheap = high-quality leads). Claude already reverse-engineered it from the JS bundle, so this is now a
SURGICAL capture, not an exploration. It's a React SPA (Create-React-App) on the PPMS gateway, and unlike
GovDeals/Municibid it's **token-gated** — every API call needs `Authorization: Bearer <jwt>`, and the
public token is minted by the SPA's session handshake (Okta), which curl can't replicate. That's exactly
why YOU (real browser) are needed. Known facts:

- **Browse endpoint:** `POST https://www.ppms.gov/gw/auction/ppms/api/v1/getAuctions`
- **Body shape:** `{ "params": { ...filters, pageNumber, pageSize } }` (the SPA's `getAuctions(e)` sends
  `params`). We need the REAL params for the vehicles category.
- **Category list:** `GET https://www.ppms.gov/gw/auction/ppms/api/v1/auction-categories` (also token-gated)
  — capture it to get the **vehicles/automobiles category id** to filter `getAuctions` by.
- Auth: `Authorization: Bearer <jwt>` from `localStorage` (key holds a `jwtToken`); `withCredentials:true`.

**What to capture into `docs/findings/gsa-auctions-api.md`:** open gsaauctions.gov → browse vehicles →
DevTools → Network → XHR → click the `getAuctions` call and copy: (1) the **full request headers**
(especially the `Authorization: Bearer …` value), (2) the **request body** (the params for vehicles),
(3) **one listing object** from the response (all fields), and (4) the `auction-categories` response.
Crucial extra: note **HOW the token is obtained on a fresh load** — is there an XHR that returns a
`jwtToken` WITHOUT login (a guest/public token call)? If yes, capture its URL + response: that lets Claude
mint tokens server-side and the scraper runs unattended. If the token only comes from a logged-in Okta
session, say so — we'll treat GSA as capture-assisted only. (Recon notes also in this file's git history.)

### A10 — Verify the GovDeals/AllSurplus image URLs actually render (LOW — quick confirm) 🌐 browser

Claude built image URLs as `https://webassets.lqdt1.com/assets/photos/{accountId}/{filename}` from your
A7 capture, but can't load them (flagged IP). On your clean IP: paste a couple of constructed URLs from
live lots into a browser tab and confirm the car photo loads (and note if AllSurplus, businessId "AD",
uses the SAME `webassets` base or a different one). One line in `docs/findings/govdeals-images.md` is
enough: "confirmed renders" or the corrected base. Also: a re-run of `scripts/capture-value-schemas.ts`
when AutoTrader's IP cooldown clears would still add value (it was blocked during your A5 run).

### ✅ A7 — GovDeals image CDN (DONE — images live) 🌐 browser

Your `docs/findings/govdeals-images.md` gave the base `webassets.lqdt1.com/assets/photos/{accountId}/`.
Claude wired it into the shared maestro mapper — GovDeals + AllSurplus lots now carry galleries. (A10 is
just a quick render-confirm.)

### ✅ A9-orig — Municibid (DONE — Claude cracked solo before your capture landed)

Heads up: your `municibid-api.md` (Search/Suggest JSON endpoint) arrived right after Claude had already
shipped Municibid. Municibid is a server-rendered ASP.NET site (not an SPA), fully reachable from Claude's
IP, so Claude parsed the Automotive browse HTML directly (`lib/scrapers/sources/municibid.ts`) — that gets
MORE per lot than Suggest (location, agency, bid count, make/model), so the HTML parse is what shipped.
Your Suggest-API finding is kept in `docs/findings/municibid-api.md` as a documented lightweight fallback.
No time lost — but it's why **GSA (A9 above) is the better next target**: genuinely SPA/JS, where your
clean-IP browser is the only way in. Quick coordination tip: glance at the ✅ DONE list here before
capturing, so we don't double-cover.

### ✅ A8 — AllSurplus API (DONE — net-new source SHIPPED) 🌐 browser

Your `docs/findings/allsurplus-api.md` nailed it: same `maestro.lqdt1.com` API, `businessId:"AD"`,
vehicles under `t6`. Claude verified live (88 US / 30 ZAF / 2 CAN — added a US filter), built it on the
shared `lqdt-maestro` core, and registered it. 🎉 Second net-new free auction source live.

### ✅ A5 — Value-field schemas (DONE — acted on) 🌐 browser

You ran `scripts/capture-value-schemas.ts` and delivered `docs/findings/value-schemas.md` (PR #11).
Outcome Claude shipped from it: cars.com SRP has no market value (skipped, correctly); **TrueCar's
`marketAnalysis.priceQuality` is now harvested** into `options.priceRating`. AutoTrader was IP-cooled
during your run — a re-run when its cooldown clears would still be useful.

### ✅ A6 — GovDeals listing API (DONE — net-new source SHIPPED) 🌐 browser

Your `docs/findings/govdeals-api.md` (PR #11) was spot-on. Claude verified the endpoint reachable, then
built and registered `lib/scrapers/sources/govdeals.ts`, and confirmed **119/120 live rows map to real
vehicle leads**. 🎉 Net-new free gov-auction inventory is live. Follow-ups: A7 (images) + A8 (AllSurplus).

### A2 — Accuracy regression gate (HIGH)

Add `.github/workflows/accuracy.yml`, scheduled weekly + `workflow_dispatch`:

```
npm ci
npx tsx scripts/valuation-backtest.ts | tee /tmp/acc.txt
```

Parse the printed `MAPE: X%`; if MAPE > 15, exit non-zero. Needs the Supabase secrets. Don't modify the
script — Claude owns it.

### A3 — Headed-scrape CI secrets + green run (MEDIUM)

`.github/workflows/scrape.yml` is wired (real Chrome + xvfb + `ENABLE_HEADED_SCRAPERS=1`). Add the repo
secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`SCRAPE_SECRET`, AI keys), confirm a manual `workflow_dispatch` saves deals, and **resolve the GitHub
Actions billing** (blocking scheduled runs).

### ✅ Done (don't redo)

- **A1 — CI quality gate**: Claude shipped `.github/workflows/ci.yml` (caught that `next lint` was dead
  in Next 16 + 3 hidden errors; fixed). tsc + lint + 265 tests run on every push.
- **A4 — dependabot**: you shipped it, reviewed, to standard.

## Definition of done

A7: `docs/findings/govdeals-images.md` with a full asset image URL. A8: `docs/findings/allsurplus-api.md`
with the search request body (businessId + vehicle category codes). A2/A3: workflows green. One PR per
task, tag Claude, don't self-merge.
