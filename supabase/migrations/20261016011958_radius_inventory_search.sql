begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

create index if not exists deals_active_radius_lat_idx on public.deals (lat)
  where active = true and lat is not null and lng is not null;

-- Service-only invoker, qualified references, no caller-provided SQL. A text SQL
-- body expands future columns at call time and allows filter/order/limit pushdown.
-- No function SET clause: it would prevent planner inlining (covered in SQL QA).
create function public.inventory_within_radius(
  p_lat double precision, p_lng double precision, p_radius double precision
) returns setof public.deals
language sql stable security invoker as $$
  select d.* from public.deals d
  where $1 between -90 and 90 and $2 between -180 and 180
    and $3 > 0 and $3 <= 500
    and d.active = true and d.lat is not null and d.lng is not null
    and d.lat between -90 and 90 and d.lng between -180 and 180
    and d.lat between $1 - $3 / 68.0 and $1 + $3 / 68.0
    and (pg_catalog.abs($1) + $3 / 68.0 >= 90 or
      least(pg_catalog.abs(d.lng - $2), 360 - pg_catalog.abs(d.lng - $2))
      <= $3 / (68.0 * greatest(0.000001,
        pg_catalog.cos(pg_catalog.radians(pg_catalog.abs($1) + $3 / 68.0)))))
    and 7917.5226 * pg_catalog.asin(pg_catalog.sqrt(least(1.0, greatest(0.0,
      pg_catalog.power(pg_catalog.sin(pg_catalog.radians(d.lat - $1) / 2), 2)
      + pg_catalog.cos(pg_catalog.radians($1)) * pg_catalog.cos(pg_catalog.radians(d.lat))
      * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(d.lng - $2) / 2), 2)
    )))) <= $3;
$$;

revoke all on function public.inventory_within_radius(double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.inventory_within_radius(double precision, double precision, double precision) to service_role;
comment on function public.inventory_within_radius(double precision, double precision, double precision) is 'Service-only straight-line radius search before pagination. No state restriction, centroid guessing, or hidden fallback on missing coordinates.';
notify pgrst, 'reload schema';
commit;
