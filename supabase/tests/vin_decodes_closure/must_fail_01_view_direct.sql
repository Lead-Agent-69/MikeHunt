CREATE VIEW public.v1 AS SELECT vin FROM public.vin_decodes; GRANT SELECT ON public.v1 TO anon;
