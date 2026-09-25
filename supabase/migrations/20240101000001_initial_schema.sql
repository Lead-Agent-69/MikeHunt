-- ============================================================
--  DealerHunt — Supabase / PostgreSQL Schema
--  Run: supabase db push
-- ============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";     -- fuzzy search
create extension if not exists "postgis";      -- geo queries

-- ─── ENUM TYPES ─────────────────────────────────────────────
create type dealer_type as enum (
  'auction_reseller','salvage_rebuild','wholesale_reseller',
  'independent','repo_fleet','parts_only'
);
create type listing_source as enum (
  'copart','iaa','adesa','manheim','facebook_marketplace',
  'craigslist','ebay_motors','autotrader','cars_com',
  'gov_auction','repo_network','independent_dealer','cargurus'
);
create type listing_condition as enum (
  'run_drive','repairable','parts_only','clean_title',
  'rebuilt_title','salvage_title','flood','fire','hail'
);
create type scraper_status as enum (
  'idle','running','success','error','rate_limited'
);
create type user_plan as enum (
  'scout','dealer_pro','dealer_elite','api'
);
create type alert_type as enum (
  'price_drop','new_listing','auction_ending','dealer_update'
);

-- ─── USER PROFILES ──────────────────────────────────────────
create table public.profiles (
  id                  uuid references auth.users(id) on delete cascade primary key,
  email               text not null,
  full_name           text,
  phone               text,
  plan                user_plan not null default 'scout',
  preferred_states    text[],
  preferred_types     dealer_type[],
  min_profit_target   integer default 2000,
  price_range_min     integer default 1000,
  price_range_max     integer default 30000,
  stripe_customer_id  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Users view own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

-- ─── DEALERS ────────────────────────────────────────────────
create table public.dealers (
  id                    uuid primary key default uuid_generate_v4(),
  name                  text not null,
  slug                  text unique not null,
  type                  dealer_type not null,
  website               text,
  phone                 text,
  email                 text,
  address               text,
  city                  text not null,
  state                 char(2) not null,
  zip                   text,
  lat                   double precision not null,
  lng                   double precision not null,
  location              geography(point, 4326),   -- for PostGIS radius queries
  active_listings       integer default 0,
  avg_ask_price         integer,
  avg_mmr_value         integer,
  avg_profit_estimate   integer,
  deal_score            smallint default 50,
  source_url            text,
  last_scraped_at       timestamptz,
  verified              boolean default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Auto-update PostGIS point from lat/lng
create or replace function update_dealer_location()
returns trigger language plpgsql as $$
begin
  new.location = st_makepoint(new.lng, new.lat)::geography;
  return new;
end;
$$;
create trigger dealer_location_trigger
  before insert or update on public.dealers
  for each row execute function update_dealer_location();

-- Indexes
create index dealers_state_idx  on public.dealers(state);
create index dealers_type_idx   on public.dealers(type);
create index dealers_score_idx  on public.dealers(deal_score desc);
create index dealers_geo_idx    on public.dealers using gist(location);
create index dealers_name_trgm  on public.dealers using gin(name gin_trgm_ops);

-- RLS
alter table public.dealers enable row level security;
create policy "Anyone can view dealers" on public.dealers for select to anon, authenticated using (true);

-- ─── LISTINGS ───────────────────────────────────────────────
create table public.listings (
  id                  uuid primary key default uuid_generate_v4(),
  dealer_id           uuid references public.dealers(id) on delete set null,
  source              listing_source not null,
  source_listing_id   text not null,
  source_url          text not null,
  title               text not null,
  year                smallint not null,
  make                text not null,
  model               text not null,
  trim                text,
  vin                 text,
  mileage             integer,
  condition           listing_condition not null,
  color               text,
  body_style          text,
  fuel_type           text,
  transmission        text,
  drivetrain          text,
  engine              text,
  damage_type         text,
  keys_present        boolean,
  run_drive           boolean,
  ask_price           integer not null,
  buy_now_price       integer,
  auction_end_at      timestamptz,
  mmr_value           integer,
  kbb_trade_in        integer,
  kbb_retail          integer,
  cargurus_price      integer,
  profit_estimate     integer generated always as (coalesce(mmr_value, 0) - ask_price) stored,
  profit_score        smallint,
  images              text[] default '{}',
  location_city       text,
  location_state      char(2),
  location_zip        text,
  lat                 double precision,
  lng                 double precision,
  location            geography(point, 4326),
  active              boolean default true,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (source, source_listing_id)
);

-- Price history (timeseries via separate table — fast inserts)
create table public.price_history (
  id          bigserial primary key,
  listing_id  uuid not null references public.listings(id) on delete cascade,
  price       integer not null,
  observed_at timestamptz not null default now()
);
create index price_history_listing_idx on public.price_history(listing_id, observed_at desc);

-- Listing indexes
create index listings_source_idx    on public.listings(source);
create index listings_state_idx     on public.listings(location_state);
create index listings_make_idx      on public.listings(make);
create index listings_profit_idx    on public.listings(profit_estimate desc) where active = true;
create index listings_score_idx     on public.listings(profit_score desc) where active = true;
create index listings_end_idx       on public.listings(auction_end_at) where auction_end_at is not null;
create index listings_geo_idx       on public.listings using gist(location);
create index listings_title_trgm    on public.listings using gin(title gin_trgm_ops);
create index listings_vin_idx       on public.listings(vin) where vin is not null;

alter table public.listings enable row level security;
create policy "Anyone can view active listings" on public.listings
  for select to anon, authenticated using (active = true);

-- ─── WATCHLIST ──────────────────────────────────────────────
create table public.watchlist (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  listing_id        uuid not null references public.listings(id) on delete cascade,
  alert_threshold   integer,
  notes             text,
  created_at        timestamptz not null default now(),
  unique(user_id, listing_id)
);
alter table public.watchlist enable row level security;
create policy "Users manage own watchlist" on public.watchlist
  for all using (auth.uid() = user_id);

-- ─── ALERTS ─────────────────────────────────────────────────
create table public.alerts (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  name                text not null,
  type                alert_type not null,
  channels            text[] not null default '{email}',
  filters             jsonb not null default '{}',
  active              boolean default true,
  last_triggered_at   timestamptz,
  trigger_count       integer default 0,
  created_at          timestamptz not null default now()
);
alter table public.alerts enable row level security;
create policy "Users manage own alerts" on public.alerts
  for all using (auth.uid() = user_id);

-- ─── SCRAPER RUNS ───────────────────────────────────────────
create table public.scraper_runs (
  id                  uuid primary key default uuid_generate_v4(),
  source              listing_source not null,
  status              scraper_status not null default 'idle',
  listings_found      integer default 0,
  listings_new        integer default 0,
  listings_updated    integer default 0,
  error_message       text,
  started_at          timestamptz not null default now(),
  completed_at        timestamptz,
  duration_ms         integer
);
create index scraper_runs_source_idx on public.scraper_runs(source, started_at desc);

-- ─── USEFUL VIEWS ───────────────────────────────────────────
create or replace view public.top_deals as
  select
    l.*,
    d.name as dealer_name,
    d.type as dealer_type,
    d.deal_score as dealer_score,
    (l.profit_estimate::float / nullif(l.ask_price, 0) * 100)::int as roi_pct
  from public.listings l
  left join public.dealers d on l.dealer_id = d.id
  where l.active = true
    and l.profit_estimate > 2000
  order by l.profit_score desc, l.profit_estimate desc;

-- ─── FUNCTIONS ──────────────────────────────────────────────
-- Dealers within radius (miles)
create or replace function dealers_near(
  user_lat double precision,
  user_lng double precision,
  radius_miles integer default 200
)
returns setof public.dealers
language sql stable as $$
  select * from public.dealers
  where st_dwithin(
    location,
    st_makepoint(user_lng, user_lat)::geography,
    radius_miles * 1609.34
  )
  order by
    st_distance(location, st_makepoint(user_lng, user_lat)::geography);
$$;

-- Full-text listing search
create or replace function search_listings(query text)
returns setof public.listings
language sql stable as $$
  select * from public.listings
  where active = true
    and (
      title ilike '%' || query || '%'
      or make ilike '%' || query || '%'
      or model ilike '%' || query || '%'
      or vin = upper(query)
    )
  order by profit_score desc nulls last
  limit 100;
$$;

-- ─── REALTIME ───────────────────────────────────────────────
-- Enable realtime for price drops and new listings
alter publication supabase_realtime add table public.listings;
alter publication supabase_realtime add table public.price_history;
