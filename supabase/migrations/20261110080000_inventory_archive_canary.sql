-- No scheduler or public RPC. An operator must verify the off-site ciphertext
-- before passing its checksum to the one-time canary.
CREATE SCHEMA inventory_archive;
REVOKE ALL ON SCHEMA inventory_archive FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA inventory_archive TO service_role;

CREATE TABLE inventory_archive.listings (
  deal_id uuid PRIMARY KEY,
  batch_id uuid NOT NULL,
  source text NOT NULL,
  source_deal_id text NOT NULL,
  UNIQUE (source, source_deal_id),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_sha256 text NOT NULL CHECK (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  last_seen_at timestamptz NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE inventory_archive.listings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inventory_archive.listings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON inventory_archive.listings TO service_role;
GRANT UPDATE (archived_at) ON inventory_archive.listings TO service_role;

CREATE FUNCTION inventory_archive.has_references(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  ref record;
  found_reference boolean;
BEGIN
  -- Discover inbound foreign keys so a new cascading or SET NULL reference
  -- automatically protects its listing. An unfamiliar FK shape fails closed.
  FOR ref IN
    SELECT c.conrelid, c.conkey, c.confkey, a.attname, target.attname AS target_name
    FROM pg_catalog.pg_constraint c
    LEFT JOIN pg_catalog.pg_attribute a
      ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    LEFT JOIN pg_catalog.pg_attribute target
      ON target.attrelid = c.confrelid AND target.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.deals'::regclass
  LOOP
    IF cardinality(ref.conkey) <> 1 OR cardinality(ref.confkey) <> 1
       OR ref.attname IS NULL OR ref.target_name IS DISTINCT FROM 'id' THEN
      RAISE EXCEPTION 'Unsupported listing foreign key';
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
                   ref.conrelid::regclass, ref.attname)
      INTO found_reference USING p_id;
    IF found_reference THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE FUNCTION inventory_archive.prepare_canary()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = ''
SET timezone = 'UTC' SET extra_float_digits = 3 AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(candidate) ORDER BY candidate.last_seen_at, candidate.id), '[]'::jsonb)
  FROM (
    SELECT d.* FROM public.deals d
    WHERE d.source IS NOT NULL AND d.source_deal_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM inventory_archive.listings a WHERE a.deal_id = d.id)
      AND d.last_seen_at < statement_timestamp() - interval '30 days'
      AND NOT inventory_archive.has_references(d.id)
    ORDER BY d.last_seen_at, d.id LIMIT 100
  ) candidate;
$$;

CREATE FUNCTION inventory_archive.commit_canary(
  p_batch uuid, p_ciphertext_sha256 text, p_rows jsonb
)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
SET lock_timeout = '2s' SET timezone = 'UTC' SET extra_float_digits = 3 AS $$
DECLARE
  listing record;
  expected jsonb;
  ids uuid[];
  locked_count integer := 0;
  removed integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed'
     OR current_setting('statement_timeout')::interval = interval '0'
     OR current_setting('statement_timeout')::interval > interval '30 seconds' THEN
    RAISE EXCEPTION 'Use read committed and a statement timeout of at most 30 seconds';
  END IF;
  IF p_batch IS NULL OR p_ciphertext_sha256 IS NULL
     OR p_ciphertext_sha256 !~ '^[0-9a-f]{64}$'
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) <> 100 THEN
    RAISE EXCEPTION 'Canary requires one verified batch of exactly 100 rows';
  END IF;
  SELECT array_agg(DISTINCT (r->>'id')::uuid) INTO ids
  FROM jsonb_array_elements(p_rows) r;
  IF cardinality(ids) <> 100 OR array_position(ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Canary row IDs must be present and distinct';
  END IF;

  -- The insert trigger takes the shared side before any upsert can wait on
  -- the live unique index. Acquire the exclusive side before locking rows.
  PERFORM pg_advisory_xact_lock(726513, 1);

  -- Serialize writes against the listing and FK-based saves, then recheck the
  -- complete row and all references under a fresh read-committed snapshot.
  FOR listing IN SELECT d.* FROM public.deals d WHERE d.id = ANY(ids) ORDER BY d.id FOR UPDATE LOOP
    locked_count := locked_count + 1;
    SELECT r INTO STRICT expected FROM jsonb_array_elements(p_rows) r
    WHERE (r->>'id')::uuid = listing.id;
    IF listing.last_seen_at IS NULL
       OR listing.last_seen_at >= statement_timestamp() - interval '30 days'
       OR to_jsonb(listing) IS DISTINCT FROM expected
       OR inventory_archive.has_references(listing.id) THEN
      RAISE EXCEPTION 'Canary eligibility changed';
    END IF;
    INSERT INTO inventory_archive.listings (deal_id, batch_id, source, source_deal_id, payload_sha256, ciphertext_sha256, last_seen_at)
    VALUES (listing.id, p_batch, listing.source::text, listing.source_deal_id, encode(sha256(convert_to(expected::text, 'UTF8')), 'hex'),
            p_ciphertext_sha256, listing.last_seen_at);
  END LOOP;
  IF locked_count <> 100 THEN RAISE EXCEPTION 'Canary listing missing'; END IF;

  DELETE FROM public.deals WHERE id = ANY(ids);
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed <> 100 THEN RAISE EXCEPTION 'Canary deletion count changed'; END IF;
  RETURN removed;
END;
$$;

CREATE FUNCTION inventory_archive.restore_listing(p_row jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
SET lock_timeout = '2s' SET timezone = 'UTC' SET extra_float_digits = 3 AS $$
DECLARE
  listing_id uuid := (p_row->>'id')::uuid;
  expected_hash text;
  columns text;
  restored jsonb;
BEGIN
  SELECT payload_sha256 INTO STRICT expected_hash
  FROM inventory_archive.listings WHERE deal_id = listing_id FOR UPDATE;
  IF encode(sha256(convert_to(p_row::text, 'UTF8')), 'hex') IS DISTINCT FROM expected_hash THEN
    RAISE EXCEPTION 'Archive row checksum mismatch';
  END IF;
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum) INTO columns
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.deals'::regclass AND attnum > 0 AND NOT attisdropped AND attgenerated = '';
  EXECUTE format(
    'INSERT INTO public.deals AS d (%1$s) OVERRIDING SYSTEM VALUE SELECT %1$s FROM jsonb_populate_record(NULL::public.deals, $1) RETURNING to_jsonb(d)',
    columns
  ) INTO STRICT restored USING p_row;
  IF restored IS DISTINCT FROM p_row THEN
    RAISE EXCEPTION 'Restored row differs from archived row';
  END IF;
  DELETE FROM inventory_archive.listings WHERE deal_id = listing_id;
  RETURN listing_id;
END;
$$;

CREATE FUNCTION inventory_archive.reuse_deal_id()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  original_id uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Listing insert requires read committed for archive identity lookup';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(726513, 1);
  SELECT a.deal_id INTO original_id FROM inventory_archive.listings a
  WHERE a.source = NEW.source::text AND a.source_deal_id = NEW.source_deal_id;
  IF original_id IS NOT NULL THEN NEW.id := original_id; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reuse_archived_deal_id
BEFORE INSERT ON public.deals
FOR EACH ROW EXECUTE FUNCTION inventory_archive.reuse_deal_id();

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA inventory_archive FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA inventory_archive TO service_role;
