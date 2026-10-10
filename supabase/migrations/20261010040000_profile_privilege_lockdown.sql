-- security(db): profile privilege lockdown + Ren's #201 nits.
--
-- P1 privilege escalation: user_profiles.own_profile was FOR ALL USING (id = auth.uid()) with no
-- WITH CHECK, and authenticated held table-wide INSERT/UPDATE. A signed-in user could PATCH
-- /rest/v1/user_profiles?id=eq.<self> and set role='admin', plan, plan dates and stripe_* ids.
-- public.profiles had the same shape (plan, stripe_*).
--
-- App audit: every write to user_profiles goes through the service-role server client
-- (/api/profile, /api/preferences via sync-home-state, /api/billing/webhook, account-bootstrap).
-- No 'use client' file writes either table, and nothing in the app writes public.profiles at all
-- (it is filled by the SECURITY DEFINER mirror trigger). Hosted check on 2026-10-09: 6 rows, all
-- role='user' and plan='free'; user_roles is empty; nobody had escalated.
--
-- Fix, in layers:
--   1) Client roles lose INSERT/DELETE and table-wide UPDATE; authenticated gets column-level
--      UPDATE on self-service preference columns only.
--   2) Own-row policies get an explicit WITH CHECK, so a row can't be moved to another id.
--   3) A BEFORE INSERT/UPDATE trigger rejects protected-column changes from anon/authenticated
--      even if a future migration broadens the grants. service_role/postgres are unaffected.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- user_profiles
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON public.user_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.user_profiles FROM authenticated;
GRANT UPDATE (
  name, user_type, home_state, home_zip, home_lat, home_lng,
  budget_min, budget_max, preferred_makes, preferred_body_styles, max_odometer,
  auction_fee_default, recon_cost_default, daily_floor_rate, target_profit,
  notify_price_drops, onboarded
) ON public.user_profiles TO authenticated;

DROP POLICY IF EXISTS "own_profile" ON public.user_profiles;
CREATE POLICY "own_profile" ON public.user_profiles
  AS PERMISSIVE FOR ALL TO public
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE OR REPLACE FUNCTION public.guard_user_profiles_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.role, 'user') <> 'user'
       OR coalesce(NEW.plan, 'free') <> 'free'
       OR NEW.plan_started_at IS NOT NULL OR NEW.plan_ended_at IS NOT NULL
       OR NEW.stripe_customer_id IS NOT NULL OR NEW.stripe_subscription_id IS NOT NULL THEN
      RAISE EXCEPTION 'user_profiles: role/plan/billing columns are server-managed'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.plan_started_at IS DISTINCT FROM OLD.plan_started_at
     OR NEW.plan_ended_at IS DISTINCT FROM OLD.plan_ended_at
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'user_profiles: role/plan/billing columns are server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.guard_user_profiles_protected_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_user_profiles_protected ON public.user_profiles;
CREATE TRIGGER trg_guard_user_profiles_protected
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_profiles_protected_columns();

-- ---------------------------------------------------------------------------------------------
-- profiles (legacy mirror; same escalation surface on plan / stripe_*)
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name, phone, avatar_url, license_number, state, city, home_lat, home_lng,
  preferred_states, preferred_types, min_profit_target, price_range_min, price_range_max,
  daily_floor_rate, default_auction_fee, default_recon, target_profit, updated_at
) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO public
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE OR REPLACE FUNCTION public.guard_profiles_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT'
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id THEN
    RAISE EXCEPTION 'profiles: id/email/plan/billing columns are server-managed'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION public.guard_profiles_protected_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_profiles_protected ON public.profiles;
CREATE TRIGGER trg_guard_profiles_protected
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_protected_columns();

-- ---------------------------------------------------------------------------------------------
-- Ren nit: admin checks come from user_roles (server-managed), not a user-editable profile column.
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "page_views_admin_read" ON public.page_views;
CREATE POLICY "page_views_admin_read" ON public.page_views
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'admin'
  ));

-- Ren nit: harvest_states lost all client grants in 20261010030000; the USING (true) read policy is dead.
DROP POLICY IF EXISTS "harvest_states_read" ON public.harvest_states;

COMMIT;

NOTIFY pgrst, 'reload schema';
