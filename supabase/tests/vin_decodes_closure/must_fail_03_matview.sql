CREATE MATERIALIZED VIEW public.mv AS SELECT vin FROM public.vin_decodes; GRANT SELECT ON public.mv TO anon;
