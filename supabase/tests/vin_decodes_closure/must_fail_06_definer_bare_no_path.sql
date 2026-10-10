CREATE FUNCTION public.f() RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $q$ BEGIN RETURN (SELECT count(*) FROM vin_decodes); END $q$;
