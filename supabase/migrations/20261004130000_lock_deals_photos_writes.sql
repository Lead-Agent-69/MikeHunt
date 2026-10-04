-- The 20260623214500 policies were named for the service role but only checked
-- bucket_id, so the anon key could INSERT and UPDATE deals-photos.
-- service_role bypasses RLS and does not need a write policy. Public read stays,
-- matching vehicle-photos.

DROP POLICY IF EXISTS "Service role can insert deal photos" ON storage.objects;
DROP POLICY IF EXISTS "Service role can update deal photos" ON storage.objects;
