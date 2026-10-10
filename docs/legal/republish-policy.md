# Republish vs aggregate policy

_Draft by Ren (security), 2026-10-10 CT. Line refs are against `main` @ fd9b212._

## Target for `restricted` and `operator_override` sources

Show facts only, plus a link back to the original listing:
price, mileage, year/make/model(/trim), VIN, location city/state, title/condition label, auction end time, and `source_url`.

Do not: rehost or proxy photos, store or show descriptions, store or show seller names or contact details, or expose bulk export / feed / public API access to these rows.

## Current state and flags

| # | Sev | What | Where |
|---|---|---|---|
| R1 | P1 | Public image proxy re-serves photos from restricted/override hosts (craigslist, fbcdn/facebook, cargurus, cars.com, autotrader, ebay/ebayimg, copart, iaai) with a spoofed Chrome UA and forged Referer to get past hotlink blocking, then caches them publicly (`s-maxage=86400`, SWR 7 d, `Access-Control-Allow-Origin: *`). No auth. Craigslist/Facebook photos are routed through it by default. | `app/api/image/proxy/route.ts:5-23, 31-32, 76-82, 90-97`; `lib/image-url.ts:5-10, 38-51` |
| R2 | P1 | Seller phone/email mined from title+description at ingest and stored in `deals.options.contact`; shown as Call/Text/Email buttons to any flip desk (self-selected reseller/dealer mode, so any signed-in user). Private-seller PII from Craigslist/FB/OfferUp. | `lib/scrapers/pipeline.ts:182-187, 245-248`; `lib/scrapers/tools/extract-contact.ts:13-41`; `components/deal/ContactSeller.tsx:7-77`; `app/api/deals/[id]/route.ts:89-115` |
| R3 | P2 | Seller name stored in `options.seller` and not stripped by redaction (`isContactKey` matches contact/phone/email/tel/cell only), so it reaches every desk including anon. | `lib/scrapers/pipeline.ts:195, 234`; `lib/deals/deal-desk-access.ts:86-96` |
| R4 | P2 (latent) | Photo cache copies listing photos into public Supabase buckets (`vehicle-photos` 30 d cache, `deals-photos`) and rewrites `deals.images` to our URLs, with no source access check and a spoofed UA. Off while `CACHE_PHOTOS_MAX` is unset/0; becomes P1 the moment it is set. | `lib/images/cache.ts:17-75`; `lib/data/photo-storage.ts:16-77`; `app/api/admin/cache-photos/route.ts:66-106` |
| R5 | P2 | Anonymous `/api/feed` pages through every active listing (offset unbounded, no rate limit) with `source_url` and the first image URL, so it works as a public bulk API over restricted-source rows. | `app/api/feed/route.ts:28-29, 156-178` |
| R6 | OK | Descriptions are not stored (column write commented out). Keep it that way. | `lib/scrapers/pipeline.ts:276` |
| R7 | OK | No RSS feed, CSV/bulk export, or public listings API route exists. `/api/feed/[dealerId]` is the signed-in dealer's own inventory XML (owner-checked). | `app/api/feed/[dealerId]/route.ts:29-34` |

## Fix direction (not in this PR)

- R1: drop restricted/operator_override hosts from `ALLOWED_IMAGE_DOMAINS` or serve those as link-only placeholders; never send a browser UA/forged Referer.
- R2/R3: don't extract or persist contact for restricted/operator_override sources; strip `seller` for private-party sources.
- R4: refuse to cache photos whose source class is not `api`/`allowed`.
- R5: rate-limit anon feed and cap offset.

## Accepted risks (operator decision, 2026-10-10)

Jonah (operator) reviewed these and chose to keep current behaviour. They are recorded as accepted risks, not permission:

1. **Image proxy re-serving.** `/api/image/proxy` re-serves photos from restricted and operator-override hosts (Craigslist and Facebook by default). It uses a public cache (1d, plus 7d stale-while-revalidate), any origin, and a browser User-Agent and Referer. Risk: this is redistribution of third-party copyrighted images, and it can draw DMCA or terms claims.
2. **Private-seller contact for flip desks.** Phone and email extracted into `deals.options.contact` are shown via `ContactSeller.tsx` to any flip desk, and flip desk is self-selected. Risk: redistributing private individuals' PII from Craigslist, Facebook and OfferUp, which has privacy-law (e.g. CCPA) and terms exposure.
3. **GovDeals/AllSurplus sold-price history.** `scrapeMaestro` keeps lots the venue marks `isSoldAuction` as `sold_listings` rows (`basis = 'sold'`, `sale_channel = 'gov_surplus_auction'`, source `govdeals`/`allsurplus`, facts only, linked back). Behind `SOLD_CAPTURE_LQDT`, default ON (`0` turns it off; live scraping is unaffected). This is a new use of restricted-source data: the Liquidity Services User Agreement bans robots and data mining. Approved by Jonah as an accepted risk, not permission. The rows stay out of retail comps (sale_channel lane) and are labelled with their source. Revisit on any Liquidity Services takedown, cease-and-desist or terms change, before any paid or public launch, or before these rows are shown outside the gov lane or exported. (#316)

Revisit if a site sends a takedown or cease-and-desist, or before any paid or public launch.
