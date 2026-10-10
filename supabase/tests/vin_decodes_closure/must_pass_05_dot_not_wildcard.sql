CREATE VIEW public."v.d" AS SELECT vin FROM public.vin_decodes; REVOKE ALL ON public."v.d" FROM PUBLIC, anon, authenticated; CREATE TABLE public.vxd (vin text); GRANT SELECT ON public.vxd TO anon;
