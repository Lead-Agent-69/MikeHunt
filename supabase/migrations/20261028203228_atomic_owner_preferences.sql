-- Called only after the application authenticates the owner. Public clients retain RLS access,
-- but cannot use this service operation to choose another account's identity.
CREATE OR REPLACE FUNCTION public.compare_and_set_user_preferences(
  p_user_id uuid, p_expected_prefs jsonb, p_next_prefs jsonb
)
RETURNS TABLE(user_id uuid, prefs jsonb, updated_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '5s' AS $$
BEGIN
  IF p_user_id IS NULL OR jsonb_typeof(p_next_prefs) IS DISTINCT FROM 'object'
    OR (p_expected_prefs IS NOT NULL AND jsonb_typeof(p_expected_prefs) <> 'object') THEN
    RAISE EXCEPTION 'Invalid preference operation' USING ERRCODE = '22023';
  END IF;
  IF p_expected_prefs IS NULL THEN
    RETURN QUERY INSERT INTO public.user_preferences AS target(user_id,prefs,updated_at)
      VALUES(p_user_id,p_next_prefs,now()) ON CONFLICT DO NOTHING
      RETURNING target.user_id,target.prefs,target.updated_at;
  ELSE
    RETURN QUERY UPDATE public.user_preferences AS target
      SET prefs=p_next_prefs,updated_at=now()
      WHERE target.user_id=p_user_id AND target.prefs=p_expected_prefs
      RETURNING target.user_id,target.prefs,target.updated_at;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.compare_and_set_user_preferences(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compare_and_set_user_preferences(uuid,jsonb,jsonb) TO service_role;
COMMENT ON FUNCTION public.compare_and_set_user_preferences(uuid,jsonb,jsonb) IS
  'Service-only owner-scoped optimistic write. Empty result means conflict; re-read and reapply the original partial patch. No queue side effects.';
