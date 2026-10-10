BEGIN;

-- No inferred permissions: grants are reviewed deployment inputs, not operator source selections.
CREATE TABLE public.source_access_grants (
  source_id text NOT NULL,
  host text NOT NULL CHECK (host = lower(host) AND host !~ '[/:*[:space:]]'),
  route text NOT NULL CHECK (route IN ('api', 'feed', 'website')),
  evidence text NOT NULL CHECK (evidence LIKE 'https://%'),
  reviewed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > reviewed_at),
  can_collect boolean NOT NULL DEFAULT false,
  can_display boolean NOT NULL DEFAULT false,
  can_derive boolean NOT NULL DEFAULT false,
  policy_revision text NOT NULL,
  PRIMARY KEY (source_id, host, route)
);
ALTER TABLE public.source_access_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY reviewed_grants_read ON public.source_access_grants FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.source_access_grants TO anon, authenticated;
GRANT ALL ON public.source_access_grants TO service_role;

CREATE FUNCTION public.inventory_access_allowed(listing_url text, intended_use text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.source_access_grants g
    WHERE g.host = regexp_replace(lower(substring(listing_url FROM '^https?://([^/?#:]+)')), '^www\.', '')
      AND g.reviewed_at <= now() AND g.expires_at > now()
      AND g.policy_revision = '2026-10-integrity-v1'
      AND CASE intended_use WHEN 'collect' THEN g.can_collect
        WHEN 'display' THEN g.can_display WHEN 'derive' THEN g.can_derive ELSE false END
  )
$$;
REVOKE EXECUTE ON FUNCTION public.inventory_access_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inventory_access_allowed(text, text) TO anon, authenticated, service_role;

ALTER TABLE public.deals ADD COLUMN access_hold boolean NOT NULL DEFAULT true;
ALTER TABLE public.sold_listings ADD COLUMN access_hold boolean NOT NULL DEFAULT true;
ALTER TABLE public.deals ADD COLUMN access_expires_at timestamptz;
ALTER TABLE public.sold_listings ADD COLUMN access_expires_at timestamptz;
CREATE INDEX deals_access_hold_idx ON public.deals (access_hold, active);
CREATE INDEX sold_access_hold_idx ON public.sold_listings (access_hold, sold_at);

-- Preserve records, but close the existing active/RPC path before any data is republished.
UPDATE public.deals SET active = false WHERE access_hold;
CREATE FUNCTION public.enforce_inventory_access() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.access_hold := NOT (public.inventory_access_allowed(NEW.source_url, 'collect')
    AND public.inventory_access_allowed(NEW.source_url, 'display'));
  SELECT min(g.expires_at) INTO NEW.access_expires_at FROM public.source_access_grants g
    WHERE g.host = regexp_replace(lower(substring(NEW.source_url FROM '^https?://([^/?#:]+)')), '^www\.', '')
      AND g.can_collect AND g.can_display AND g.reviewed_at <= now() AND g.expires_at > now();
  IF NEW.access_hold THEN NEW.active := false; END IF;
  IF NOT public.inventory_access_allowed(NEW.source_url, 'derive') THEN
    NEW.profit_score := NULL;
    NEW.true_net_profit := NULL;
    NEW.deal_verdict := NULL;
    NEW.recommended_max_bid := NULL;
    NEW.sell_estimate := NULL;
    NEW.deal_analysis := NULL;
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_inventory_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deals_access_guard BEFORE INSERT OR UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.enforce_inventory_access();

CREATE FUNCTION public.enforce_sold_access() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.access_hold := NOT (public.inventory_access_allowed(NEW.source_url, 'collect')
    AND public.inventory_access_allowed(NEW.source_url, 'derive'));
  SELECT min(g.expires_at) INTO NEW.access_expires_at FROM public.source_access_grants g
    WHERE g.host = regexp_replace(lower(substring(NEW.source_url FROM '^https?://([^/?#:]+)')), '^www\.', '')
      AND g.can_collect AND g.can_derive AND g.reviewed_at <= now() AND g.expires_at > now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_sold_access() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sold_access_guard BEFORE INSERT OR UPDATE ON public.sold_listings
FOR EACH ROW EXECUTE FUNCTION public.enforce_sold_access();

CREATE FUNCTION public.hold_inventory_on_grant_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.deals SET access_hold = true, active = false
    WHERE regexp_replace(lower(substring(source_url FROM '^https?://([^/?#:]+)')), '^www\.', '') = OLD.host;
  UPDATE public.sold_listings SET access_hold = true
    WHERE regexp_replace(lower(substring(source_url FROM '^https?://([^/?#:]+)')), '^www\.', '') = OLD.host;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.hold_inventory_on_grant_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER access_grant_change AFTER UPDATE OR DELETE ON public.source_access_grants
