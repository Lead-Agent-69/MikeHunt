CREATE TABLE public.deals_t (vin text); GRANT SELECT ON public.deals_t TO anon; CREATE RULE r AS ON INSERT TO public.deals_t DO ALSO INSERT INTO public.vin_decodes(vin) VALUES (NEW.vin);
