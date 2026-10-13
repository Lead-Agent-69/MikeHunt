-- Read-only production acceptance snapshot. Run on demand, not per page view.
begin transaction read only;
set local statement_timeout = '10s';

select now() as checked_at,
  pg_database_size(current_database()) as database_bytes,
  to_regprocedure('public.prune_inventory_retention(integer)') is not null as protected_retention,
  to_regprocedure('public.inventory_storage_bytes()') is not null as storage_meter;

select source, count(*) as active_rows,
  count(*) filter (where last_seen_at >= now() - interval '24 hours') as fresh_24h,
  count(*) filter (where coalesce(cardinality(images), 0) > 1) as multiple_photos,
  count(*) filter (where mileage is not null) as with_mileage,
  count(*) filter (where vin is not null and length(vin) = 17) as reported_vin,
  max(last_seen_at) as latest_seen
from public.deals where active = true
group by source order by active_rows desc;

-- Discovery counts are not confirmed writes. Inspect new/updated counts separately.
select source, status, started_at, completed_at, deals_found, deals_new, deals_updated
from public.scraper_runs order by started_at desc limit 15;

select jobname, active, schedule from cron.job
where active or jobname in ('cleanup-expired-deals', 'cleanup-dead-deals')
order by jobname;
commit;
