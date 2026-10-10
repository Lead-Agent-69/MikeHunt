# Free-tier budget: Vercel Hobby + Supabase Free

Measured on 2026-10-09 (America/Chicago) against the production project. Plan limits are from
vercel.com/docs/plans/hobby and supabase.com/pricing, read the same day. Re-run the queries at the
bottom monthly.

## TL;DR

| Resource | Free limit | Today | Projection | Risk |
| --- | --- | --- | --- | --- |
| Supabase database size | 500 MB | **64 MB** (`deals` is 37 MB) | ~8 KB per deal row (data + indexes + embedding). At this week's ~965 new rows/day and the 90-day hard delete, steady state is **~85k rows ≈ 700 MB** | **High.** The first real limit we hit, in about 6–8 weeks at the current intake |
| Supabase egress | 5 GB/mo (+5 GB cached) | not exposed by the API; check the dashboard | `/api/market/explore` can pull up to 8,000 rows (~10 MB) per uncached filter combo | **Medium.** Fine with the 30 s cache and low traffic; watch it once there are users |
| Supabase MAU | 50,000 | 6 auth users | — | Low |
| Supabase file storage | 1 GB | ~0.5 MB | Photos are hot-linked, not stored | Low |
| Supabase Realtime | 200 concurrent / 2M msgs | /scan subscribes to `deals` INSERT/UPDATE | Each sweep's upserts fan out to every open /scan tab | Low now; Medium with traffic |
| Supabase inactivity pause | paused after 7 days idle | Zeus writes every few minutes | — | Low while Zeus runs |
| Vercel Active CPU | **4 CPU-hrs/mo** | — | The tightest Vercel number. Heavy routes: explore (8k-row facet), scan, VIN (3 upstream calls) | **Medium** |
| Vercel function invocations | 1M/mo | — | Fine below ~30k page views/day | Low |
| Vercel Fast Data Transfer | 100 GB/mo | — | Pages + JSON; images are hot-linked | Low |
| Vercel image optimization | 5,000 transformations | — | Keep `unoptimized` on remote listing photos | Medium if `next/image` optimizes listing photos |
| Vercel deployments | 100/day | Codex + PR previews | `amy/vercel-ignore-non-main` (#212) stops non-main builds | Low after #212 |
| Vercel cron | daily only on Hobby | 3 daily crons (alerts ×2, retention) | — | OK |
| Vercel function duration | 300 s max | 5 routes set long `maxDuration` (rescore, cache-photos, embeddings backfill, orchestrator, scrape/run) | Run them on Zeus, not Vercel | Medium |

**Policy note:** Vercel's fair-use terms limit Hobby to **non-commercial, personal use**. Once MikeHunt
charges customers, the Vercel side has to be on Pro ($20/mo per seat) regardless of usage. Supabase Free has no such
clause, but it has no backups. Turn on Pro before storing anything customers paid for.

## Supabase: what to do before the 500 MB wall

1. **Drop embeddings on inactive rows.** The `embedding` column is about 3 KB of each row. Nulling it when a
   deal goes inactive cuts ~40% of the table, with no product loss because similarity search only uses
   active rows.
2. **Shorten the inactive hard delete from 90 to 45 days** (`pruneStaleDeals()` on Zeus), keeping the
   watchlist/saved/outcome exemptions. The 30-day demotion stays.
3. **`spatial_ref_sys` (7 MB)** is PostGIS's reference table. It can't be dropped while PostGIS is
   installed. Leave it, but don't count it as growth.
4. **Cap the explore pull:** select only the columns explore facets need. `deal_analysis` is ~1.2 KB per row,
   and only `roi` is read from it. Expose `roi` as a column or view and drop `deal_analysis` from the select.
   That cuts explore egress by ~60%.
5. Alert at **350 MB** (70%). /status can show `pg_database_size()` next to the scraper panel.

## Vercel: keeping Active CPU under 4 hours

- Keep the `cached()` 30 s memo on explore/scan. Add `Cache-Control: s-maxage=60, stale-while-revalidate`
  to public read routes (scan for guests, market overview, multisite is client-only already) so the CDN answers
  repeats without a function call.
- Long jobs belong on Zeus. Vercel crons should stay as single RPC calls (retention already is).
- VIN routes call NHTSA 2–3 times. `/specs` caches in `vin_decodes`. `/api/vin` should read that cache too
  (follow-up).

## Monthly check (copy into the SQL editor)

```sql
select pg_size_pretty(pg_database_size(current_database())) as db;
select relname, pg_size_pretty(pg_total_relation_size(c.oid))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and relkind = 'r'
order by pg_total_relation_size(c.oid) desc limit 10;
select count(*) filter (where first_seen_at > now() - interval '24 hours') as new_24h,
       count(*) filter (where active) as active,
       count(*) as total
from deals;
```

Vercel usage: Dashboard → mikehunt team → Usage (Active CPU, Invocations, Fast Data Transfer, Image
Transformations). Supabase egress: Dashboard → Organization → Usage.
