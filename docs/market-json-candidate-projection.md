# Market JSON candidate projection

Date: 2026-11-05. Independent branch: `codex/market-json-candidate-projection`.
Originally based on `45e3ee3b` (interaction PR #637); fast-forwarded to merged
main `2f4cc021` for the follow-up PR. The two base file trees were identical.
No production migration is applied by this work.

Interaction baseline deployment: PR #637, commit `2f4cc021`, alias
[dealerhunt.vercel.app](https://dealerhunt.vercel.app), deployment
`dpl_5LyWmfgxrfbykkbD1WprAWqw1Uoi`.

## Evidence and implementation choice

Production evidence measured by this Codex session through signed Chrome SQL
on 2026-11-05:

| Read-only representative query                                                                 | Recorded result                                                                                    |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 500 MO/FL active listings observed within 30 days, ID order, repeated JSON evidence extraction | **1315.261 ms warm**, 2497 shared-buffer hits                                                      |
| Narrow ID/images/mileage/ask projection                                                        | **5.145 ms**, 1467 shared-buffer hits                                                              |
| Single-expansion lateral query                                                                 | **107 ms observed**; only the first 17 plan rows were visible and the final total was not yet read |
| Description / priceEvidence / valuation equivalence over 500 source rows                       | **0 mismatches**                                                                                   |

These are **not cold-cache measurements**. Codex restored the original SQL editor
text. The 107 ms observation must not be presented as a verified final execution
time or as the full Market route's latency.

Before selecting the implementation, a local PostgreSQL 17 synthetic, toasted
500-row fixture compared the complete existing route projection to the guarded
invoker view. Alternating executions were:

| Run | Original projection | Guarded projection | Shared hits, original / projected |
| --- | ------------------- | ------------------ | --------------------------------- |
| 1   | 257.296 ms          | 24.718 ms          | 52544 / 14047                     |
| 2   | 243.803 ms          | 22.331 ms          | 52544 / 14047                     |
| 3   | 213.155 ms          | 23.095 ms          | 52544 / 14047                     |

All blocks were shared hits; no cold-cache claim is made. The initial local
fixture isolates JSON projection cost and is not production data, full API time,
or the final comprehensive verification fixture.

The selected implementation is a normal `security_invoker` view, with two
`jsonb_to_record` lateral expansions. It creates no table, materialized view,
index, payload copy, or refresh job. This matters with the reported production
database near 440 MB of its 500 MB allowance.

Final comprehensive local verification used 520 mixed synthetic rows with actual
PostgreSQL 17 and PostgREST 16.2. Complete selected SQL records had **0 mismatches**.
Its three alternating warm representative executions were **41.417 / 12.754 ms**,
**32.240 / 13.536 ms**, and **25.625 / 11.276 ms** (original / projected).
This fixture shows a smaller gain than the initial projection-only fixture, so
the larger initial ratio must not be generalized to end-to-end latency.

A subsequent verification rerun while the repository-wide gate was running also
passed all SQL/REST checks. Its warm representative pairs were **55.581 / 47.809**,
**41.232 / 21.463**, and **38.211 / 21.490 ms**. The concurrent local load adds
variance; this is further evidence against promising a fixed speedup.
The actual plan nodes, filters, function calls, timings and buffers from that
rerun are checked in at `docs/market-json-candidate-projection-evidence.json`
(repeated Output column arrays are omitted for compactness).

## Contract and security

- Preserve the original deals columns so every existing inventory predicate,
  keyset cursor, ordering and SQL filter still addresses the same fields.
- Read exactly the previous selected aliases from the view. Do not return
  `options` or `deal_analysis` in the route payload.
- Keep descriptions, price evidence, full photo URL arrays and photo audits.
  Descriptions can override misleading stored prices; valid photos can occur
  after many placeholders.
- Guard SQL NULL, JSON null, arrays and scalar JSON roots before expansion.
  Syntactically invalid JSON is already rejected by the underlying jsonb type.
- Preserve evidence flags and ROI as `jsonb`, rather than coercing strings such
  as `"true"` or `"20"` into trusted booleans/numbers.
- Preserve all valuation and identity gates, facets, summaries, redaction,
  request cancellation semantics, candidate caches and the public API contract.
- Revoke all view privileges from PUBLIC, anon, authenticated **and service_role**
  before granting only SELECT to service_role. This also neutralizes inherited
  default ACL grants on newly created public relations.
- Invoker security retains underlying column privileges and RLS. The current
  server client still uses service_role, with its existing bypass behavior; the
  route's saved-desk redaction remains the API boundary.

## Reproduce verification

```powershell
node scripts/verify-market-candidate-projection.mjs
npx vitest run app/api/market/explore/route.test.ts lib/market/candidate-projection.test.ts lib/deals/source-price-context.test.ts lib/market/valuation.test.ts lib/images/photo-evidence.test.ts
npm run typecheck
```

The Docker verifier creates disposable PostgreSQL 17 and PostgREST containers,
builds a local contract schema from the repository's deals types, applies the
migration, checks malformed JSON and grants/RLS, and compares original vs
projected SQL records and actual PostgREST route responses. It never reads
production credentials. REST traffic is relayed through Node inside the isolated
Docker network because Windows loopback forwarding is unavailable on this host.
It writes local plan evidence to
`artifacts/market-candidate-projection/verification.json` and removes its own
containers/network afterward.

Recorded checks: **145 focused unit/contract tests passed**, **16 actual REST
integration checks passed** (plus the three projection contract tests in that
run), TypeScript passed, and focused ESLint passed. SQL checks cover scalar/null
roots, malformed field types, invalid JSON syntax, invoker row-policy parity and
underlying column permissions. The migration's ACL reset was also exercised
against broad default grants, rather than assuming new views start private.

Repository-wide verification on merged main `2f4cc021`: **782 test files passed,
1 opt-in integration file skipped; 5925 tests passed, 16 skipped**. The skipped
REST checks passed separately in the disposable harness. Full typecheck and lint
passed (193 existing warnings, no errors), and the production dependency audit
reported **0 high / 0 critical** findings (12 lower-severity findings).
The initial build could not resolve Next through an out-of-root dependency
junction; replacing only the local dependency setup with physical files fixed
that, and `next build` passed without application/configuration changes.

## Release checks and remaining risks

- Require PostgreSQL 15+ for invoker views. Apply the reviewed migration **before**
  deploying the route. No automatic fallback silently widens access on a missing
  view or permission failure.
- For rollback, restore the previous route first, then drop the unused view.
- This removes repeated projection extraction; JSON-path WHERE predicates remain
  unchanged and can still detoast large rows. Global cash sorting and independent
  Insights still require the complete eligible sample.
- Planner join placement, RLS, actual filter selectivity, PostgREST serialization,
  network transfer and production data shape can alter the end-to-end gain.
  Confirm the full filtered plan and three uncached API runs after an independently
  approved deployment. Neither the reported 33-second cold request nor a sub-10s
  production target is claimed solved by local tests.
- The local contract schema is not a replay of the complete historical migration
  chain. Full repository CI, production rollout and physical-device checks remain
  separate release gates.

## Interrupted CLI login-role audit

The installed Supabase CLI version was **2.120.0**. The commands, in order, were:

```powershell
node_modules/.bin/supabase db query --project-ref qupzqpezslsbobhugswp "select current_setting('server_version') as server_version"
node_modules/.bin/supabase db query --linked --project-ref qupzqpezslsbobhugswp "select current_setting('server_version') as server_version"
```

The first command failed validation with `DbQueryMutuallyExclusiveFlagsError`,
requiring `--linked`. The second printed `Initialising login role...` and was
interrupted with Ctrl+C, exit code 1. No SELECT result was returned. Neither
command included a database password; no production migration or explicit SQL
DDL was submitted. These statements do **not** establish that CLI-internal role
initialization had no side effect.

Supabase documents that a passwordless CLI connection can provision the temporary
`cli_login_postgres` role. Its existence and expiry must be checked rather than
assuming cancellation rolled back initialization:
[Supabase login-role documentation](https://supabase.com/kb/troubleshooting/permission-denied-when-deleting-the-cli_login_postgres-role).
No role, membership, password or grant was changed as part of the audit.

On 2026-11-05 an independent Chrome audit tab was opened on the observed signed-in
SQL URL, to avoid taking over the active editor. It failed to load the Studio
shell; the single reload timed out. No SQL was submitted through that tab and
the active editor was not changed. Further remote CLI login probes were avoided.

**Role created by the interrupted probe: unconfirmed.** There is no pre-probe role
snapshot and the signed-in audit surface was unavailable. A read-only follow-up
query is supplied at `supabase/tests/market_candidate_cli_role_audit.sql`; it lists
current CLI role attributes, expiry, memberships and sessions without retrieving
passwords or changing grants. Even a current role row cannot date creation:
`pg_roles` has no creation-time column. Attribution requires retained logs or an
earlier catalog snapshot.
