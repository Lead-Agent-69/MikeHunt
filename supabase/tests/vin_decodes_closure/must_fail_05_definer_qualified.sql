CREATE FUNCTION public.f() RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $q$ SELECT count(*) FROM public.vin_decodes $q$; GRANT EXECUTE ON FUNCTION public.f() TO anon;
