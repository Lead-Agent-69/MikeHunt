create table if not exists public.user_roles (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    role text not null default 'user',
    created_at timestamp with time zone default now(),
    unique (user_id, role)
);

alter table public.user_roles enable row level security;

create policy "Users can read own roles" on public.user_roles
    for select to authenticated
    using (user_id = auth.uid());
