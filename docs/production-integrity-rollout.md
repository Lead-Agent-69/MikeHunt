# Production Integrity Rollout

This release implements the integrity and visibility foundation. It is not certification of the full production plan. Source permissions are deployment inputs: choosing a source or enabling an adapter does not authorize collection, display, or derived analytics.

## Deployment Gate

The reviewed registry at `lib/scrapers/access-grants.json` is intentionally empty. Do not deploy the application changes independently of the database migration, and do not apply the migration to production without reviewing the inventory impact. The migration preserves existing records but holds them and sets deals inactive. Approved inventory must be re-observed before publication; existing inventory is not automatically reactivated by granting access.

1. Review each source's documented access rights, exact host, route, permitted uses, and expiration. Do not infer authorization from public availability, robots allowance, operator overrides, or a successful request.
2. Add reviewed records to the registry using the `AccessGrant` type. API/feed permission never authorizes website collection. Do not put credentials or private contracts in this public registry; use a suitable public evidence reference.
3. Run `npx tsx scripts/sync-source-access.ts` for validation only.
4. Test the full migration chain against a disposable staging copy. Local SQL fixtures cover key invariants, not every production dependency.
5. Stop ingestion workers, apply the reviewed migration, then deploy compatible app and worker versions with `SCRAPER_COMMIT_SHA` and `SCRAPER_WORKER_ID` set.
6. Synchronize reviewed evidence with `npx tsx scripts/sync-source-access.ts --apply`. Synchronization revokes old rights first and leaves inventory inactive until re-observation. A failed sync is fail-closed.
7. Re-observe a small approved source, verify receipts and public visibility, then run a 48-hour canary before widening coverage.

## Implemented Controls

- Reviewed, expiring source gates at source selection, dedicated adapters, shared fetching, and ingestion.
- Robots checks, minimum pacing, denial stop behavior, public-network DNS validation, body limits, and no implicit HTTP redirects in shared HTTP fetching.
- Ordinary JavaScript rendering uses guarded requests; denial pages do not trigger identity or proxy escalation.
- Listing validation, price-kind labeling, completeness warnings, bounded quarantine facts, and provenance.
- Compatible valid-VIN grouping retains distinct source offers; conflicting vehicle facts are not automatically merged.
- Transactional source price-change history avoids repeated observations for unchanged prices.
- Explicit run outcomes, redacted errors, worker/deployment metadata, and bounded local receipt spooling when database logging fails.
- Five-failure health checks and local circuit cooldowns. Permission and cancellation skips do not count as scraper failures.
- Restrictive public RLS and default server table-read filtering for held and expired inventory.
- Guarded service-role views and inventory RPC reads recheck current permissions; valuation reads require derived-use rights.
- Production feed/market caches do not reuse inventory across permission changes. This trades read volume for immediate revocation safety until a database-backed policy epoch is available.
- Redis-backed HTTP host leases, shared pacing and denial cooldowns use atomic owner tokens and fail closed when coordination is unavailable.
- Per-event receipt files reconcile idempotently before later runs. Admin quarantine endpoints support bounded review and optimistic status changes; rejected facts are never republished as listings.
- The daily retention cron prunes acknowledged receipts after 30 days and dismissed quarantine facts after 90 days; unresolved holds remain available for review.

## Remaining Release Blockers

- Finish acceptance against the full production schema for every independently constructed privileged client and derived output. Local fixtures cover guarded views/RPCs but are not a full deployed-schema rehearsal.
- Coordinate every browser subresource through shared quotas; shared HTTP leases are implemented, but rendering still needs end-to-end quota acceptance.
- Add operator review UI, authorized source re-observation from quarantine, legacy JSONL receipt migration, and alert delivery verification. Review endpoints do not claim to repair rejected observations automatically.
- Fully versioned identity groups across pagination, maps, counts, recommendations, and saved-search alerts; fuzzy candidates remain review-only.
- Official API/feed adapters and credentials where authorized, including eBay; no new source approval is implied by this release.
- Run-level provenance throughout every adapter, schema-drift baselines, verified-empty/full-scan semantics, and coverage-aware expiry.
- Production-sized migration checks, expiry/revocation end-to-end checks, monitored rollback rehearsal, and the 48-hour canary.
- Repair-model calibration, local sold-comparable weighting, and ranking freshness/accuracy evaluation against real traffic.

## Incident Handling

A denial, CAPTCHA, authentication error, or explicit access restriction is a stop signal. Pause the route and review permission; do not rotate identities, proxies, accounts, or alternate endpoints to evade it. Independently authorized APIs, feeds, uploads, and link-outs may be assessed separately.

During rollback, keep holds and restrictive RLS in place. Reverting application code or restoring previous grants must not republish legacy inventory automatically. Inspect `.cache/receipts` (or `LOCAL_CACHE_PATH/receipts`) for pending diagnostic receipts.

New `pending-<uuid>.json` receipts reconcile automatically; legacy `pending-<pid>.jsonl` files require operator review. Production approval inventory is still empty. The verified pre-release database snapshot contained 5,759 deals, of which 4,728 were active. The foundation migration would hold these records; no production migration has been applied in this lane.
