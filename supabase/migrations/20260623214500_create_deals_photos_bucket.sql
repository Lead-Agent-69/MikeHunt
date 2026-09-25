-- Create a storage bucket for permanent deal photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('deals-photos', 'deals-photos', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic'])
ON CONFLICT (id) DO NOTHING;

-- Policy: Publicly readable
CREATE POLICY "Public deal photos are readable by everyone" 
ON storage.objects FOR SELECT
USING ( bucket_id = 'deals-photos' );

-- Policy: Insertable by Service Role
CREATE POLICY "Service role can insert deal photos"
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'deals-photos' );

-- Policy: Updateable by Service Role
CREATE POLICY "Service role can update deal photos"
ON storage.objects FOR UPDATE
WITH CHECK ( bucket_id = 'deals-photos' );
