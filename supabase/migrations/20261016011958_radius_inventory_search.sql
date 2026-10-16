begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

create index if not exists deals_active_radius_lat_idx on public.deals (lat)
  where active = true and lat is not null and lng is not null;

-- SQL-standard body binds object references at creation. The whole-row return
-- survives later inventory columns; the internal latitude bound uses the index.
-- Service-only, invoker rights: web routes select their existing safe projections.
create function public.inventory_within_radius(
  p_lat double precision, p_lng double precision, p_radius double precision
) returns setof public.deals
language sql stable security invoker
begin atomic
  select d from public.deals d
  where p_lat between -90 and 90 and p_lng between -180 and 180
    and p_radius > 0 and p_radius <= 500
    and d.active = true and d.lat is not null and d.lng is not null
    and d.lat between -90 and 90 and d.lng between -180 and 180
    and d.lat between p_lat - p_radius / 68.0 and p_lat + p_radius / 68.0
    and (abs(p_lat) + p_radius / 68.0 >= 90 or
      least(abs(d.lng - p_lng), 360 - abs(d.lng - p_lng))
      <= p_radius / (68.0 * greatest(0.000001,
        pg_catalog.cos(pg_catalog.radians(abs(p_lat) + p_radius / 68.0)))))
    and 7917.5226 * pg_catalog.asin(pg_catalog.sqrt(least(1.0, greatest(0.0,
      pg_catalog.power(pg_catalog.sin(pg_catalog.radians(d.lat - p_lat) / 2), 2)
      + pg_catalog.cos(pg_catalog.radians(p_lat)) * pg_catalog.cos(pg_catalog.radians(d.lat))
      * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(d.lng - p_lng) / 2), 2)
    )))) <= p_radius;
end;

revoke all on function public.inventory_within_radius(double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.inventory_within_radius(double precision, double precision, double precision) to service_role;
comment on function public.inventory_within_radius(double precision, double precision, double precision) is 'Service-only straight-line radius search before pagination. No state restriction, centroid guessing, or hidden fallback on missing coordinates.';
commit;
