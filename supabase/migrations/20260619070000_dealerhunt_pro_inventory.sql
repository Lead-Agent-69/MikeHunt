-- DealerHunt Pro: inventory, transport, recon, and lead tables
-- plus profile extension for paying dealer defaults.

-- Extend existing profiles with dealer-specific fields from the Pro spec
alter table public.profiles
  add column if not exists license_number text,
  add column if not exists state text,
  add column if not exists city text,
  add column if not exists stripe_subscription_id text,
  add column if not exists daily_floor_rate numeric default 35.00,
  add column if not exists default_auction_fee numeric default 450.00,
  add column if not exists default_recon numeric default 500.00,
  add column if not exists target_profit numeric default 3500.00;

-- Plan enum already exists as user_plan. Ensure it covers the spec names.
-- Existing values: scout, dealer_pro, dealer_elite, api
-- The spec uses scout, pro, elite. dealer_pro maps to pro; dealer_elite maps to elite.

-- INVENTORY: units a dealer has purchased
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.listings(id),
  vin TEXT NOT NULL,
  year INT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  color TEXT,
  odometer INT,
  condition TEXT DEFAULT 'good',
  description TEXT,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  auction_fee NUMERIC DEFAULT 0,
  transport_cost NUMERIC DEFAULT 0,
  repair_cost NUMERIC DEFAULT 0,
  recon_cost NUMERIC DEFAULT 0,
  title_fee NUMERIC DEFAULT 0,
  holding_cost NUMERIC DEFAULT 0,
  other_costs NUMERIC DEFAULT 0,
  total_cost NUMERIC GENERATED ALWAYS AS (
    purchase_price + auction_fee + transport_cost + repair_cost + recon_cost + title_fee + holding_cost + other_costs
  ) STORED,
  list_price NUMERIC,
  market_value NUMERIC,
  stage TEXT DEFAULT 'acquired' CHECK (
    stage IN ('acquired','recon','transport','listed','offer','sold','wholesale')
  ),
  floor_date TIMESTAMPTZ DEFAULT NOW(),
  daily_floor_rate NUMERIC DEFAULT 35.00,
  sold_date TIMESTAMPTZ,
  sold_price NUMERIC,
  photos TEXT[] DEFAULT '{}',
  listed_platforms TEXT[] DEFAULT '{}',
  lead_count INT DEFAULT 0,
  purchased_from TEXT,
  purchased_city TEXT,
  purchased_state TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_dealer_stage_idx ON public.inventory(dealer_id, stage);
CREATE INDEX IF NOT EXISTS inventory_dealer_floor_date_idx ON public.inventory(dealer_id, floor_date);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_inventory" ON public.inventory
  FOR ALL USING (dealer_id = auth.uid());

-- TRANSPORTS: vehicle bookings
CREATE TABLE IF NOT EXISTS public.transports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
  dealer_id UUID REFERENCES public.profiles(id),
  carrier TEXT,
  from_zip TEXT,
  to_zip TEXT,
  from_state TEXT,
  to_state TEXT,
  miles INT,
  trailer_type TEXT DEFAULT 'open' CHECK (trailer_type IN ('open','enclosed')),
  quoted_price NUMERIC,
  booked_price NUMERIC,
  pickup_date DATE,
  estimated_delivery DATE,
  actual_delivery DATE,
  status TEXT DEFAULT 'quoted' CHECK (
    status IN ('quoted','booked','picked_up','in_transit','delivered','cancelled')
  ),
  carrier_contact TEXT,
  tracking_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.transports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_transports" ON public.transports
  FOR ALL USING (dealer_id = auth.uid());

-- RECON STAGES
CREATE TABLE IF NOT EXISTS public.recon_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
  dealer_id UUID REFERENCES public.profiles(id),
  stage TEXT NOT NULL,
  shop_name TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  estimated_completion TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  estimated_cost NUMERIC,
  actual_cost NUMERIC,
  notes TEXT
);

ALTER TABLE public.recon_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_recon" ON public.recon_stages
  FOR ALL USING (dealer_id = auth.uid());

-- LEADS: private seller outreach
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  vehicle TEXT NOT NULL,
  source TEXT NOT NULL,
  listing_url TEXT,
  ask_price NUMERIC,
  market_value NUMERIC,
  estimated_margin NUMERIC,
  seller_phone TEXT,
  seller_email TEXT,
  days_listed INT DEFAULT 0,
  outreach_status TEXT DEFAULT 'pending' CHECK (
    outreach_status IN ('pending','sent','replied','offer_made','purchased','dead')
  ),
  outreach_message TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_dealer_status_idx ON public.leads(dealer_id, outreach_status);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_leads" ON public.leads
  FOR ALL USING (dealer_id = auth.uid());

-- Alert matches: bridge between alerts and listings
CREATE TABLE IF NOT EXISTS public.alert_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES public.alerts(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id),
  dealer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  profit_estimate NUMERIC,
  notified BOOLEAN DEFAULT FALSE,
  viewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alert_matches_dealer_notified_idx ON public.alert_matches(dealer_id, notified);

ALTER TABLE public.alert_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_matches" ON public.alert_matches
  FOR ALL USING (dealer_id = auth.uid());

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_updated_at ON public.inventory;
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS leads_updated_at ON public.leads;
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.recon_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alert_matches;
