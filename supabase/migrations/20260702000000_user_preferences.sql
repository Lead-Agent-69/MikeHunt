-- user_preferences — one row per user holding their cross-app view preferences (default state to view,
-- default filters, preferred landing vertical, units). JSONB `prefs` so new preferences never need a
-- migration. Shared by HomeIQ (housing) and DealerHunt (cars). RLS: a user only ever sees/writes their own.

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

do $$ begin
  create policy "own_prefs_select" on public.user_preferences
    for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own_prefs_insert" on public.user_preferences
    for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own_prefs_update" on public.user_preferences
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
