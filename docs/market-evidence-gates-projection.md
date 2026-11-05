# Market evidence-gate projection

Base: `bc5e34f8` (PR645). Branch: `codex/market-evidence-gates-projection`.

The route selects `evidence_gates` from the view's existing guarded analysis
expansion instead of separately evaluating `deal_analysis->evidenceGates`.
The new migration appends `a."evidenceGates" as evidence_gates` and a JSONB record
field. It retains the existing view column prefix, invoker security, and service-only
SELECT grants. No index, table, stored payload, backfill, role setting, RLS policy,
financial rule, filter, cache, or display behavior changes.

The user approved this as bounded removal of redundant query work. It is **not a
proven cold-query/SLA fix**. The normal full gate and CI are required before review;
the parent owns production view application before app merge and cold acceptance.

## Verification

Run `node scripts/verify-market-candidate-projection.mjs --native-gates`.
This creates disposable PostgreSQL and native PostgREST **14.5** containers with
no hosted credentials. The new test uses real released filter builders and all
52 fields, `char(2)` states / `character[]` bindings, the listing-condition enum,
service-role requests, 500-row ID keysets, and an empty final batch. PostgREST
produces its actual COUNT-ROW/JSON-aggregation wrapper; this is not a hand-written
simple aggregate.

The small-root fixture has 2,080 rows, mean object-root JSON sizes of **482 bytes
options / 1,246 bytes analysis**, and 1,196 candidates over three nonempty batches.
The benchmark runs inside a persistent Node relay, excluding Docker/CLI startup.
After two warmup scans per variant, eight alternating pairs match full-body hashes,
2,046,948 serialized bytes per scan, row counts, ranges, all 52 fields, and typed
boolean/string gates. Repair-title fixtures are excluded and a clean control stays.
Captured prepared statements prove the actual wrapper and correct state/condition
array types, with more than six executions. Mode stays `auto`; no GUC is changed.
Anonymous view access returns 401.

| Native local HTTP measurement   | Raw gate alias | Expanded gate |
| ------------------------------- | -------------: | ------------: |
| Median complete serialized scan |       85.10 ms |      85.52 ms |
| Projected slower pairs          |                |         4 / 8 |

There is no observed robust regression (the guard requires >25% median slowdown
and at least 7/8 slower pairs). These timings overlapped sibling local work and
are **not** a claimed speedup or production latency result. Full-body parity is
independent of that timing caveat. The existing SQL/REST/route suite also passes
all 20 tests, including strict evidence gates, malformed roots, private-column
permissions, invoker RLS, sorting, and financial response parity. PR645's normalized
cache implementation is retained unchanged.

The SQL fixture separately covers SQL/JSON null roots, scalar/array roots, missing,
null, boolean/string/number/array/object gates, and nested malformed values. One
physical SQL distinction is explicit: `jsonb_to_record` maps a JSON-null field to
SQL NULL; both serialize as API null. No view consumer filters on this field.

## Production evidence and rejected strong claims

Read-only fixed-scope plans compare 500 MO/FL, active, observed-within-30-day
candidates with the complete released SQL eligibility predicates and all 52 fields.
Raw shared-buffer hits are consistently **4424**, expanded **3449** (~22% fewer),
with zero reads. This supports reduced query work, not a universal TOAST diagnosis.
The parent's separate basic 1000-row sample measured options/analysis decoded means
473/1380 bytes; that sample is not the exact full-eligibility scope. Earlier 16 KB
synthetic-root tests are **stress controls only**, not production size evidence.

Production execution timing is highly variable. Parent raw-wrapper observations
include 44.770, 838.793 and 1924.138 ms, versus expanded 41.442, 76.421 and 76.656 ms.
A worker expanded observation was 232.059 ms. They are not an isolated causal win.

A same-window worker ABBA wrapper/simple control, using identical field/predicate
bytes, observed:

| TIMING | Raw native-shaped wrapper | Simple aggregate  |
| ------ | ------------------------- | ----------------- |
| ON     | 75.305, 42.522 ms         | 41.375, 41.849 ms |
| OFF    | 42.293, 42.330 ms         | 41.389, 40.910 ms |

All use 4424 hits / zero reads. Thus the isolated 1.924-second wrapper result does
not prove inherent COUNT-ROW amplification. The plans have no JIT section and a
root estimated cost around 703, so no JIT causal claim is made. No physical-cold
or under-10-second claim is made.

Normalized native statements with raw gates average 1.7-1.95 seconds historically;
the older 51-field statement omits required gates. Their other fields and normalized
keyset predicate template match, but historical means mix unknown binds and load.
Omitting gates is not a valid fix. The simplified initial helper omits COUNT ROW,
response settings and native parameterization, so it does not establish native cost.

Generic plans can lose partial-index eligibility, but the early explicit `text[]`
state cast was not a faithful `bpchar[]` model. Actual 14.5 native capture uses 30
first-batch / 31 keyset bind parameters; the normalized 39/40 placeholders also
include nine response constants. Automatic custom/generic choices differed across
fixtures. Neither generic plans nor global/role plan settings are established as
the production cause. **No role/GUC/index change is included.**

The repair regex is byte-identical between the released helper and the SQL literal:
prefix character codes 92,121 are one backslash followed by y. PostgreSQL and the
app agree on 18 positive/negative title fixtures; native REST also excludes the
controlled repair records. Double backslashes in displayed JSON were escaping.

## Evidence and deployment order

Compact evidence is `docs/market-evidence-gates-projection-evidence.json`.
Full local/native receipts are under `test-results/market-evidence-gates/`
(`native-rest14.json`, `native14-verification.log`, SQL/catalog checks), and
`test-results/market-plan-cache/` (native prepared capture, regex fixtures,
production ABBA, and complete read-only plans). The optional `--evidence-gates`
script is a historical synthetic stress/simple-aggregate control, not the native
release benchmark. All production research used V3 `--read-only` SELECT/EXPLAIN;
there were no worker production writes or setting changes.

After CI and review, the parent must apply the append-only migration and confirm
PostgREST exposes the new column **before** merging/deploying the app select. The
parent then owns nine genuine cold/guest acceptance checks; the cold target remains
open until measured. An app rollback may use the prior raw alias while the extra
unused view column remains. The worker does not merge, deploy, or apply production
DDL for this investigation.
