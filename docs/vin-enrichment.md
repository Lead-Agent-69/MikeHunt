# VIN enrichment (free NHTSA data)

Both VIN endpoints share `lib/vehicle/vin-enrichment.ts`; there is no third endpoint.

| Endpoint                   | Uses                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/vin/[vin]`       | `getVinDecode` (cache, then NHTSA extended decode; mcp.vin only if NHTSA is down) + `getRecallsCached` |
| `GET /api/vin/[vin]/specs` | same two, plus EPA MPG and NHTSA crash stars (unchanged)                                               |

## Sources (free, no key)

| Data                                                                                                                                                                                         | Endpoint                                                                                                                                                                | Cache                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Full decode: trim, series, body, doors, engine (cyl, displacement, config, HP, model), fuel, drive, transmission style/speeds, GVWR class, plant company/city/state/country, vPIC error code | `vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/{VIN}?format=json`                                                                                             | `vin_decodes`, one row per VIN, `expires_at` = +180 days    |
| Recall campaigns for the make/model/year family                                                                                                                                              | `api.nhtsa.gov/products/vehicle/models?modelYear&make&issueType=r` (catalog names) then `api.nhtsa.gov/recalls/recallsByVehicle?make&model&modelYear` per matching name | `nhtsa_recalls_cache`, one row per make/model/year, +7 days |

**There is no public VIN-level recall API.** `api.nhtsa.gov/recalls/recallsByVin` and
`recallsByVIN` return `403 {"message":"Missing Authentication Token"}` (checked 2026-10-10), which
is API Gateway's answer for a route that doesn't exist. NHTSA documents only make/model/year and
campaign-number lookups (https://www.nhtsa.gov/nhtsa-datasets-and-apis). Whether a specific VIN's
recall is still open is only on nhtsa.gov/recalls and the automakers' sites, so the UI must say
"recalls filed for this model year, check your VIN at nhtsa.gov/recalls", never "this car has N
open recalls".

**Model names differ between vPIC and Recalls.** vPIC decodes `1FT7W2BT8GED11804` as "F-250"; NHTSA
files its 2016 campaigns under "F-250 SD". Querying "F-250" returns `Count: 0` (a false zero, which
was the previous behavior). `getRecalls` resolves names through the recalls catalog and unions
every catalog name that equals or starts with the decoded model (`F-250 SD`, `F-250 SUPERCAB`, ...,
never `F-2500`), capped at 12 names. The union can include campaigns for a sibling body style, which
is one more reason the scope stays "model_year".

## Sizing for Supabase Free (500 MB database)

Measured from the recorded fixtures (`lib/vehicle/__fixtures__/nhtsa`):

- `vin_decodes`: ~350-400 B of heap per row with every column filled, ~0.5 KB with page overhead,
  the PK and the `expires_at` index. **100k VINs ~ 50 MB.** The 154-key raw response (~4 KB) is not
  stored; storing it would make the same 100k VINs ~450 MB, close to the whole Free quota.
- `nhtsa_recalls_cache`: ~0.2 KB plus ~175 B per campaign (2003 Accord: 24 campaigns ~4.2 KB JSON;
  2016 F-250: 4 campaigns ~0.7 KB). Rows are per make/model/year, so they grow with the number of
  distinct vehicles looked up, not with VINs. How many distinct make/model/years MikeHunt sees is
  not measured yet.
- Upstream calls: a decode is 1 request per new VIN; recalls are 1 catalog request + 1 per matching
  name (2016 F-250: 5; 2023 Camaro: 8) once per make/model/year per week.
- `purge_expired_vin_cache()` deletes rows 30 days past `expires_at`. It runs daily from the existing
  retention cron (`/api/cron/retention`, right after `run_retention`); no new Vercel cron.

## What free data can't give

| Not available free                                                            | Notes                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory option codes / build sheet (RPO codes, packages, installed equipment) | vPIC decodes what the VIN pattern encodes, not what was installed. OEM window stickers (`lib/vehicle/window-sticker.ts`: Ford, GM, Stellantis) carry options for some newer VINs only, as PDFs, per automaker. |
| Original MSRP / sticker price                                                 | vPIC has a `BasePrice` field; it was empty for all three recorded VINs. Same window-sticker caveat.                                                                                                            |
| Exact trim for many VINs                                                      | `Trim` was empty for the 2016 F-250 (only `Series` "Super Duty - Single Rear Wheel"). Trim often isn't encoded in the VIN.                                                                                     |
| Exterior/interior color                                                       | Not in the VIN.                                                                                                                                                                                                |
| VIN-level open-recall / remedy status                                         | See above; model-year scope only.                                                                                                                                                                              |
| Title brands, salvage/junk/flood history                                      | NMVTIS data is sold through approved paid providers.                                                                                                                                                           |
| Accident, damage, service, ownership count, odometer history                  | Commercial history reports only (Carfax, AutoCheck).                                                                                                                                                           |
| Theft / insurance-loss status                                                 | NICB VINCheck is a free manual web lookup with no public API.                                                                                                                                                  |
| Market value                                                                  | Not a NHTSA product; we compute from our own deal rows.                                                                                                                                                        |
| Exact GVWR, curb weight                                                       | vPIC gives a GVWR class range ("Class 2H: 9,001 - 10,000 lb"); we keep the upper bound.                                                                                                                        |
| Engine HP for every VIN                                                       | Blank for the 2023 Camaro ZL1 fixture.                                                                                                                                                                         |
| Pre-1981 and non-US-market VINs                                               | vPIC covers 17-character VINs submitted by manufacturers selling in the US.                                                                                                                                    |

A non-zero vPIC `ErrorCode` (e.g. `1` bad check digit) still returns partial data; it is stored
with `decode_clean = false` and returned as `decodeClean: false` so the UI can say "unconfirmed".

## Access, time budget and limits (Ren review on #301)

- `nhtsa_recalls_cache` is server-only: RLS on with no policy, and every grant is revoked from
  PUBLIC/anon/authenticated (service_role only). Every reader and writer is the service-role client.
- `purge_expired_vin_cache()` is `SECURITY INVOKER` with `search_path = ''`. It works because
  service_role bypasses RLS, and the migration's self-check fails if that ever stops being true.
- Legacy `vin_decodes` rows get `expires_at = decoded_at + 180 days`, so the purge reaches them.
- Upstream calls: every NHTSA/EPA/mcp.vin request has a 10s timeout, and each `/api/vin` request has
  a 15s overall deadline (`lib/vehicle/deadline.ts`). Once the deadline passes, later calls are
  skipped. A recall lookup cut short reports unknown (`null`), never a partial low count.
- Limits (`lib/vehicle/vin-route-guard.ts`), on top of per-IP 30/min. **All per serverless instance**
  (in-memory, like `lib/rate-limit`), not global quotas: N warm instances allow N times these numbers.
  - 300/min per instance, shared by both VIN routes;
  - 60/min per signed-in user id, per instance;
  - 200 new cache rows/hour per instance, counting `vin_decodes` and `nhtsa_recalls_cache` inserts
    together. Over budget, the live answer is still returned but not cached; refreshing an existing
    row is free.
- Recalls are all-or-nothing: if the recalls catalog call or ANY per-model lookup fails, times out or
  returns a bad/oversize body, the result is `null` (unknown) and nothing is cached.
- Every upstream body (NHTSA, EPA, mcp.vin) is capped at 1 MB (`readJsonCapped`).
- mcp.vin is untrusted: only a validated year (1981 to current year + 2), make/model/trim (charset + length)
  and cleaned engine/country survive (`lib/vehicle/mcp-vin.ts`).
- Safety stars + EPA MPG (`/specs` extras, `lib/vehicle/extras-ttl.ts`): kept 180 days once both are
  found, then BOTH are looked up again (old values kept if the refresh comes back empty). If either is
  missing, only the missing one is retried after 6h, up to 3 attempts (`vin_decodes.extras_attempts`,
  migration 20261010401000); after that the gap is reported `"n/a"` in `extrasStatus` for 180 days —
  the usual case is a heavy-duty truck (`heavyDuty: true`, GVWR > 8,500 lb: no EPA MPG, no NHTSA
  crash ratings). Before 401000 is applied the counter isn't stored and the 6h retry continues.
- `fetchObservedPrices` has a 10s timeout and a 2 MB body cap.
- `readJsonCapped` reads only through the body stream and cancels it at the cap; a Response without a
  stream is refused (no uncapped `text()`/`json()` fallback). VinAudit (`vin-history.ts`, 10s + 1 MB)
  and `observed-price-history.ts` (2 MB) use it too.
- `lib/api/vin.ts` was removed (its client fetchers were unused); the lane page's camera scan moved
  to `lib/vehicle/vin-scan.ts`.
