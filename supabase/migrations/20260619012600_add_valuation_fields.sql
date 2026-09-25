-- Add AI Valuation fields to the listings table
alter table public.listings add column if not exists ai_wholesale_estimate integer;
alter table public.listings add column if not exists ai_retail_estimate integer;
alter table public.listings add column if not exists ai_rationale text;
alter table public.listings add column if not exists is_arbitrage_opportunity boolean default false;

-- Create an index to quickly find arbitrage opportunities
create index if not exists listings_arbitrage_idx on public.listings(is_arbitrage_opportunity) where is_arbitrage_opportunity = true;

-- Note: We also update the profit_estimate generation to use ai_wholesale_estimate if available, 
-- but since profit_estimate is a generated column, we'd need to drop and recreate it.
-- Instead, we will rely on the AI to calculate and update profit_score and profit_estimate directly in the worker.
