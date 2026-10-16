begin;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.deals(id) on delete set null,
  category text not null check (category in ('price', 'photos', 'vehicle', 'estimate', 'usability', 'other')),
  comment text not null check (char_length(btrim(comment)) between 1 and 2000 and octet_length(comment) <= 8000),
  created_at timestamptz not null default now()
);

create index feedback_user_created_idx on public.feedback (user_id, created_at desc);
create index feedback_listing_idx on public.feedback (listing_id) where listing_id is not null;
alter table public.feedback enable row level security;
revoke all on public.feedback from public, anon, authenticated, service_role;
grant select on public.feedback to authenticated, service_role;
grant insert (id, user_id, listing_id, category, comment) on public.feedback to authenticated;

create policy feedback_read_own on public.feedback for select to authenticated
  using ((select auth.uid()) = user_id);
create policy feedback_insert_own on public.feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);

create function public.limit_listing_feedback() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'Feedback owner mismatch' using errcode = '42501';
  end if;
  -- Serialize this owner's submissions so concurrent requests cannot evade the daily cap.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 86420));
  if exists (select 1 from public.feedback where id = new.id and user_id = new.user_id) then
    return new;
  end if;
  if (select count(*) from public.feedback where user_id = new.user_id
      and created_at >= now() - interval '1 day') >= 20 then
    raise exception 'Daily feedback limit reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_listing_feedback() from public, anon, authenticated, service_role;
grant execute on function public.limit_listing_feedback() to authenticated;
create trigger feedback_daily_limit before insert on public.feedback
  for each row execute function public.limit_listing_feedback();

comment on table public.feedback is 'Owner-scoped listing reports. No screenshots, credentials, telemetry or automatic listing deletion. Reports survive listing removal with a null listing_id.';

commit;
