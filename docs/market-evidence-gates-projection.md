# Market evidence-gate projection investigation

Base: `42e72e120fe262404f68b7ce5b9c6a6de24ee057`.
Branch: `codex/market-evidence-gates-projection`.

## Decision: hold unpublished; no full gate or PR

A single bounded production comparison does not establish a useful total-query
latency improvement. Keep this local candidate for research; do not apply its
migration or deploy its bare-column select on this evidence alone.

| Production serialized first-500 full candidate query | Raw alias | Inline expanded gate |
| ---------------------------------------------------- | --------: | -------------------: |
| PostgreSQL execution                                 | 43.657 ms |            41.149 ms |
| PostgreSQL planning                                  | 11.026 ms |            14.157 ms |
| Planning plus execution                              | 54.683 ms |            55.306 ms |
| Shared buffer hits / reads                           |  4424 / 0 |             3449 / 0 |
| CLI wall time (not DB execution)                     |   9227 ms |              9262 ms |

The bounded full-record parity query returned **0 mismatches**. Scope: fixed time
`2026-11-05T16:07:27.921Z`, the full released MO/FL 30-day SQL filters, all 52 fields,
ID ascending, LIMIT 500, forced JSON aggregation. The proposed expansion was inline;
the production view was unchanged. This was one A/B pair, not an order-balanced
production benchmark, full production scan, or an API latency measurement.

Execution saved 2.508 ms in this pair, but total planning/execution did not improve.
The buffer reduction demonstrates less query work; it does not directly measure
TOAST decompressions or establish that most production roots are large/toasted.
Any further production test should reproduce the native PostgREST wrapper and
known bind scope under parent coordination, rather than repeat this simplified probe.

### Native statement comparison

A subsequent read-only `pg_stat_statements` lookup found:

| Query ID               | Shape                                     | Calls | Mean execution |
| ---------------------- | ----------------------------------------- | ----: | -------------: |
| `5199154948224442562`  | 52 fields, raw gate alias, ID keyset      |   382 |    1698.047 ms |
| `-729088365457974005`  | 52 fields, raw gate alias, first batch    |    36 |    1952.345 ms |
| `-5447126961052805391` | Older 51 fields, no gate alias, ID keyset |   482 |     256.778 ms |

The newer keyset shape's other selected fields and normalized predicate template
match the older shape. That makes the additional gate projection relevant, but
these aggregate histories mix unknown bind values, times, and load. They are not
a paired causal measurement, and omitting required gates is not an acceptable fix.

The native SQL adds a CTE, `count(_postgrest_t)`, `coalesce(json_agg(...))`, response
setting reads, and parameterized LIMIT/OFFSET. The helper has the same current
52 field names and full filter predicates with known literal values, but uses a
simplified `json_agg` wrapper and first batch. It does **not** explain the native
1.7–1.95-second means. Normalized placeholders alone do not disclose bound values
or establish which custom/generic plan was used. No additional data scan was run
after this statistics lookup. Full texts and the comparison are retained under
`test-results/market-evidence-gates/normalized-*.sql` and
`normalized-statement-comparison.json`.

The parent's separate 1000-row basic active MO/FL/30-day sample reported mean
decoded options/analysis sizes of 473/1380 bytes, stored sizes 443/1185 bytes, and
1.5 images. That sample omits the final photo/repair eligibility predicates and is
not a size profile of this exact first-500 query. It nevertheless makes the local
16 KB-root fixture a **stress test, not representative production payload evidence**.

Production receipts: `test-results/market-evidence-gates/production-comparison.json`,
`production-raw-plan.json`, `production-expanded-plan.json`, and
`production-readonly.json` (parity). The first multi-statement CLI run retained only
the final parity result, so each EXPLAIN was then captured once in a separate file.
No further production comparisons were run. All commands retained V3 `--read-only`;
no DDL, session-setting statements, or worker production writes were used.

The current route selects `evidence_gates:deal_analysis->evidenceGates` even
though its view already expands the analysis root. The candidate appends
`a."evidenceGates" as evidence_gates` and a JSONB record field to that existing
expansion, then selects the bare view column. No filters, evidence-gate rules,
tables, indexes, materialization, or RLS policies change.

The migration was created with the installed CLI's `migration new` command after
reading its help. `CREATE OR REPLACE VIEW` preserves the existing column prefix;
the new field is last. Local catalog assertions compare every previous column
name/type/order, ACL, invoker option, and base RLS flag/policy before and after.
The view remains `security_invoker=true`, service-role SELECT only.

