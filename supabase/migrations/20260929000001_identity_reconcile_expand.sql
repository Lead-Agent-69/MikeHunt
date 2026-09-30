-- Identity reconciliation, phase 1 (EXPAND) — finishes what 20260928000000 started.
--
-- Reality on the ground: the app reads/writes `user_profiles` everywhere
-- (/api/profile, /api/auth/provision, discover, arbitrage, billing, admin stats…),
-- while FK targets still point at the older `profiles` table. 20260928000000 only
-- added columns and left the actual reconciliation commented out.
--
-- This migration makes the two tables consistent WITHOUT touching app code:
--   * backfill: every user_profiles row gets a minimal profiles row,
--   * a trigger keeps profiles auto-provisioned on every new signup,
-- so FK inserts against profiles stop failing for new users.
--
-- Phase 2 (CONTRACT, deliberately NOT done here — needs a data audit + coordinated
-- code change across 15+ call sites): pick one canonical table, repoint code/FKs,
-- drop the other. Tracked in STATUS.md.

DO $$
BEGIN
  IF to_regclass('public.user_profiles') IS NULL THEN
    RETURN;  -- fresh setups may only have profiles; nothing to reconcile
  END IF;

  -- 1) Backfill: minimal mirror row per existing user_profiles/user.
  INSERT INTO public.profiles (id, email, full_name)
  SELECT up.id, u.email, up.name
  FROM public.user_profiles up
  JOIN auth.users u ON u.id = up.id
  ON CONFLICT (id) DO UPDATE
  SET full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name);

  -- 2) Mirror on insert: keep profiles provisioned for every new signup.
  CREATE OR REPLACE FUNCTION public.mirror_user_profile_to_profiles()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $function$
  BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    SELECT NEW.id, u.email, NEW.name
    FROM auth.users u WHERE u.id = NEW.id
    ON CONFLICT (id) DO UPDATE
      SET full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name);
    RETURN NEW;
  END $function$;

  DROP TRIGGER IF EXISTS trg_mirror_user_profile_to_profiles ON public.user_profiles;
  CREATE TRIGGER trg_mirror_user_profile_to_profiles
    AFTER INSERT ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.mirror_user_profile_to_profiles();

  COMMENT ON TABLE public.profiles IS
    'FK-target identity table; auto-provisioned from user_profiles (reconciliation phase 1)';
END $$;
