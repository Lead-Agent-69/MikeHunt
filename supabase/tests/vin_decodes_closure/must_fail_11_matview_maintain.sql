CREATE MATERIALIZED VIEW public.mv AS SELECT vin FROM public.vin_decodes; REVOKE ALL ON public.mv FROM PUBLIC, anon, authenticated; GRANT MAINTAIN ON public.mv TO authenticated;
