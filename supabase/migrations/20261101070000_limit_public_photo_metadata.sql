-- Public vehicle photographs are served by their public URLs. Bucket listing is
-- an administrative operation, not part of the customer gallery contract.
-- Preserve authenticated object reads without permitting object.list or direct
-- metadata enumeration. Service-role photo maintenance continues to bypass RLS.
-- https://supabase.com/docs/guides/storage/security/access-control
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

DO $$
BEGIN
  IF to_regprocedure('storage.allow_any_operation(text[])') IS NULL THEN
    RAISE EXCEPTION 'Storage operation-aware policies require storage.allow_any_operation(text[])';
  END IF;
END
$$;

ALTER POLICY "vehicle_photos_public_read" ON storage.objects
  USING (
    bucket_id = 'vehicle-photos'
    AND storage.allow_any_operation(ARRAY[
      'object.get_authenticated',
      'object.get_authenticated_info'
    ])
  );

ALTER POLICY "Public deal photos are readable by everyone" ON storage.objects
  USING (
    bucket_id = 'deals-photos'
    AND storage.allow_any_operation(ARRAY[
      'object.get_authenticated',
      'object.get_authenticated_info'
    ])
  );

COMMIT;
