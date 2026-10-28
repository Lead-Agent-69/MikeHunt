-- Aggregate diagnostics only. This does not enable cleanup or expose vehicle/user rows.
CREATE OR REPLACE FUNCTION public.inventory_capacity_report()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'checkedAt', now(),
    'databaseBytes', pg_database_size(current_database()),
    'relations', (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM (
      SELECT n.nspname AS schema_name, c.relname AS table_name,
        pg_total_relation_size(c.oid) AS total_bytes,
        pg_table_size(c.oid) AS table_bytes,
        pg_indexes_size(c.oid) AS index_bytes,
        coalesce(s.n_live_tup,0) AS estimated_live_rows,
        coalesce(s.n_dead_tup,0) AS estimated_dead_rows
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_stat_all_tables s ON s.relid=c.oid
      WHERE c.relkind='r' AND n.nspname IN ('public','auth','storage')
      ORDER BY pg_total_relation_size(c.oid) DESC, n.nspname, c.relname LIMIT 20
    ) r),
    'inventory', (SELECT jsonb_build_object(
      'total',count(*),'active',count(*) FILTER (WHERE active),
      'unseen30Days',count(*) FILTER (WHERE last_seen_at < now()-interval '30 days'),
      'unseen7Days',count(*) FILTER (WHERE last_seen_at < now()-interval '7 days')
    ) FROM public.deals),
    'archive',jsonb_build_object('policyDays',30,'actionsEnabled',false,
      'eligibilityAssessed',false)
  );
$$;
REVOKE ALL ON FUNCTION public.inventory_capacity_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_capacity_report() TO service_role;
COMMENT ON FUNCTION public.inventory_capacity_report() IS
  'Service-only aggregate storage and age assessment. Unseen rows are not archive eligibility; no mutations or cleanup activation.';
