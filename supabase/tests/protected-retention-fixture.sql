-- Disposable database fixture for locking tests, never a hosted migration.
-- The real local schema is tested separately inside BEGIN/ROLLBACK.
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users, email text);
CREATE TABLE public.deals(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text, source_deal_id text,
  source_url text, title text, year integer, make text, model text, condition text,
  ask_price numeric, active boolean, last_seen_at timestamptz, vin text,
  UNIQUE(source, source_deal_id)
);
CREATE TABLE public.saved_cars(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users,
  deal_id uuid REFERENCES public.deals ON DELETE SET NULL, snapshot jsonb
);
CREATE TABLE public.watchlist(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users,
  deal_id uuid REFERENCES public.deals ON DELETE CASCADE
);
CREATE TABLE public.inventory(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dealer_id uuid REFERENCES auth.users,
  deal_id uuid REFERENCES public.deals ON DELETE SET NULL, vin text,
  year integer, make text, model text
);
CREATE TABLE public.deal_outcomes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users,
  deal_id uuid REFERENCES public.deals ON DELETE SET NULL, purchase_price numeric
);
CREATE TABLE public.dealer_deals(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users,
  deal_id uuid REFERENCES public.deals ON DELETE SET NULL
);
CREATE TABLE public.alert_matches(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deal_id uuid REFERENCES public.deals
);
CREATE TABLE public.source_url_cache(url_hash text PRIMARY KEY, url text NOT NULL, expires_at timestamptz);

-- Record-only scheduler fixture: no daemon and no scheduled job execution here.
CREATE SCHEMA cron;
CREATE TABLE cron.job(
  jobid bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jobname text, schedule text, command text, active boolean DEFAULT true
);
CREATE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS $$
  DELETE FROM cron.job WHERE jobid=$1 RETURNING true;
$$;
CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job(jobname,schedule,command) VALUES($1,$2,$3) RETURNING jobid;
$$;
CREATE FUNCTION cron.alter_job(job_id bigint, active boolean) RETURNS void LANGUAGE sql AS $$
  UPDATE cron.job SET active = $2 WHERE jobid = $1;
$$;
INSERT INTO cron.job(jobname,schedule,command) VALUES
  ('cleanup-dead-deals','0 2 * * *','DELETE FROM public.deals'),
  ('cleanup-expired-deals','0 2 * * *','DELETE FROM public.deals');
GRANT SELECT, UPDATE, DELETE ON public.deals TO service_role;
GRANT SELECT ON public.saved_cars,public.watchlist,public.inventory,
  public.deal_outcomes,public.dealer_deals,public.alert_matches TO service_role;
