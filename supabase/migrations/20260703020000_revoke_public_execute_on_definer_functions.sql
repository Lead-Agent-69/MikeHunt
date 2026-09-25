-- Close the anon/authenticated exposure on SECURITY DEFINER functions that are only invoked by the
-- service-role harvest (no app rpc calls). service_role retains access. Applied to prod 2026-07-02.
revoke execute on function public.mark_deals_unseen(text, text[]) from anon, authenticated;
revoke execute on function public.rls_auto_enable() from anon, authenticated;
