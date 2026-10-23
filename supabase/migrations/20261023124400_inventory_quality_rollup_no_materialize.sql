begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- The quality rollup reads the base CTE twice: once for the full aggregate and
-- once for duplicate VINs. PostgreSQL otherwise materializes every wide deal
-- row, including JSON and photo arrays, and spills on the free-tier database.
-- Inline both references so each scan can prune columns independently.
do $patch$
declare
  definition text;
  optimized text;
begin
  select pg_get_functiondef('public.inventory_quality_rollup_v1()'::regprocedure)
    into definition;

  optimized := replace(
    definition,
    'WITH base AS (',
    'WITH base AS NOT MATERIALIZED ('
  );
  if optimized = definition then
    optimized := replace(
      definition,
      'with base as (',
      'with base as not materialized ('
    );
  end if;

  if optimized = definition then
    raise exception 'Expected inventory quality rollup CTE was not found';
  end if;
  if position('base as not materialized' in lower(optimized)) = 0 then
    raise exception 'Inventory quality rollup optimization was not applied';
  end if;

  execute optimized;
end;
$patch$;

comment on function public.inventory_quality_rollup_v1() is
  'Service-only, single-scan inventory audit with non-materialized column-pruned scans.';

commit;
