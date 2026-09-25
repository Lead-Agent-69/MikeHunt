-- Permanent photo hosting on Supabase Storage (Pro). Top-deal photos are downloaded once and served
-- from our own CDN — instant, no hotlink/proxy latency, immune to source expiry.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS images_cached BOOLEAN DEFAULT FALSE;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('vehicle-photos', 'vehicle-photos', true, 5242880)
ON CONFLICT (id) DO NOTHING;

-- Public read for the bucket; uploads happen via the service role (bypasses RLS).
DROP POLICY IF EXISTS "vehicle_photos_public_read" ON storage.objects;
CREATE POLICY "vehicle_photos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'vehicle-photos');
