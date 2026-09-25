-- Migration: Add dealer default settings columns
-- These columns store per-dealer defaults used in profit calculations

ALTER TABLE public.dealers 
  ADD COLUMN IF NOT EXISTS auction_fee_default numeric DEFAULT 450,
  ADD COLUMN IF NOT EXISTS recon_cost_default numeric DEFAULT 500,
  ADD COLUMN IF NOT EXISTS daily_floor_rate numeric DEFAULT 35,
  ADD COLUMN IF NOT EXISTS target_profit numeric DEFAULT 3500,
  ADD COLUMN IF NOT EXISTS home_state text DEFAULT 'CA',
  ADD COLUMN IF NOT EXISTS notify_price_drops boolean DEFAULT true;

-- Also add to user_profiles (created in 20260621000000_dealerhunt_pro_upgrade.sql)
-- IF NOT EXISTS guards make this idempotent
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS auction_fee_default numeric DEFAULT 450,
  ADD COLUMN IF NOT EXISTS recon_cost_default numeric DEFAULT 500,
  ADD COLUMN IF NOT EXISTS daily_floor_rate numeric DEFAULT 35,
  ADD COLUMN IF NOT EXISTS target_profit numeric DEFAULT 3500,
  ADD COLUMN IF NOT EXISTS notify_price_drops boolean DEFAULT true;
  -- Note: home_state already exists in user_profiles from the prior migration
