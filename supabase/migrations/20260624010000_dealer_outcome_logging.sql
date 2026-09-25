-- Dealer Outcome Logging System (THE MOAT)
-- Allows dealers to log what they actually paid/sold for, enabling calibration

-- 1. Dealer Profiles (cost defaults + preferences)
CREATE TABLE IF NOT EXISTS dealer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Business info
  business_name TEXT,
  license_number TEXT,
  home_state TEXT DEFAULT 'TX',
  home_city TEXT,
  home_lat FLOAT8,
  home_lng FLOAT8,
  lot_size INT, -- how many units they typically stock
  
  -- Cost baselines (used as defaults in calculator)
  baseline_transport NUMERIC(10,2) DEFAULT 600,
  baseline_recon NUMERIC(10,2) DEFAULT 800,
  baseline_fees NUMERIC(10,2) DEFAULT 200,
  target_roi NUMERIC(5,3) DEFAULT 0.20, -- 20% target ROI
  
  -- Preferences
  preferred_makes TEXT[], -- e.g. ['Ford', 'Chevrolet']
  min_profit_threshold NUMERIC(10,2) DEFAULT 1500,
  max_buy_price NUMERIC(10,2), -- their buying power limit
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Dealer Deals (outcome logging)
CREATE TABLE IF NOT EXISTS dealer_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL, -- may be null if manual entry
  
  -- Vehicle info (denormalized for when deal_id is null)
  vin TEXT,
  year INT,
  make TEXT,
  model TEXT,
  mileage INT,
  
  -- Purchase
  purchased BOOLEAN DEFAULT FALSE,
  purchase_price NUMERIC(10,2),
  purchase_date DATE,
  purchase_source TEXT, -- 'auction', 'private', 'trade-in', 'wholesale'
  
  -- Sale
  sold BOOLEAN DEFAULT FALSE,
  sell_price NUMERIC(10,2),
  sell_date DATE,
  sell_channel TEXT, -- 'retail', 'wholesale', 'auction', 'trade-in'
  days_to_sell INT,
  
  -- Actual costs (what they really paid)
  actual_transport NUMERIC(10,2),
  actual_recon NUMERIC(10,2),
  actual_fees NUMERIC(10,2), -- doc fees, auction fees, etc.
  actual_holding_cost NUMERIC(10,2), -- floorplan interest, etc.
  
  -- Platform estimates (for comparison)
  platform_est_sell NUMERIC(10,2),
  platform_est_transport NUMERIC(10,2),
  platform_est_recon NUMERIC(10,2),
  platform_est_profit NUMERIC(10,2),
  
  -- Calculated
  actual_all_in_cost NUMERIC(10,2), -- purchase + transport + recon + fees
  actual_profit NUMERIC(10,2), -- sell - all_in_cost
  actual_roi NUMERIC(5,3), -- (profit / all_in_cost)
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Dealer Calibration (learned multipliers)
CREATE TABLE IF NOT EXISTS dealer_calibration (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Learned multipliers (applied to platform estimates)
  transport_multiplier NUMERIC(5,3) DEFAULT 1.0, -- e.g. 1.2 = they pay 20% more than platform estimates
  recon_multiplier NUMERIC(5,3) DEFAULT 1.0,
  
  -- Accuracy metrics
  profit_accuracy_pct NUMERIC(5,2), -- how close platform predictions are to actual
  sell_price_accuracy_pct NUMERIC(5,2),
  
  sample_size INT DEFAULT 0, -- how many outcomes logged
  confidence_score NUMERIC(5,2) DEFAULT 0, -- 0-100, based on sample size and consistency
  
  -- Trend data (last 30 days)
  recent_avg_profit NUMERIC(10,2),
  recent_avg_roi NUMERIC(5,3),
  recent_win_rate NUMERIC(5,2), -- % of deals that were actually profitable
  
  -- Metadata
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dealer_deals_user_id ON dealer_deals(user_id);
CREATE INDEX IF NOT EXISTS idx_dealer_deals_deal_id ON dealer_deals(deal_id);
CREATE INDEX IF NOT EXISTS idx_dealer_deals_purchased ON dealer_deals(purchased) WHERE purchased = true;
CREATE INDEX IF NOT EXISTS idx_dealer_deals_sold ON dealer_deals(sold) WHERE sold = true;
CREATE INDEX IF NOT EXISTS idx_dealer_deals_purchase_date ON dealer_deals(purchase_date DESC NULLS LAST);

-- Trigger to update dealer_profiles.updated_at
CREATE OR REPLACE FUNCTION update_dealer_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dealer_profiles_updated_at
  BEFORE UPDATE ON dealer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_dealer_profiles_updated_at();

-- Trigger to update dealer_deals.updated_at and calculate fields
CREATE OR REPLACE FUNCTION update_dealer_deals_calculated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  
  -- Calculate all-in cost
  IF NEW.purchase_price IS NOT NULL THEN
    NEW.actual_all_in_cost = COALESCE(NEW.purchase_price, 0) 
                            + COALESCE(NEW.actual_transport, 0)
                            + COALESCE(NEW.actual_recon, 0)
                            + COALESCE(NEW.actual_fees, 0)
                            + COALESCE(NEW.actual_holding_cost, 0);
  END IF;
  
  -- Calculate profit and ROI when sold
  IF NEW.sold AND NEW.sell_price IS NOT NULL AND NEW.actual_all_in_cost IS NOT NULL THEN
    NEW.actual_profit = NEW.sell_price - NEW.actual_all_in_cost;
    IF NEW.actual_all_in_cost > 0 THEN
      NEW.actual_roi = NEW.actual_profit / NEW.actual_all_in_cost;
    END IF;
  END IF;
  
  -- Calculate days to sell
  IF NEW.sold AND NEW.sell_date IS NOT NULL AND NEW.purchase_date IS NOT NULL THEN
    NEW.days_to_sell = NEW.sell_date - NEW.purchase_date;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dealer_deals_calculated
  BEFORE INSERT OR UPDATE ON dealer_deals
  FOR EACH ROW
  EXECUTE FUNCTION update_dealer_deals_calculated();

-- Function to compute calibration for a dealer (run after they log 10+ outcomes)
CREATE OR REPLACE FUNCTION compute_dealer_calibration(dealer_user_id UUID)
RETURNS void AS $$
DECLARE
  v_sample_size INT;
  v_transport_mult NUMERIC;
  v_recon_mult NUMERIC;
  v_profit_accuracy NUMERIC;
  v_sell_accuracy NUMERIC;
  v_confidence NUMERIC;
  v_recent_avg_profit NUMERIC;
  v_recent_avg_roi NUMERIC;
  v_recent_win_rate NUMERIC;
BEGIN
  -- Count completed deals (purchased AND sold)
  SELECT COUNT(*) INTO v_sample_size
  FROM dealer_deals
  WHERE user_id = dealer_user_id 
    AND purchased = true 
    AND sold = true
    AND actual_profit IS NOT NULL;
  
  -- Need at least 10 outcomes to compute meaningful calibration
  IF v_sample_size < 10 THEN
    RETURN;
  END IF;
  
  -- Compute transport multiplier: avg(actual) / avg(estimated)
  SELECT 
    COALESCE(AVG(actual_transport) / NULLIF(AVG(platform_est_transport), 0), 1.0)
  INTO v_transport_mult
  FROM dealer_deals
  WHERE user_id = dealer_user_id
    AND actual_transport IS NOT NULL
    AND platform_est_transport IS NOT NULL
    AND platform_est_transport > 0;
  
  -- Compute recon multiplier
  SELECT 
    COALESCE(AVG(actual_recon) / NULLIF(AVG(platform_est_recon), 0), 1.0)
  INTO v_recon_mult
  FROM dealer_deals
  WHERE user_id = dealer_user_id
    AND actual_recon IS NOT NULL
    AND platform_est_recon IS NOT NULL
    AND platform_est_recon > 0;
  
  -- Compute profit accuracy: 100 - avg(abs(error) / actual * 100)
  SELECT 
    100 - AVG(ABS(platform_est_profit - actual_profit) / NULLIF(ABS(actual_profit), 0) * 100)
  INTO v_profit_accuracy
  FROM dealer_deals
  WHERE user_id = dealer_user_id
    AND platform_est_profit IS NOT NULL
    AND actual_profit IS NOT NULL
    AND actual_profit != 0;
  
  -- Compute sell price accuracy
  SELECT 
    100 - AVG(ABS(platform_est_sell - sell_price) / NULLIF(sell_price, 0) * 100)
  INTO v_sell_accuracy
  FROM dealer_deals
  WHERE user_id = dealer_user_id
    AND platform_est_sell IS NOT NULL
    AND sell_price IS NOT NULL
    AND sell_price > 0;
  
  -- Confidence score: based on sample size (logarithmic scale)
  -- 10 deals = 60%, 20 deals = 75%, 50 deals = 90%, 100+ deals = 95%
  v_confidence = LEAST(95, 50 + 15 * LOG(v_sample_size));
  
  -- Recent metrics (last 30 days)
  SELECT 
    AVG(actual_profit),
    AVG(actual_roi),
    (COUNT(*) FILTER (WHERE actual_profit > 0)::NUMERIC / NULLIF(COUNT(*), 0)) * 100
  INTO v_recent_avg_profit, v_recent_avg_roi, v_recent_win_rate
  FROM dealer_deals
  WHERE user_id = dealer_user_id
    AND sold = true
    AND sell_date >= CURRENT_DATE - INTERVAL '30 days';
  
  -- Upsert calibration
  INSERT INTO dealer_calibration (
    user_id,
    transport_multiplier,
    recon_multiplier,
    profit_accuracy_pct,
    sell_price_accuracy_pct,
    sample_size,
    confidence_score,
    recent_avg_profit,
    recent_avg_roi,
    recent_win_rate,
    last_updated,
    computed_at
  ) VALUES (
    dealer_user_id,
    v_transport_mult,
    v_recon_mult,
    v_profit_accuracy,
    v_sell_accuracy,
    v_sample_size,
    v_confidence,
    v_recent_avg_profit,
    v_recent_avg_roi,
    v_recent_win_rate,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    transport_multiplier = EXCLUDED.transport_multiplier,
    recon_multiplier = EXCLUDED.recon_multiplier,
    profit_accuracy_pct = EXCLUDED.profit_accuracy_pct,
    sell_price_accuracy_pct = EXCLUDED.sell_price_accuracy_pct,
    sample_size = EXCLUDED.sample_size,
    confidence_score = EXCLUDED.confidence_score,
    recent_avg_profit = EXCLUDED.recent_avg_profit,
    recent_avg_roi = EXCLUDED.recent_avg_roi,
    recent_win_rate = EXCLUDED.recent_win_rate,
    last_updated = NOW(),
    computed_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-compute calibration after a deal is marked as sold
CREATE OR REPLACE FUNCTION trigger_compute_calibration()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recompute if deal was just marked as sold
  IF NEW.sold = true AND (OLD.sold IS NULL OR OLD.sold = false) THEN
    PERFORM compute_dealer_calibration(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dealer_deals_calibration
  AFTER INSERT OR UPDATE ON dealer_deals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_compute_calibration();

-- Row Level Security (RLS)
ALTER TABLE dealer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dealer_calibration ENABLE ROW LEVEL SECURITY;

-- Dealers can only see their own data
CREATE POLICY dealer_profiles_policy ON dealer_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY dealer_deals_policy ON dealer_deals
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY dealer_calibration_policy ON dealer_calibration
  FOR SELECT USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE dealer_profiles IS 'Dealer business info and cost baselines - used as defaults in calculations';
COMMENT ON TABLE dealer_deals IS 'Outcome logging - what dealers actually paid/sold for. THE MOAT.';
COMMENT ON TABLE dealer_calibration IS 'Learned multipliers per dealer - makes predictions personalized and more accurate over time';
COMMENT ON FUNCTION compute_dealer_calibration IS 'Computes calibration multipliers for a dealer based on their logged outcomes. Run automatically when they log a sale.';
