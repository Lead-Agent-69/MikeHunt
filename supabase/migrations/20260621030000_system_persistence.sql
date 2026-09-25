-- Create parts_estimates table
CREATE TABLE IF NOT EXISTS public.parts_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
  vehicle_name TEXT,
  total_estimate NUMERIC NOT NULL DEFAULT 0,
  parts_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parts_estimates_dealer ON public.parts_estimates(dealer_id);

ALTER TABLE public.parts_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_parts_estimates" ON public.parts_estimates FOR ALL USING (dealer_id = auth.uid());

-- Create finance_lenders table
CREATE TABLE IF NOT EXISTS public.finance_lenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  monthly_rate NUMERIC NOT NULL,
  setup_fee NUMERIC DEFAULT 0,
  advance_percentage NUMERIC DEFAULT 100,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_lenders_dealer ON public.finance_lenders(dealer_id);

ALTER TABLE public.finance_lenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_finance_lenders" ON public.finance_lenders FOR ALL USING (dealer_id = auth.uid());

-- Create transports_routes table
CREATE TABLE IF NOT EXISTS public.transport_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dispatcher_name TEXT NOT NULL,
  dispatcher_phone TEXT,
  route_name TEXT,
  typical_cost NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_transport_routes" ON public.transport_routes FOR ALL USING (dealer_id = auth.uid());
