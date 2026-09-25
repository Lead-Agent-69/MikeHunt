-- Performance indexes for common query patterns
-- Run this to speed up deal search, filtering, and sorting

-- Composite index for active deals with verdict (most common filter)
CREATE INDEX IF NOT EXISTS idx_deals_active_verdict 
  ON deals(active, deal_verdict) 
  WHERE active = true;

-- Index for make/model/year lookups (comparison queries)
CREATE INDEX IF NOT EXISTS idx_deals_make_model_year 
  ON deals(make, model, year)
  WHERE active = true;

-- Index for location-based filtering
CREATE INDEX IF NOT EXISTS idx_deals_location_state 
  ON deals(location_state) 
  WHERE active = true;

-- Index for sorting by profit (descending, most common sort)
CREATE INDEX IF NOT EXISTS idx_deals_profit_desc 
  ON deals(true_net_profit DESC NULLS LAST) 
  WHERE active = true;

-- Index for sorting by created_at (newest first)
CREATE INDEX IF NOT EXISTS idx_deals_created_desc 
  ON deals(created_at DESC);

-- Index for source filtering
CREATE INDEX IF NOT EXISTS idx_deals_source 
  ON deals(source) 
  WHERE active = true;

-- Index for price range queries
CREATE INDEX IF NOT EXISTS idx_deals_ask_price 
  ON deals(ask_price) 
  WHERE active = true AND ask_price > 0;

-- Index for score sorting
CREATE INDEX IF NOT EXISTS idx_deals_profit_score 
  ON deals(profit_score DESC NULLS LAST) 
  WHERE active = true;

-- Geographic search index (if PostGIS is being used)
CREATE INDEX IF NOT EXISTS idx_deals_geography 
  ON deals USING GIST (
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
  ) 
  WHERE active = true AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for user saved searches
CREATE INDEX IF NOT EXISTS idx_user_saved_searches_user_id 
  ON user_saved_searches(user_id) 
  WHERE active = true;

-- Index for market aggregates lookups
CREATE INDEX IF NOT EXISTS idx_market_aggregates_lookup 
  ON market_aggregates(make, model, year);

-- Analyze tables to update statistics
ANALYZE deals;
ANALYZE user_saved_searches;
ANALYZE market_aggregates;

-- Add comment explaining the indexes
COMMENT ON INDEX idx_deals_active_verdict IS 'Speeds up queries filtering by active status and verdict (GO/HOLD/PASS)';
COMMENT ON INDEX idx_deals_make_model_year IS 'Speeds up comparison queries and market value lookups';
COMMENT ON INDEX idx_deals_location_state IS 'Speeds up geographic filtering by state';
COMMENT ON INDEX idx_deals_profit_desc IS 'Speeds up sorting by profit (most profitable first)';
