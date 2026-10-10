-- Minimal Supabase-compatible shell for LOCAL testing only (roles, auth, storage, cron, pgvector/postgis stand-ins).
CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS cube; CREATE EXTENSION IF NOT EXISTS earthdistance; CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN NOINHERIT; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticator') THEN CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'authpw'; END IF;
END $$;
GRANT anon, authenticated, service_role TO authenticator;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS storage; CREATE SCHEMA IF NOT EXISTS cron;
GRANT USAGE ON SCHEMA auth, storage, extensions TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), aud text DEFAULT 'authenticated', role text DEFAULT 'authenticated',
  email text UNIQUE, encrypted_password text, email_confirmed_at timestamptz DEFAULT now(),
  raw_app_meta_data jsonb DEFAULT '{}', raw_user_meta_data jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), last_sign_in_at timestamptz, phone text, is_anonymous boolean DEFAULT false);
GRANT SELECT ON auth.users TO service_role;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt()->>'sub', '')::uuid $$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'role' $$;
CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt()->>'email' $$;
CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, owner uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid,
  metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
CREATE TABLE IF NOT EXISTS cron.job (jobid bigserial PRIMARY KEY, jobname text UNIQUE, schedule text, command text, active boolean DEFAULT true);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, sched text, cmd text) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO cron.job (jobname, schedule, command) VALUES (job_name, sched, cmd)
  ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule, command = excluded.command RETURNING jobid $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text) RETURNS boolean LANGUAGE sql AS $$
  WITH d AS (DELETE FROM cron.job WHERE jobname = job_name RETURNING 1) SELECT count(*) > 0 FROM d $$;
-- pgvector stand-in: vector(n) is rewritten to float8[] by the loader; <=> = cosine distance.
CREATE OR REPLACE FUNCTION public._cosdist(a float8[], b float8[]) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$
  SELECT 1 - (SELECT sum(x*y) FROM unnest(a, b) t(x, y)) / nullif(sqrt((SELECT sum(x*x) FROM unnest(a) x)) * sqrt((SELECT sum(y*y) FROM unnest(b) y)), 0) $$;
DO $$ BEGIN CREATE OPERATOR <=> (LEFTARG = float8[], RIGHTARG = float8[], FUNCTION = public._cosdist); EXCEPTION WHEN duplicate_function THEN NULL; END $$;
-- postgis stand-ins: geography -> text
CREATE OR REPLACE FUNCTION public.st_makepoint(x float8, y float8) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'POINT(' || x || ' ' || y || ')' $$;
CREATE OR REPLACE FUNCTION public.st_setsrid(g text, srid int) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT g $$;
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Exists on hosted Supabase projects (event-trigger helper); stub so the hardening migration applies.
CREATE OR REPLACE FUNCTION public.rls_auto_enable() RETURNS void LANGUAGE sql AS $$ SELECT $$;
DO $$ BEGIN CREATE DOMAIN public.geography AS text; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE OR REPLACE FUNCTION public.st_dwithin(a text, b text, d float8) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.st_distance(a text, b text) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$ SELECT 0::float8 $$;
CREATE TABLE IF NOT EXISTS public.spatial_ref_sys (srid int primary key);
