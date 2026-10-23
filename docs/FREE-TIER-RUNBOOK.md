# Free-tier production runbook

This runbook protects buyer access and owner data while MikeHunt operates within
Supabase Free and Vercel's selected plan. It is an operating policy, not a way to
bypass provider enforcement or licensing requirements.

## Automated public check

`Production Watch` runs twice daily from GitHub-hosted infrastructure. It calls
the canonical `/api/system/status` with redirects disabled, so a missing alias,
Vercel Authentication redirect, unconfigured deployment, empty inventory, or
inventory older than 24 hours fails visibly. `decisionReady=false` remains a
warning: discovery can stay available, but the app must not claim purchase
decision certification.

Run the same check locally:

```powershell
npm run ops:production
```

The check is public and credential-free. It never signs in, writes inventory,
changes a plan, or bypasses deployment protection.

## Provider usage receipt

Record dashboard measurements in a credential-free JSON receipt, then run:

```powershell
npm run ops:budget -- docs/receipts/free-tier-usage-2026-10-23.json
```

Required readings older than 24 hours are `unverified`, never assumed to be
zero. Monthly counters use the provider's applicable elapsed-period fraction.
Meters the dashboard does not expose may be marked optional in the checker; do
not invent values. Confirm Vercel plan eligibility separately.

## Actions by state

| State        | Required action                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ok`         | Keep normal scoped collection and remeasure monthly usage.                                                                                                         |
| `warn`       | Investigate the named meter. Reduce logs, broad queries, recomputation, or new-row intake before user-facing reads.                                                |
| `hold`       | Pause new bulk imports and backfills. Preserve login, reads, Saves, owner notes/history, and existing-row freshness updates. Do not delete data or reset counters. |
| `unverified` | Refresh missing/stale dashboard measurements and resolve Vercel eligibility. Do not call the release quota-safe.                                                   |

Database storage has explicit operating thresholds: warn at **350 MB** and stop
new inserts at **450 MB**. The worker enforces the same thresholds through
`inventory_storage_bytes()`. Cleanup remains paused until #445 recovery-key
custody and a separate protected-deletion approval are complete.

Supabase log ingestion and query allowances are advisory until enforcement
begins after the current grace period at the start of 2027. Crossing them now
produces a warning, not permission to ignore the trend.

## Monthly release receipt

Before expanding sources or raising write budgets, record:

- Supabase database, cached/uncached egress, Storage, MAU, Edge Functions,
  Realtime, log ingestion, and log query usage.
- Vercel Active CPU, memory, invocations, transfer, CDN requests, build usage,
  deployment/function storage, and Speed Insights.
- Worker image/commit, quota state, newest listing age, active inventory, and
  photo-backed inventory.
- Whether the intended use is eligible for the selected Vercel plan.

At `hold`, source expansion waits. A larger local disk does not expand hosted
database, bandwidth, compute, or Git limits.