## Local stress-test scope

Run `node scripts/verify-market-candidate-projection.mjs --evidence-gates`.
It creates disposable PostgreSQL/PostgREST containers without hosted credentials.
The benchmark uses the unchanged original view plus raw gate alias against the
candidate view, all 52 selected fields, and the released fixed-time MO/FL active,
30-day, individual-listing, auction, repair, photo, and source-availability SQL
predicates. It uses ID keysets and 500-row batches, including final empty-batch
exhaustion. JavaScript eligibility, recommendations, and display sorting do not
change and are not omitted from the existing route parity tests.

The reproducible fixture has 2,080 rows, approximately 16 KB per JSON root and
71.8 MB total relation storage. It returns 1,204 candidates / about 2 MB serialized
over three nonempty batches. Measurements use one persistent psql connection,
service role, alternating AB/BA order, eight plan pairs and twelve complete-scan
pairs. Full `EXPLAIN ANALYZE BUFFERS VERBOSE` and forced JSON aggregation are
recorded. Docker process startup is excluded from these client timings.

| Reproducible local measurement   |  Raw alias | Expanded gate |        Improvement |
| -------------------------------- | ---------: | ------------: | -----------------: |
| Median full-query execution      |  24.067 ms |     23.745 ms |  1.34% (5/8 pairs) |
| Median forced JSON serialization |  36.181 ms |     33.634 ms |  7.04% (8/8 pairs) |
| Median complete serialized scan  | 104.405 ms |     97.474 ms | 6.64% (9/12 pairs) |

An earlier controlled screen measured 7.20% faster serialization but only 3.05%
faster complete scans (3/6 pairs). Its confirmation measured 6.51% serialization
and 3.46% complete-scan improvement (9/12 pairs). This is a modest reduction in
query work, with variable full-scan gains. The original script also prints a
legacy whole-projection comparison; that larger speedup is **not attributable
to this incremental gate change**.

These are stress-only, synthetic, warm-cache PostgreSQL 17.11 measurements. The
parent reports production 17.6. They do not prove a production latency improvement, physical-cold behavior,
or the under-10-second search target. Parent-owned production read-only evidence
and CI remain prerequisites to any production application.

## Parity and security

The isolated run passes 20 contract/SQL/REST/route tests. Full records, candidate
counts, serialized byte counts, and SHA-256 batch hashes match. The new SQL fixture
covers SQL/JSON null roots, scalar/array roots, missing gates, JSON-null gates,
boolean/string/number/array/object gates, and nested malformed values. Actual JSON
booleans remain booleans; the string `"true"` remains a string. Existing route
tests exercise unchanged strict evidence-gate behavior.

One physical SQL distinction is explicit: `jsonb_to_record` turns an explicit
JSON-null gate field into SQL NULL. The raw path returns JSON null. Both serialize
to the same API null, and consumers do not filter on this view field. SQL and REST
tests verify wire-value parity; this is not a claim of SQL nullness identity.

The existing invoker/owner/column-privilege tests also pass. No production schema,
grants, roles, RLS, or records were changed by the worker. Parent-reported existing
advisor findings do not concern this candidate view.

## Evidence and rollout

Compact evidence: `docs/market-evidence-gates-projection-evidence.json`.
Full plans, serialized batch receipt, and integration log:
`test-results/market-evidence-gates/verification.json`, `controlled-benchmark.sql`,
`integrated-verification.log`. Exploratory and confirmation receipts are retained
there separately. Local fixture output is ignored by Git.

The production SQL files that retain plan results are
`test-results/market-evidence-gates/production-raw-plan.sql` and
`production-expanded-plan.sql`: one EXPLAIN SELECT statement each. The combined
`parent-production-readonly.sql` retains only its final parity SELECT in V3 output.
All have a fixed time and deliberately no SET, BEGIN, DDL, or writes, and run with
V3 `--remote=<ref> --read-only --file`. Service-role simulation and catalog
before/after checks are local; production uses the actual CLI caller role.

If approved after proof and CI, the parent must apply the migration and ensure
PostgREST exposes `evidence_gates` before deploying the bare-column route select.
Deploying the route first would request an unavailable column. The worker does
not apply production DDL, merge, or deploy this investigation.
