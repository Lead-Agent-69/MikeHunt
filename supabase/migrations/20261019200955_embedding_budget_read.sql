begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- The daily allowance includes inactive rows because provider quota was spent
-- when they were embedded. Keep the index small by storing only stamped rows.
create index if not exists deals_embedding_budget_idx
  on public.deals (embedded_at)
  where embedding_source_hash is not null;

create or replace function public.embedding_budget_used_since(
  p_since timestamptz
)
returns bigint
language sql
stable
security invoker
set search_path = ''
returns null on null input
as $$
  select count(*)::bigint
  from public.deals d
  where d.embedding_source_hash is not null
    and d.embedded_at >= p_since;
$$;

comment on function public.embedding_budget_used_since(timestamptz) is
  'Service-only quota ledger count. Includes active and inactive hash-stamped deals.';

revoke all on function public.embedding_budget_used_since(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.embedding_budget_used_since(timestamptz)
  to service_role;

notify pgrst, 'reload schema';
commit;
