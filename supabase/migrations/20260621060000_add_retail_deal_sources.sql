-- Add retail/marketplace channels to the deal_source enum so multi-channel comps
-- (lib/scoring/market-value.ts) can distinguish retail vs wholesale/private supply.
-- 'craigslist_dealer' = Craigslist by-dealer section (real dealer asking prices, $0).
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'craigslist_dealer';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'carvana';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'truecar';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'vroom';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'offerup';
ALTER TYPE deal_source ADD VALUE IF NOT EXISTS 'acv';
