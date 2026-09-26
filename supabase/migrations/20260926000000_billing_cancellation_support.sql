-- Migration: Add plan_ended_at column to track subscription cancellations
-- Also adds admin role column if not present

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS plan_ended_at TIMESTAMPTZ DEFAULT NULL;

-- Add admin role support (if role column doesn't exist yet)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'support'));

-- Create index for admin dashboard user queries
CREATE INDEX IF NOT EXISTS idx_user_profiles_plan ON user_profiles(plan) WHERE plan IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_created ON user_profiles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_profiles_stripe_customer ON user_profiles(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Update Stripe webhook to handle subscription cancellations
-- The webhook now downgrades users to 'free' when a subscription is cancelled
-- This migration just ensures the schema supports it
