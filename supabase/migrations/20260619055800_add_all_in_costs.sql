-- Add all-in cost columns for Phase 1
alter table public.listings add column if not exists estimated_transport_cost integer default 0;
alter table public.listings add column if not exists estimated_repair_cost integer default 0;
alter table public.listings add column if not exists true_net_profit integer default 0;
