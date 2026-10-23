# Inventory identity and gallery depth receipt

Read-only production checks ran on 2026-10-23 against the primary MikeHunt
project while the collector's write allowance remained exhausted. They issued no
writes, did not reset a quota, and did not activate a restricted source.

## Canonical identity

The active AutoTempest-backed inventory contained 26,566 rows and 26,566
canonical identity groups. The audit found zero canonical collision groups, zero
duplicate rows beyond the canonical groups, and zero rows missing both a source
URL and aggregator ID.

The audit uses the same identity function as ingestion. Tracking-only query
parameters and trailing slashes are normalized, while source boundaries and
meaningful parameters remain distinct. Its report contains aggregate counts only;
it does not print listing URLs or VINs.

## Photo depth

| Source host         | Stored sample | Usable photo rows | Multi-photo rows | Average photos | Maximum photos |
| ------------------- | ------------: | ----------------: | ---------------: | -------------: | -------------: |
| `x2builders.com`    |           128 |               128 |                0 |            1.0 |              1 |
| `billsmithauto.com` |             9 |                 9 |                0 |            1.0 |              1 |
| `damage.com`        |           245 |               245 |               11 |            1.6 |             14 |
| `dgautollc.com`     |           184 |               184 |              184 |           17.6 |             20 |

The active aggregator inventory also contained 188 Carvana rows with multiple
photos. Other AutoTempest origin channels currently expose one usable preview
image per row. A one-photo result is reported as a preview, not a complete source
gallery.

`photoReachabilityVerified=false` remains explicit in the source-publication
report. Stored URLs and gallery depth do not prove that every remote image is
currently reachable. The existing bounded photo-health flow remains responsible
for reachability checks.

## Repeatable checks

- `npm run audit:inventory-evidence -- --env-file <worker-env>` measures active
  AutoTempest canonical identities and photo depth without exposing identifiers.
- `scripts/audit-source-publication.ts` now includes aggregate gallery depth for
  the bounded permitted-dealer sample.

Run both after a natural sweep to compare the new receipt with this baseline. Do
not force collection or increase write limits solely to refresh these numbers.
