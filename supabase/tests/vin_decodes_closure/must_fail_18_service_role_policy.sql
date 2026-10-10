CREATE POLICY svc ON public.vin_decodes FOR ALL TO service_role USING (true);
