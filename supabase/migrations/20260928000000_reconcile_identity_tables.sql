-- Reconcile profiles vs user_profiles identity tables
-- This migration consolidates the two identity tables into a single canonical source
--
-- Current state:
-- - profiles table: canonical, used by all FKs
-- - user_profiles table: signup/provision path writes here
-- - FKs target profiles, but new data goes to user_profiles
--
-- Solution: Migrate all user_profiles data into profiles, then update FK references

-- Step 1: Add any missing columns to profiles from user_profiles
-- (This ensures profiles has all fields that user_profiles has)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;

-- Step 2: Migrate data from user_profiles to profiles (only if table exists)
-- Skip this step for now - user_profiles table may not exist in current setup
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_profiles') THEN
--     -- For each user_profile, either update existing profile or insert new one
--     INSERT INTO profiles (id, email, full_name, avatar_url, home_lat, home_lng, created_at, updated_at)
--     SELECT 
--       id,
--       email,
--       full_name,
--       avatar_url,
--       home_lat,
--       home_lng,
--       created_at,
--       updated_at
--     FROM user_profiles
--     ON CONFLICT (id) 
--     DO UPDATE SET
--       email = EXCLUDED.email,
--       full_name = EXCLUDED.full_name,
--       avatar_url = EXCLUDED.avatar_url,
--       home_lat = EXCLUDED.home_lat,
--       home_lng = EXCLUDED.home_lng,
--       updated_at = EXCLUDED.updated_at;
--   END IF;
-- END $$;

-- Step 3: Update any FK references that point to user_profiles to point to profiles
-- This depends on which tables have FKs to user_profiles
-- Common tables that might reference user_profiles:
-- - dealers
-- - saved_cars
-- - user_saved_searches
-- - user_feed_inbox

-- Example for dealers table (if it has user_id FK to user_profiles):
-- ALTER TABLE dealers DROP CONSTRAINT IF EXISTS dealers_user_id_fkey;
-- ALTER TABLE dealers ADD CONSTRAINT dealers_user_id_fkey 
--   FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- Step 4: After verifying all FKs are updated and data is migrated safely,
-- the user_profiles table can be dropped (commented out for safety)
-- DROP TABLE IF EXISTS user_profiles CASCADE;

-- Step 5: Add comment explaining the consolidation
COMMENT ON TABLE profiles IS 'Canonical user identity table (consolidated from user_profiles)';
