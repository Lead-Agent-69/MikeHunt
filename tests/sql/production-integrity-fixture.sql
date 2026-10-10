CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.deals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_url text, active boolean DEFAULT true,
  source text, source_deal_id text, ask_price integer, updated_at timestamptz DEFAULT now(), options jsonb,
  vin text, make text, model text, year integer, created_at timestamptz DEFAULT now(),
  duplicate_of_id bigint, duplicate_confidence numeric,
  profit_score smallint, true_net_profit numeric, deal_verdict text,
  recommended_max_bid numeric, sell_estimate numeric, deal_analysis jsonb, embedding text
);
CREATE TABLE public.sold_listings (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source_url text, sold_at timestamptz);
CREATE TABLE public.price_history (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, deal_id bigint, price integer, observed_at timestamptz);
CREATE TABLE public.scraper_runs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, source text, status text, deals_found integer, started_at timestamptz);
CREATE POLICY base_deals_read ON public.deals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY base_sold_read ON public.sold_listings FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.deals, public.sold_listings TO anon, authenticated;
INSERT INTO public.deals (source_url, active) VALUES ('https://legacy.example/car', true);
CREATE FUNCTION public.landing_proof() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS $$ SELECT count(*) FROM public.deals $$;
CREATE FUNCTION public.match_deals() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT count(deals.id) FROM public.deals WHERE deals.id > 0
$$;
