CREATE VIEW public.v1 AS SELECT vin, make FROM public.vin_decodes; REVOKE ALL ON public.v1 FROM PUBLIC, anon, authenticated; GRANT SELECT (vin) ON public.v1 TO anon;
