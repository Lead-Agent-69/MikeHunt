-- Per-state active inventory counts for the "My States" picker. Whitelisted branches (no dynamic SQL) so
-- the p_table/p_col args can't be used for injection. SECURITY DEFINER so anon can read aggregate counts.
-- Applied to prod via MCP on 2026-07-07; committed here for a fresh rebuild.
CREATE OR REPLACE FUNCTION public.count_by_state(p_table text, p_col text)
RETURNS TABLE(state text, n bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_table = 'deals' AND p_col = 'location_state' THEN
    RETURN QUERY
      SELECT d.location_state::text, count(*)::bigint
      FROM public.deals d WHERE d.active AND d.location_state IS NOT NULL
      GROUP BY d.location_state;
  ELSIF p_table = 'properties' AND p_col = 'state' THEN
    RETURN QUERY
      SELECT p.state::text, count(*)::bigint
      FROM public.properties p WHERE p.active AND p.state IS NOT NULL
      GROUP BY p.state;
  ELSE
    RETURN;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_by_state(text, text) TO anon, authenticated;