FOR EACH ROW EXECUTE FUNCTION public.hold_inventory_on_grant_change();

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sold_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY deals_permission_guard ON public.deals AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (NOT access_hold AND public.inventory_access_allowed(source_url, 'display'));
CREATE POLICY sold_permission_guard ON public.sold_listings AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (NOT access_hold AND public.inventory_access_allowed(source_url, 'derive'));

ALTER TABLE public.price_history ADD COLUMN provenance jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.scraper_runs ADD COLUMN outcome text;
ALTER TABLE public.scraper_runs ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.scrape_quarantine (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source text NOT NULL,
  fingerprint text NOT NULL UNIQUE,
  reason text NOT NULL,
  observation jsonb NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'reviewed', 'dismissed'))
);
CREATE INDEX scrape_quarantine_review_idx ON public.scrape_quarantine (status, last_seen_at);
ALTER TABLE public.scrape_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scrape_quarantine FROM anon, authenticated;
GRANT ALL ON public.scrape_quarantine TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.scrape_quarantine_id_seq TO service_role;

-- Keep legacy columns compatible; do not count policy/budget skips as qualifying failures.
CREATE OR REPLACE VIEW public.source_health WITH (security_invoker = true) AS
SELECT source,
  count(*) AS runs_7d,
  count(*) FILTER (WHERE status = 'success' AND deals_found > 0) AS ok_7d,
  round(avg(deals_found) FILTER (WHERE status = 'success')) AS avg_deals,
  max(started_at) AS last_run,
  max(started_at) FILTER (WHERE status = 'success' AND deals_found > 0) AS last_ok,
  (SELECT count(*) = 3 AND bool_and(NOT (r.status = 'success' AND coalesce(r.deals_found, 0) > 0)) FROM
    (SELECT status, deals_found FROM public.scraper_runs s2 WHERE s2.source = s.source
      AND s2.status <> 'running' AND coalesce(s2.outcome, '') NOT IN ('skipped', 'cancelled')
      ORDER BY started_at DESC LIMIT 3) r) AS last3_all_failed,
  (SELECT count(*) = 5 AND bool_and(NOT (r.status = 'success' AND coalesce(r.deals_found, 0) > 0)) FROM
    (SELECT status, deals_found FROM public.scraper_runs s2 WHERE s2.source = s.source
      AND s2.status <> 'running' AND coalesce(s2.outcome, '') NOT IN ('skipped', 'cancelled')
      ORDER BY started_at DESC LIMIT 5) r) AS last5_all_failed
FROM public.scraper_runs s WHERE started_at > now() - interval '7 days' GROUP BY source;
REVOKE SELECT ON public.source_health FROM anon, authenticated;

-- Retain source offers separately; group only compatible, valid VIN observations.
CREATE OR REPLACE FUNCTION public.detect_duplicates_by_vin(vin_filter text[] DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.deals SET duplicate_of_id = NULL, duplicate_confidence = NULL
    WHERE duplicate_confidence = 1 AND (vin_filter IS NULL OR vin = ANY(vin_filter));
  WITH compatible AS (
    SELECT id, first_value(id) OVER (
      PARTITION BY upper(trim(vin)), lower(trim(make)), lower(trim(model)), year
      ORDER BY created_at, id
    ) AS canonical_id
    FROM public.deals
    WHERE upper(trim(vin)) ~ '^[A-HJ-NPR-Z0-9]{17}$'
      AND nullif(trim(make), '') IS NOT NULL AND nullif(trim(model), '') IS NOT NULL AND year IS NOT NULL
      AND NOT access_hold AND access_expires_at > now()
      AND (vin_filter IS NULL OR vin = ANY(vin_filter))
  )
  UPDATE public.deals d SET duplicate_of_id = c.canonical_id, duplicate_confidence = 1
    FROM compatible c WHERE d.id = c.id AND c.id <> c.canonical_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.detect_duplicates_by_vin(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_duplicates_by_vin(text[]) TO service_role;

CREATE FUNCTION public.record_offer_price_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.access_hold OR NEW.ask_price IS NULL OR NEW.ask_price <= 0
    OR NOT public.inventory_access_allowed(NEW.source_url, 'derive') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.ask_price IS NOT DISTINCT FROM OLD.ask_price THEN RETURN NEW; END IF;
  END IF;
  INSERT INTO public.price_history (deal_id, price, observed_at, provenance)
    VALUES (NEW.id, NEW.ask_price, coalesce(NEW.updated_at, now()),
      jsonb_build_object('source', NEW.source, 'sourceId', NEW.source_deal_id,
        'url', NEW.source_url, 'policyRevision', '2026-10-integrity-v1',
        'priceKind', NEW.options->>'priceKind'));
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.record_offer_price_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER deals_price_change_receipt AFTER INSERT OR UPDATE OF ask_price ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.record_offer_price_change();
COMMIT;
