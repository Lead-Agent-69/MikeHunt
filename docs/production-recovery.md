# Production Recovery Gate

## Current Status

As of 2026-10-18, the protected retention migration is installed and its cleanup job
is inactive. The synthetic local PostgreSQL archive/restore test passes. **A production
backup has not been exported or restored.** Do not describe a local rehearsal, an empty
backup folder, a listing cache or a Git checkout as a production recovery proof.

An owner-only Google Drive backup folder has been verified and the owner approved
uploading encrypted production database records there. Destination metadata and approval
belong in private operator receipts, not this repository. The remaining export prerequisite
is the existing primary database credential, supplied through a protected local secret
location. Do not reset credentials, paste them into chat or substitute another project's
connection. A Supabase service-role API key is not a PostgreSQL password.

## Export And Preserve

1. Verify the primary project identity, database server version and local client version.
   Use a direct connection, or the dashboard's session pooler for IPv4; do not use the
   transaction pooler for a dump. Preserve TLS verification. Do not buy an IPv4 add-on.
2. Follow the current Supabase CLI backup guide below and inspect the installed command's
   `--help`. Export roles, schema and data separately with explicit project targeting.
   Default `db dump` is not a complete data backup. Do not trust the CLI's linked default,
   inherited environment or an API key as proof of the database target.
3. Keep credentials out of command logs and process arguments where supported. Never use
   `--debug` with production credentials. Stage artifacts outside Git, Vercel and public
   web roots in an access-restricted directory; never commit dumps, keys or account rows.
4. Inventory all application schemas and protected references. Include auth users and
   app-owned schemas according to the supported Supabase restore workflow; explicitly
   record managed schemas, role passwords, secrets and extensions that require separate
   provisioning. If exports use separate snapshots, record consistency limitations and
   coordinate writes or use a reviewed consistent-snapshot export before certification.
5. Encrypt with a maintained authenticated-encryption tool, not a home-grown archive format.
   Record tool version, ciphertext size and SHA-256. Keep the recovery key separate from
   the ciphertext, out of Git and out of the same cloud folder. The owner must have an
   independently recoverable key copy before claiming loss-of-device recovery.
6. Upload only to the specifically approved private destination. Verify owner-only sharing,
   upload completion and a downloaded ciphertext checksum. Never expand sharing or create
   public links. Measure export/transfer usage against remaining free-tier quotas; do not
   schedule repeated full exports or create paid resources without an approved budget.

## Restore And Verify

1. Use a fresh isolated, non-public recovery environment compatible with the source
   Postgres and Supabase extensions. Do not restore into the live project or overwrite the
   existing local development database. Keep outbound email, push, cron and workers off.
2. Download the off-device artifact, verify its recorded checksum, decrypt with the
   independently held key, and restore roles, schema and data in the documented order.
   Stop on errors. Do not suppress failed constraints or permissions to obtain a green run.
3. Compare source-snapshot and restored row counts plus deterministic graph fingerprints
   for saved cars, watchlists, inventory, outcomes, dealer deals, alert matches, snapshots,
   private notes and their referenced listings. Store only hashes/counts in ordinary logs.
4. Verify RLS, ownership policies, service-only maintenance grants, indexes, functions,
   migration history and foreign keys. Confirm the restored cleanup job is still inactive.
   Run representative signed-in read flows without sending production alerts.
5. Record observed backup age (RPO), export/download/restore durations (RTO), tool versions,
   artifact identity, scope, missing assets and verifier results. Target RPO/RTO values are
   not measured guarantees. Failure leaves cleanup inactive and retains the last good copy.

Database dumps contain Storage metadata, **not Storage object bytes**. Source-hosted car
photo URLs can expire independently. Separately inventory private Storage objects, source
photo permissions, worker caches/profiles and deployment secrets. Do not put browser profiles
or scraper credentials in an account-data backup without separate scope approval.

No automatic backup deletion or recurring schedule has been enabled. Define measured
growth, rotation and successful-restore requirements before enabling either. Enabling
production listing cleanup still requires its own explicit permanent-deletion approval.

## References

- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- Local synthetic rehearsal: `node scripts/test-retention-restore.mjs`
- Protected deletion regression: `node scripts/test-protected-retention.mjs`
