# Market evidence-gate projection investigation

Base: `42e72e120fe262404f68b7ce5b9c6a6de24ee057`.
Branch: `codex/market-evidence-gates-projection`.

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

## Measured scope

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

These are synthetic, warm-cache PostgreSQL 17.11 measurements. Production is
17.6. They do not prove a production latency improvement, physical-cold behavior,
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

The parent production SQL file is
`test-results/market-evidence-gates/parent-production-readonly.sql`. It contains
only SELECT and EXPLAIN SELECT, with a fixed time, two serialized 500-row plans,
and bounded full-record parity. It deliberately has no SET, BEGIN, DDL, or writes,
so it can run with the V3 CLI's `--remote=<ref> --read-only --file` flags. The
production caller role is returned by the query; service-role simulation is local.
An extended optional plan file is separate to avoid duplicate heavy execution.

If approved after proof and CI, the parent must apply the migration and ensure
PostgREST exposes `evidence_gates` before deploying the bare-column route select.
Deploying the route first would request an unavailable column. The worker does
not apply production DDL, merge, or deploy this investigation.
