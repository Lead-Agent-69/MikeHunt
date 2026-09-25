-- Track whether a dealer has completed the setup wizard, so it shows once (not every login).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT false;
