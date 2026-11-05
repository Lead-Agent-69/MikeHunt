# Market eligibility CPU follow-up — 2026-11-05

Independent branch from `dcf78dad`, separate from the 1,000-row batching follow-up. The sole application change is an 18-line bounded hostname cache in `lib/sources/source-meta.ts`. No route, schema, index, gate, evidence interpretation or public response contract changes.

## Finding and final change

Production dashboard diagnostics reported 15,129 candidates / 15,125 matches, readMs 8.567–20.697 seconds, eligibility near 7.46 seconds, price interpretation 2.219 seconds, photo evidence 198 ms, aggregation 157 ms and sorting 104 ms. Batching targets serialized reads; it cannot remove this eligibility CPU floor.

An opt-in test profiles the actual GET/eligibleRows pipeline with 15,129 synthetic candidates, 15,125 matches, mixed repeated dealer/auction/unknown hosts, cash and bid evidence, current observations, comparable valuations and four out-of-scope vehicles. It records per-helper inclusive counters and a V8 CPU profile. Counters overlap and must not be added. The fixture is about 22.28 MB, with roughly 5.37 MB valuation and 4.45 MB images; it is not the production 28 MB payload or host distribution.

The first uninstrumented baseline eligibility measurement was 8.522 seconds. The instrumented route called `sourceFromUrl` 42,355 times (6.706 seconds inclusive), `vendorIdentity` 30,250 times (5.154 seconds), `sourcePriceContext` 15,125 times (5.172 seconds), `listingIdentityWarning` 30,250 times (85.7 ms) and `canonicalMarketMake` 15,125 times (80.3 ms). V8 samples attributed about 3.010 seconds to `hostMatches` and 2.809 seconds to `dealerSourceIdFromUrl`. Repeated registry scans, not make canonicalization, were the dominant candidate.

The final implementation caches only normalized hostname -> source ID or null, with FIFO eviction at 1,024 entries. It uses the existing `hostOf` normalization. Unknown-host misses are cached too. Paths, queries, fragments, full URLs, listing rows, authentication, owners and private fields are never retained. Government/dealer resolution and precedence are unchanged. `dealerSourceIdFromUrl`, including allowed-source filtering and first-match behavior, remains untouched and uncached.

Audit correction: registry additions happen in the `CURATED_SITES` module-initialization loop; no runtime registration function exists at this base. This makes host-only results stable for the module lifetime. Any future runtime registry mutation API must invalidate this cache. Earlier broader experiments were discarded; URL validation and all business helpers remain unchanged.

## Measured local results and verification

Three fixed-clock original-baseline runs and three final cache runs compared the complete public route body (only summary request time normalized). All three pairs were identical, including total, eligibility, IDs, prices, evidence, facets and economics. Application candidate/payload caches were invalidated for every request. The shared hostname cache is intentionally allowed to serve subsequent lookups.

| Run | Original eligibility ms | Final eligibility ms | Final price interpretation ms | Final sourceFromUrl ms / calls |
| --- | ----------------------- | -------------------- | ----------------------------- | ------------------------------ |
| 1   | 13,170.877              | 2,521.163            | 1,167.495                     | 173.386 / 42,355               |
| 2   | 13,539.418              | 3,154.227            | 1,500.730                     | 220.659 / 42,355               |
| 3   | 12,986.001              | 3,090.294            | 1,386.928                     | 237.687 / 42,355               |

These runs overlap other local verification, and instrumentation/clock control add overhead. They establish the repeated-host CPU opportunity and response parity on this fixture; they are not production latency predictions or cold-cache claims. The production 10-second acceptance gate remains open.

Focused source metadata/vendor identity, source price context and route tests: 137 passed. Added regressions compare government precedence and every registered dealer against the legacy resolver across normalized/trailing-dot hosts, subdomains, lookalikes and different paths/queries; verify restricted dealer lookups after unrestricted cache hits; verify negative-cache reuse and eviction after 1,024 other hosts. Existing evidence and route tests continue exercising all gates.

## Reproduction

```powershell
npx vitest run lib/sources/source-meta.test.ts lib/sources/vendor-identity.test.ts lib/deals/source-price-context.test.ts app/api/market/explore/route.test.ts
$env:MARKET_CPU_PROFILE='1'
$env:MARKET_CPU_PROFILE_LABEL='optimized-0'
npx vitest run app/api/market/explore/eligibility.profile.test.ts
```

The profile writes ignored `artifacts/market-cpu-profile/*-receipt.json`, `*-result.json` and `eligibility.cpuprofile`. Profile labels allow `baseline`, `optimized`, or `profile`, optionally suffixed `-0` through `-2`. To reproduce the original comparison, put the same opt-in profile test in an isolated `dcf78dad` checkout and run it with a baseline label; compare saved result JSON against the optimized checkout. Do not use the shared working tree for that comparison. No database or production access is needed.
