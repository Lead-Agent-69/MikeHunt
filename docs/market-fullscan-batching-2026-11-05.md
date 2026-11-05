# Market full-scan batching follow-up — 2026-11-05

Base: PR #638 merge `dcf78dad`. Independent follow-up to the released candidate projection; no migration or index change.

The full candidate scan requests 1,000 rows instead of 500. It retains ascending ID keysets and the existing non-advancing ID guard. Only an empty batch ends the scan: a short batch can be PostgREST's configured server cap, rather than exhaustion. UI page sizes, selected fields, eligibility, evidence interpretation, global sorting, cache keys/ownership and error handling are unchanged. An error rejects the complete scan; partial candidates are not cached.

For 15,125 database candidates, a server allowing 1,000 rows needs 16 nonempty reads plus one empty read. A 500-row server cap needs 31 nonempty reads plus one empty read. The prior short-batch implementation needed 31 reads at a 500 limit for this non-exact total. The expected reduction is 31 to 17, conditional on the server cap; this is not a guaranteed latency reduction. Database candidate counts can exceed the post-eligibility API total.

## Reproduction and verification

Use physical local dependencies and Docker. These commands create and remove disposable PostgreSQL 17/PostgREST 16.2 containers; they do not read project credentials or access production. The existing projection migration is applied only inside these disposable databases.

```powershell
npx vitest run app/api/market/explore/route.test.ts
$env:MARKET_BATCH_TEST_CAP='500'
node scripts/verify-market-candidate-projection.mjs
$env:MARKET_BATCH_TEST_CAP='1000'
node scripts/verify-market-candidate-projection.mjs
Remove-Item Env:MARKET_BATCH_TEST_CAP
node scripts/verify-market-candidate-projection.mjs
```

Batch mode inserts 2,305 eligible synthetic rows with independent random padding in both JSON roots. PostgREST enforces `PGRST_DB_MAX_ROWS=500` or `1000`, while the unmodified route requests 1,000. Native tests assert exact total, expected IDs/cash ordering across three disjoint 50-row pages in both directions, terminal empty reads after partial and exact-multiple batches, persistent mid-scan failure through SDK retries, complete retry after failure, and the non-advancing ID guard. Only failure/repeated-response injection uses a transport fault; successful responses come from actual PostgREST. The original mixed-fixture projection suite separately checks eligibility/field parity, public contracts, evidence and denied direct guest access.

Batch artifacts under ignored `artifacts/market-batch-verification/cap-{500,1000}.json` contain byte counts and three alternating repetitions of actual route-generated REST queries at requested limits 500 and 1,000. The isolated API enables plan output only for this test and returns `EXPLAIN ANALYZE, BUFFERS, VERBOSE` plans including JSON aggregation and the route's raw JSON/title/photo predicates. Plan capture uses the first keyset batch, not a complete production scan.

Verified locally on 2026-11-05: 70 route unit tests; each capped native run passed six batch tests plus three projection contract tests (9 each); the original native projection run passed 19 tests and full SQL record parity had zero mismatches. Both caps retained 2,305 total and the exact expected 150 IDs/cash prices across three pages in each direction. The 2,000-Ford exact-multiple case ended with an empty response. Focused lint and typecheck passed.

| Server cap | Requested rows | Returned rows | REST body bytes | Full REST plan execution, three runs (ms) |
| ---------- | -------------- | ------------- | --------------- | ----------------------------------------- |
| 1,000      | 500            | 500           | 741,498         | 42.772 / 44.048 / 54.385                  |
| 1,000      | 1,000          | 1,000         | 1,482,998       | 82.720 / 93.107 / 111.619                 |
| 500        | 500            | 500           | 741,498         | 46.743 / 65.875 / 63.680                  |
| 500        | 1,000          | 500           | 741,498         | 42.016 / 50.978 / 89.076                  |

These observed Aggregate-root plans include server JSON serialization and raw filters. They show roughly doubled batch payload/work when the higher limit is effective; they do not show reduced database work per candidate. Independent local container runs and concurrent verification add timing noise. No cold-cache claim is made.

## Limits and release decision

Doubling the effective batch increases transient response size and per-statement work; it does not reduce the total candidate payload retained in memory. A lower server cap remains correct but gains no request reduction and adds an exhaustion request compared with the prior short-batch exit. The request remains a serial full scan with repeated predicates and JSON/evidence work. Local synthetic plans and Docker relay timings are not production, cold-cache, or Vercel network measurements.

The production 10-second cold gate remains open. Recorded post-#638 cash ordering passed three pages in both directions, with total 15,125, but cache-miss latency still exceeded the gate. This follow-up targets fewer serialized network reads. It does not establish that database execution or cross-instance caching is fixed. After deployment, repeat the same cache-miss API probes, record actual scan pages/readMs where available, validate totals/cash order/identity, and keep performance acceptance open if the gate still fails.
